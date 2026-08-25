import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { PDFDict, PDFDocument, PDFName, PDFNumber } from "pdf-lib"
import { describe, expect, it } from "vitest"

import {
  createTagOnlyPrintPackage,
  createTagOnlyPrintPackageForTest,
  createTagOnlyCardPagesPdf,
  TAG_ONLY_A4_CARD_LAYOUT,
  TAG_ONLY_PRINT_FILES,
  writeTagOnlyPrintPackage,
  writeTagOnlyPrintPackageForTest,
} from "../scripts/tag-only-print-package"
import { verifyTagOnlyAssetsAgainstSource } from "../scripts/verify-tag-only-assets.mjs"
import {
  TAG_ONLY_BOARD_ID_MIN,
  TAG_ONLY_CARD_ID_MAX,
  TAG_ONLY_CANONICAL_SOURCE_PATH,
  TAG_ONLY_CANONICAL_SOURCE_SHA256,
  TAG_ONLY_FIXTURE,
  tagOnlyActivityKey,
  validateTagOnlyFixture,
  type TagOnlyFixture,
} from "@/lib/tag-only-target"

function mutableFixture() {
  return structuredClone(TAG_ONLY_FIXTURE)
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
    } else if (character === '"') quoted = true
    else if (character === ",") {
      row.push(field)
      field = ""
    } else if (character === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (character !== "\r") field += character
  }
  if (quoted || row.length > 0 || field) throw new Error("Malformed CSV fixture")
  const [headers, ...values] = rows
  return values.map((columns) =>
    Object.fromEntries(headers.map((header, index) => [header, columns[index]])),
  )
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

describe("DEMO-04 canonical 50-activity print contract", () => {
  it("uses exactly one versioned JSON source for all 50 activities", async () => {
    const source = JSON.parse(
      await readFile(
        new URL("../src/data/demo-04-synthetic-activities.v1.json", import.meta.url),
        "utf8",
      ),
    )
    expect(source).toEqual(TAG_ONLY_FIXTURE)
    expect(TAG_ONLY_FIXTURE.activities).toHaveLength(50)
    expect(TAG_ONLY_FIXTURE.activities.filter((activity) => activity.featured)).toHaveLength(8)
    expect(
      new Set(
        TAG_ONLY_FIXTURE.activities.flatMap((activity) => [
          activity.activeTagId,
          activity.doneTagId,
        ]),
      ).size,
    ).toBe(100)
  })

  it("keeps every pair adjacent, collision-free and outside all reserved ranges", () => {
    validateTagOnlyFixture(TAG_ONLY_FIXTURE)
    const ids = new Set<number>()
    for (const activity of TAG_ONLY_FIXTURE.activities) {
      expect(activity.activeTagId).toBe(2 * activity.markerSlot)
      expect(activity.activeTagId % 2).toBe(0)
      expect(activity.doneTagId).toBe(activity.activeTagId + 1)
      expect(activity.doneTagId % 2).toBe(1)
      expect(activity.doneTagId).toBeLessThanOrEqual(TAG_ONLY_CARD_ID_MAX)
      expect(activity.activeTagId).toBeLessThan(TAG_ONLY_BOARD_ID_MIN)
      expect(ids.has(activity.activeTagId)).toBe(false)
      expect(ids.has(activity.doneTagId)).toBe(false)
      ids.add(activity.activeTagId)
      ids.add(activity.doneTagId)
    }
    expect(
      TAG_ONLY_FIXTURE.activities
        .filter((activity) => !activity.featured)
        .map((activity) => activity.markerSlot)
        .sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 42 }, (_, index) => index + 100))
  })

  it("derives byte-identical packages in two separate directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-demo04-determinism-"))
    const firstDir = join(root, "first")
    const secondDir = join(root, "second")
    try {
      await writeTagOnlyPrintPackage(firstDir)
      await writeTagOnlyPrintPackage(secondDir)
      const filenames = (await readdir(firstDir)).sort()
      expect(filenames).toEqual(Object.values(TAG_ONLY_PRINT_FILES).sort())
      expect((await readdir(secondDir)).sort()).toEqual(filenames)
      for (const filename of filenames) {
        expect(await readFile(join(secondDir, filename))).toEqual(
          await readFile(join(firstDir, filename)),
        )
      }
      for (const directory of [firstDir, secondDir]) {
        expect(() =>
          execFileSync("sha256sum", ["-c", TAG_ONLY_PRINT_FILES.checksums], {
            cwd: directory,
            stdio: "pipe",
          }),
        ).not.toThrow()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  it("keeps every business value equal in JSON, CSV and board assignment", async () => {
    const generated = await createTagOnlyPrintPackage()
    const manifest = JSON.parse(new TextDecoder().decode(generated.manifestJson)) as {
      canonicalSource: { path: string; sha256: string }
      fixture: TagOnlyFixture
    }
    const csv = parseCsv(new TextDecoder().decode(generated.manifestCsv))
    const assignment = JSON.parse(new TextDecoder().decode(generated.boardAssignment)) as {
      canonicalSource: { path: string; sha256: string }
      sourceBinding: { state: string }
      physicalBoardCount: number
      mode: string
      sequence: Array<{
        order: number
        boardId: string
        boardMarkerId: number
        activities: TagOnlyFixture["activities"]
      }>
    }
    expect(manifest.canonicalSource).toEqual({
      path: TAG_ONLY_CANONICAL_SOURCE_PATH,
      sha256: TAG_ONLY_CANONICAL_SOURCE_SHA256,
    })
    expect(manifest.fixture).toEqual(TAG_ONLY_FIXTURE)
    expect(assignment.canonicalSource).toEqual(manifest.canonicalSource)
    expect(assignment.sourceBinding).toEqual({ state: "unbound" })
    expect(csv).toHaveLength(50)
    const csvByKey = new Map(csv.map((row) => [row.demoActivityKey, row]))
    for (const activity of TAG_ONLY_FIXTURE.activities) {
      const board = TAG_ONLY_FIXTURE.boards.find((item) => item.id === activity.boardId)!
      expect(csvByKey.get(tagOnlyActivityKey(activity))).toEqual({
        canonicalSourcePath: TAG_ONLY_CANONICAL_SOURCE_PATH,
        canonicalSourceSha256: TAG_ONLY_CANONICAL_SOURCE_SHA256,
        demoProjectKey: activity.demoProjectKey,
        demoActivityKey: activity.demoActivityKey,
        demoArea: activity.demoArea,
        sourceBindingState: activity.sourceBinding.state,
        boardId: activity.boardId,
        boardName: board.name,
        boardMarkerId: String(board.boardMarkerId),
        company: activity.company,
        trade: activity.trade,
        tradeColor: activity.tradeColor,
        tradeColorSource: activity.tradeColorSource,
        area: activity.area,
        week: activity.week,
        shortTarget: activity.shortTarget,
        fullTarget: activity.fullTarget,
        deviation: activity.deviation,
        markerSlot: String(activity.markerSlot),
        activeTagId: String(activity.activeTagId),
        doneTagId: String(activity.doneTagId),
        featured: String(activity.featured),
      })
    }
    expect(assignment.physicalBoardCount).toBe(1)
    expect(assignment.mode).toBe("sequential_logical_boards")
    expect(
      assignment.sequence.map((step) => [step.order, step.boardId, step.boardMarkerId]),
    ).toEqual(
      TAG_ONLY_FIXTURE.preflight.sequence.map((step) => [
        step.order,
        step.boardId,
        step.boardMarkerId,
      ]),
    )
    expect(assignment.sequence.flatMap((step) => step.activities)).toEqual(
      TAG_ONLY_FIXTURE.boards.flatMap((board) =>
        TAG_ONLY_FIXTURE.activities.filter((activity) => activity.boardId === board.id),
      ),
    )
  }, 20_000)

  it("creates nine A4 card pages containing exactly 50 cards at 120 x 66 mm", async () => {
    const generated = await createTagOnlyPrintPackage()
    const cardPages = await PDFDocument.load(await createTagOnlyCardPagesPdf())
    expect(cardPages.getPageCount()).toBe(50)
    for (const page of cardPages.getPages()) {
      expect(page.getWidth()).toBeCloseTo((66 * 72) / 25.4, 5)
      expect(page.getHeight()).toBeCloseTo((120 * 72) / 25.4, 5)
    }
    const cards = await PDFDocument.load(generated.cardsPdf)
    expect(cards.getSubject()).toContain(TAG_ONLY_CANONICAL_SOURCE_SHA256)
    expect(cards.getPageCount()).toBe(9)
    let cardCount = 0
    for (const [index, page] of cards.getPages().entries()) {
      expect(page.getWidth()).toBeCloseTo((210 * 72) / 25.4, 5)
      expect(page.getHeight()).toBeCloseTo((297 * 72) / 25.4, 5)
      const count = page.node.lookup(PDFName.of("Demo04CardCount"), PDFNumber).asNumber()
      expect(count).toBe(index < 8 ? 6 : 2)
      expect(page.node.lookup(PDFName.of("Demo04CardWidthMm"), PDFNumber).asNumber()).toBe(120)
      expect(page.node.lookup(PDFName.of("Demo04CardHeightMm"), PDFNumber).asNumber()).toBe(66)
      expect(page.node.Resources().lookup(PDFName.of("XObject"), PDFDict).keys()).toHaveLength(
        count,
      )
      cardCount += count
    }
    expect(cardCount).toBe(50)

    const calibration = await PDFDocument.load(generated.calibrationPdf)
    expect(calibration.getSubject()).toContain(TAG_ONLY_CANONICAL_SOURCE_SHA256)
    expect(calibration.getPageCount()).toBe(1)
    expect(calibration.getPage(0).getWidth()).toBeCloseTo((210 * 72) / 25.4, 5)
    expect(calibration.getPage(0).getHeight()).toBeCloseTo((297 * 72) / 25.4, 5)
    expect(
      calibration
        .getPage(0)
        .node.lookup(PDFName.of("Demo04CalibrationSheet"), PDFNumber)
        .asNumber(),
    ).toBe(1)
    expect(
      calibration
        .getPage(0)
        .node.lookup(PDFName.of("Demo04BoardMarkerCount"), PDFNumber)
        .asNumber(),
    ).toBe(3)
    for (const board of TAG_ONLY_FIXTURE.boards) {
      expect(
        calibration
          .getPage(0)
          .node.lookup(PDFName.of(`Demo04BoardMarker${board.boardMarkerId}`), PDFNumber)
          .asNumber(),
      ).toBe(1)
    }

    const horizontalGaps = TAG_ONLY_A4_CARD_LAYOUT.xPositionsMm
      .slice(1)
      .map(
        (position, index) =>
          position -
          TAG_ONLY_A4_CARD_LAYOUT.xPositionsMm[index] -
          TAG_ONLY_A4_CARD_LAYOUT.cardShortMm,
      )
    const verticalGap =
      TAG_ONLY_A4_CARD_LAYOUT.yPositionsMm[0] -
      TAG_ONLY_A4_CARD_LAYOUT.yPositionsMm[1] -
      TAG_ONLY_A4_CARD_LAYOUT.cardLongMm
    expect(horizontalGaps).toEqual([3, 3])
    expect(verticalGap).toBe(3)
    expect(Math.min(...horizontalGaps, verticalGap)).toBeGreaterThan(
      2 * TAG_ONLY_A4_CARD_LAYOUT.cropMarkMm,
    )
  }, 20_000)

  it("publishes checksums for every generated artifact", async () => {
    const generated = await createTagOnlyPrintPackage()
    const checksums = new TextDecoder().decode(generated.checksums).trim().split("\n")
    expect(checksums).toHaveLength(7)
    expect(checksums.map((line) => line.split("  ")[1]).sort()).toEqual(
      Object.entries(TAG_ONLY_PRINT_FILES)
        .filter(([key]) => key !== "checksums")
        .map(([, filename]) => filename)
        .sort(),
    )
    expect(checksums.some((line) => line.endsWith(`  ${TAG_ONLY_CANONICAL_SOURCE_PATH}`))).toBe(
      false,
    )
    const source = JSON.parse(new TextDecoder().decode(generated.source)) as {
      schemaVersion: string
      canonicalSource: { path: string; sha256: string }
      fixtureVersion: string
      sourceBinding: { state: string }
    }
    expect(source).toEqual({
      schemaVersion: "demo04-tag-only-source-v1",
      canonicalSource: {
        path: TAG_ONLY_CANONICAL_SOURCE_PATH,
        sha256: TAG_ONLY_CANONICAL_SOURCE_SHA256,
      },
      fixtureVersion: TAG_ONLY_FIXTURE.fixtureVersion,
      scope: TAG_ONLY_FIXTURE.scope,
      sourceBinding: { state: "unbound" },
    })
    expect(new TextDecoder().decode(generated.instructions)).toContain(
      `Kanonische Quelle SHA-256: ${TAG_ONLY_CANONICAL_SOURCE_SHA256}`,
    )
    const artifacts = {
      cardsPdf: generated.cardsPdf,
      calibrationPdf: generated.calibrationPdf,
      manifestJson: generated.manifestJson,
      manifestCsv: generated.manifestCsv,
      boardAssignment: generated.boardAssignment,
      instructions: generated.instructions,
      source: generated.source,
    }
    for (const [key, bytes] of Object.entries(artifacts)) {
      expect(checksums).toContain(
        `${sha256(bytes)}  ${TAG_ONLY_PRINT_FILES[key as keyof typeof artifacts]}`,
      )
    }
  }, 20_000)

  it.each([
    [
      "wrong activity count",
      (fixture: TagOnlyFixture) => {
        fixture.activities.pop()
      },
    ],
    [
      "duplicate demo key",
      (fixture: TagOnlyFixture) => {
        fixture.activities[1].demoActivityKey = fixture.activities[0].demoActivityKey
      },
    ],
    [
      "duplicate card pair",
      (fixture: TagOnlyFixture) => {
        fixture.activities[1].markerSlot = fixture.activities[0].markerSlot
        fixture.activities[1].activeTagId = fixture.activities[0].activeTagId
        fixture.activities[1].doneTagId = fixture.activities[0].doneTagId
      },
    ],
    [
      "reserved board IDs as card IDs",
      (fixture: TagOnlyFixture) => {
        fixture.activities[49].markerSlot = 31743
        fixture.activities[49].activeTagId = 63486
        fixture.activities[49].doneTagId = 63487
      },
    ],
  ])("fails closed for %s", async (_, mutate) => {
    const fixture = mutableFixture()
    mutate(fixture)
    await expect(createTagOnlyPrintPackageForTest(fixture)).rejects.toThrow()
  })

  it("removes staging output after missing assets and refuses existing output", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-demo04-failure-"))
    const emptyAssets = join(root, "empty-assets")
    const failedOutput = join(root, "failed")
    const existingOutput = join(root, "existing")
    await mkdir(emptyAssets)
    await mkdir(existingOutput)
    await writeFile(join(existingOutput, "keep.txt"), "keep")
    try {
      await expect(
        writeTagOnlyPrintPackageForTest(failedOutput, TAG_ONLY_FIXTURE, emptyAssets),
      ).rejects.toThrow()
      await expect(lstat(failedOutput)).rejects.toMatchObject({ code: "ENOENT" })
      expect((await readdir(root)).some((name) => name.startsWith(".failed.tmp-"))).toBe(false)
      await expect(writeTagOnlyPrintPackage(existingOutput)).rejects.toThrow("already exists")
      expect(await readFile(join(existingOutput, "keep.txt"), "utf8")).toBe("keep")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 20_000)

  it("rejects a structurally valid marker whose bytes do not match the pinned manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-demo04-tampered-assets-"))
    const copiedAssets = join(root, "assets")
    const canonicalAssets = fileURLToPath(new URL("../public/ana09c4", import.meta.url))
    try {
      await cp(canonicalAssets, copiedAssets, { recursive: true })
      const target = join(copiedAssets, "tagCircle49h12_id00200_card_active_18mm.svg")
      const replacement = await readFile(
        join(copiedAssets, "tagCircle49h12_id00202_card_active_18mm.svg"),
      )
      await writeFile(target, replacement)
      await expect(
        createTagOnlyPrintPackageForTest(TAG_ONLY_FIXTURE, copiedAssets),
      ).rejects.toThrow("SHA-256 mismatch")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("renders from the verified SVG snapshot instead of re-reading mutable files", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-demo04-verified-snapshot-"))
    const copiedAssets = join(root, "assets")
    const canonicalAssets = fileURLToPath(new URL("../public/ana09c4", import.meta.url))
    const fixtureBytes = await readFile(
      new URL("../src/data/demo-04-synthetic-activities.v1.json", import.meta.url),
    )
    try {
      await cp(canonicalAssets, copiedAssets, { recursive: true })
      const verified = verifyTagOnlyAssetsAgainstSource(copiedAssets, fixtureBytes)
      const filename = "tagCircle49h12_id00200_card_active_18mm.svg"
      const snapshot = verified.verifiedSvgBytes.get(filename)!
      await writeFile(join(copiedAssets, filename), "tampered after verification")
      expect(sha256(verified.verifiedSvgBytes.get(filename)!)).toBe(sha256(snapshot))
      expect(await readFile(join(copiedAssets, filename))).not.toEqual(snapshot)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("keeps fixture injection out of every production print API", () => {
    expect(createTagOnlyPrintPackage).toHaveLength(0)
    expect(createTagOnlyCardPagesPdf).toHaveLength(0)
    expect(writeTagOnlyPrintPackage).toHaveLength(1)
  })

  it("rejects a semantically changed same-version fixture against canonical assets", async () => {
    const fixture = mutableFixture()
    fixture.activities[0].shortTarget = "Manipulierter fachlicher Inhalt"
    await expect(createTagOnlyPrintPackageForTest(fixture)).rejects.toThrow("kanonischen DEMO-04")
  })

  it("serializes concurrent writes to one target without partial publication", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-demo04-concurrent-"))
    const output = join(root, "same-target")
    try {
      const results = await Promise.allSettled([
        writeTagOnlyPrintPackage(output),
        writeTagOnlyPrintPackage(output),
      ])
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
      expect((await readdir(output)).sort()).toEqual(Object.values(TAG_ONLY_PRINT_FILES).sort())
      expect(
        (await readdir(root)).filter(
          (name) => name.includes(".lock") || name.includes(".tmp-") || name.includes(".backup-"),
        ),
      ).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  it("replaces an existing print target only when explicitly requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-demo04-replace-"))
    const output = join(root, "replace-target")
    try {
      await mkdir(output)
      await writeFile(join(output, "old.txt"), "old package")
      await expect(writeTagOnlyPrintPackage(output)).rejects.toThrow("already exists")
      expect(await readFile(join(output, "old.txt"), "utf8")).toBe("old package")

      await writeTagOnlyPrintPackage(output, { replace: true })
      expect((await readdir(output)).sort()).toEqual(Object.values(TAG_ONLY_PRINT_FILES).sort())
      await expect(lstat(join(output, "old.txt"))).rejects.toMatchObject({ code: "ENOENT" })
      expect((await readdir(root)).filter((name) => name.includes("replace-target"))).toEqual([
        "replace-target",
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 20_000)
})
