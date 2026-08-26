import { randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as XLSX from "xlsx"
import { describe, expect, it } from "vitest"

import {
  ANA09D_BOARD_HEADERS,
  ANA09D_CARD_HEADERS,
  ANA09D_MANIFEST_HEADERS,
  generateAna09dPilotManifest,
  validateAna09dBoardScopes,
  validateAna09dPilotBinding,
  writeAna09dPilotManifest,
  type Ana09dBoardScopes,
} from "../scripts/ana09d-pilot-manifest"
import {
  LCMD_DEMO_CARD_COUNT,
  LCMD_DEMO_CARD_HEADERS,
  LCMD_DEMO_PROCESS_COUNT,
  LCMD_DEMO_PROCESS_HEADERS,
  type LcmdDemoBinding,
} from "../scripts/lcmd-demo-xlsx-adapter"
import {
  TAG_ONLY_ASSET_MANIFEST_SHA256,
  TAG_ONLY_CANONICAL_SOURCE_PATH,
  TAG_ONLY_CANONICAL_SOURCE_SHA256,
  TAG_ONLY_FIXTURE,
} from "@/lib/tag-only-target"

function validBinding(): LcmdDemoBinding {
  return {
    schemaVersion: "demo-04-lcmd-binding-v1",
    scope: "local_read_only_demo_binding",
    qualification: "DEMONSTRATOR / KEINE PRODUKTIONSFREIGABE",
    fixtureVersion: TAG_ONLY_FIXTURE.fixtureVersion,
    canonicalSource: {
      path: TAG_ONLY_CANONICAL_SOURCE_PATH,
      sha256: TAG_ONLY_CANONICAL_SOURCE_SHA256,
    },
    sourceProjectId: "PRIVATE-PILOT-PROJECT",
    sourceFiles: {
      processes: { name: "private-processes.xlsx", sha256: "1".repeat(64) },
      cards: { name: "private-cards.xlsx", sha256: "2".repeat(64) },
    },
    contract: {
      processRows: LCMD_DEMO_PROCESS_COUNT,
      cardRows: LCMD_DEMO_CARD_COUNT,
      processHeaders: LCMD_DEMO_PROCESS_HEADERS,
      cardHeaders: LCMD_DEMO_CARD_HEADERS,
    },
    bindings: TAG_ONLY_FIXTURE.activities.map((activity, index) => ({
      demoActivityKey: activity.demoActivityKey,
      sourceActivityId: `PRIVATE-SOURCE-${String(index + 1).padStart(3, "0")}`,
      activeTagId: activity.activeTagId,
      doneTagId: activity.doneTagId,
    })),
  }
}

function validScopes(): Ana09dBoardScopes {
  return Object.fromEntries(
    TAG_ONLY_FIXTURE.boards.map((board) => [
      board.id,
      {
        scopeType: "area",
        scopeLabel: board.name,
        scopeFilter: { demoArea: board.demoArea, area: board.area },
      },
    ]),
  )
}

function rows(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][]
}

describe("ANA-09D canonical pilot manifest", () => {
  it("emits the exact deterministic three-sheet contract in fixture order", () => {
    const binding = validBinding()
    const scopes = validScopes()
    scopes["board-nord-a"].scopeFilter = {
      z: [{ second: 2, first: 1 }],
      a: "first",
    }
    const first = Buffer.from(generateAna09dPilotManifest(binding, scopes))
    const second = Buffer.from(generateAna09dPilotManifest(binding, scopes))
    expect(first.equals(second)).toBe(true)

    const workbook = XLSX.read(first, { type: "buffer", raw: true, bookVBA: true, bookFiles: true })
    expect(workbook.SheetNames).toEqual(["Manifest", "Boards", "Cards"])
    expect(workbook.Sheets.Manifest["!ref"]).toBe("A1:B20")
    expect(workbook.Sheets.Boards["!ref"]).toBe("A1:F4")
    expect(workbook.Sheets.Cards["!ref"]).toBe("A1:M51")

    const manifestRows = rows(workbook, "Manifest")
    const boardRows = rows(workbook, "Boards")
    const cardRows = rows(workbook, "Cards")
    expect(manifestRows[0]).toEqual(ANA09D_MANIFEST_HEADERS)
    expect(boardRows[0]).toEqual(ANA09D_BOARD_HEADERS)
    expect(cardRows[0]).toEqual(ANA09D_CARD_HEADERS)
    expect(manifestRows.slice(1)).toEqual([
      ["schemaVersion", "ana09d-pilot-manifest-v1"],
      ["manifestId", "demo-04-pilot"],
      ["revision", 1],
      ["qualification", "G4_CONTROLLED_READ_ONLY"],
      ["projectId", "demo-04-pilot"],
      ["projectName", TAG_ONLY_FIXTURE.demoProjects[0].name],
      ["sourceProjectId", binding.sourceProjectId],
      ["family", "tagCircle49h12"],
      ["layoutVersion", "tag-only-card-v1-18mm"],
      ["statusContract", "two-explicit-ids"],
      ["canonicalSourceSha256", TAG_ONLY_CANONICAL_SOURCE_SHA256],
      ["assetManifestSha256", TAG_ONLY_ASSET_MANIFEST_SHA256],
      ["processSourceSha256", binding.sourceFiles.processes.sha256],
      ["cardSourceSha256", binding.sourceFiles.cards.sha256],
      ["tagAssignment", "audited_pre_reserved_demo_pairs"],
      ["featureDefault", "disabled"],
      ["physicalBoardCount", 1],
      ["maxAttempts", 3],
      ["maxCardsPerBoard", 100],
    ])
    expect(boardRows).toHaveLength(4)
    expect(boardRows[1]).toEqual([
      "board-nord-a",
      TAG_ONLY_FIXTURE.boards[0].name,
      63486,
      "area",
      TAG_ONLY_FIXTURE.boards[0].name,
      '{"a":"first","z":[{"first":1,"second":2}]}',
    ])
    expect(boardRows.slice(1).map((row) => row[0])).toEqual(
      TAG_ONLY_FIXTURE.preflight.sequence.map((step) => step.boardId),
    )
    expect(cardRows).toHaveLength(51)
    expect(cardRows[1]).toEqual([
      "D04-001",
      "D04-001",
      binding.sourceProjectId,
      binding.bindings[0].sourceActivityId,
      TAG_ONLY_FIXTURE.activities[0].boardId,
      "active",
      TAG_ONLY_FIXTURE.activities[0].activeTagId,
      TAG_ONLY_FIXTURE.activities[0].doneTagId,
      TAG_ONLY_FIXTURE.activities[0].company,
      TAG_ONLY_FIXTURE.activities[0].trade,
      TAG_ONLY_FIXTURE.activities[0].area,
      TAG_ONLY_FIXTURE.activities[0].fullTarget,
      TAG_ONLY_FIXTURE.activities[0].week,
    ])
    expect(cardRows.slice(1).map((row) => row[0])).toEqual(
      TAG_ONLY_FIXTURE.activities.map((activity) => activity.demoActivityKey),
    )
    expect(cardRows.slice(1).map((row) => [row[6], row[7]])).toEqual(
      TAG_ONLY_FIXTURE.activities.map((activity) => [activity.activeTagId, activity.doneTagId]),
    )
    expect(cardRows.slice(1).map((row) => row[3])).toEqual(
      binding.bindings.map((entry) => entry.sourceActivityId),
    )
    expect([...manifestRows, ...boardRows, ...cardRows].flat()).not.toContain(
      binding.sourceFiles.processes.name,
    )
    expect([...manifestRows, ...boardRows, ...cardRows].flat()).not.toContain(
      binding.sourceFiles.cards.name,
    )
  })

  it("contains no formulas, links, macros, hidden sheets, dates, or extra package parts", () => {
    const bytes = generateAna09dPilotManifest(validBinding(), validScopes())
    const workbook = XLSX.read(bytes, { type: "buffer", raw: true, bookVBA: true, bookFiles: true })
    expect(workbook.vbaraw).toBeUndefined()
    expect(workbook.Workbook?.Sheets?.every((sheet) => !sheet.Hidden)).toBe(true)
    expect(workbook.Workbook?.Names ?? []).toEqual([])
    for (const sheetName of workbook.SheetNames) {
      for (const [address, cell] of Object.entries(workbook.Sheets[sheetName])) {
        if (address.startsWith("!")) continue
        expect(cell).not.toHaveProperty("f")
        expect(cell).not.toHaveProperty("F")
        expect(cell).not.toHaveProperty("l")
        expect(["s", "n"]).toContain(cell.t)
        if (cell.t === "n") expect(Number.isSafeInteger(cell.v)).toBe(true)
        expect(cell.t).not.toBe("d")
      }
    }
    const packageFiles = Object.keys(
      (workbook as XLSX.WorkBook & { files?: Record<string, unknown> }).files ?? {},
    )
    expect(packageFiles.some((name) => /externalLinks|vbaProject\.bin/i.test(name))).toBe(false)
  })

  it("strictly rejects modified, duplicate, incomplete, and non-canonical bindings", () => {
    const modified = structuredClone(validBinding())
    modified.bindings[0].activeTagId = 2
    expect(() => validateAna09dPilotBinding(modified)).toThrow(/audited tag pair/)

    const duplicateKey = structuredClone(validBinding())
    duplicateKey.bindings[1].demoActivityKey = duplicateKey.bindings[0].demoActivityKey
    expect(() => validateAna09dPilotBinding(duplicateKey)).toThrow(/duplicate D04 key/)

    const duplicateSource = structuredClone(validBinding())
    duplicateSource.bindings[1].sourceActivityId = duplicateSource.bindings[0].sourceActivityId
    expect(() => validateAna09dPilotBinding(duplicateSource)).toThrow(/duplicate source ID/)

    const missing = structuredClone(validBinding()) as unknown as { bindings: unknown[] }
    missing.bindings.pop()
    expect(() => validateAna09dPilotBinding(missing)).toThrow(/exactly 50/)

    const drifted = structuredClone(validBinding())
    drifted.fixtureVersion = "modified"
    expect(() => validateAna09dPilotBinding(drifted)).toThrow(/non-canonical contract header/)

    const extra = { ...validBinding(), unexpected: true }
    expect(() => validateAna09dPilotBinding(extra)).toThrow(/unexpected or missing fields/)
  })

  it("requires exact canonical scopes and finite canonical JSON values", () => {
    const missing = validScopes()
    delete missing["board-sued-a"]
    expect(() => validateAna09dBoardScopes(missing)).toThrow(/exactly the three/)

    const extra = { ...validScopes(), "board-extra": validScopes()["board-nord-a"] }
    expect(() => validateAna09dBoardScopes(extra)).toThrow(/exactly the three/)

    const arrayValue = [
      ["board-nord-a", validScopes()["board-nord-a"]],
      ["board-nord-a", validScopes()["board-nord-b"]],
      ["board-sued-a", validScopes()["board-sued-a"]],
    ]
    expect(() => validateAna09dBoardScopes(arrayValue)).toThrow(/object keyed by board ID/)

    const invalid = validScopes()
    invalid["board-nord-a"].scopeFilter = { invalid: Number.NaN }
    expect(() => validateAna09dBoardScopes(invalid)).toThrow(/finite JSON values/)

    const fractional = validScopes()
    fractional["board-nord-a"].scopeFilter = { invalid: 1e-7 }
    expect(() => validateAna09dBoardScopes(fractional)).toThrow(/finite JSON values/)

    const nonPortableKey = validScopes()
    nonPortableKey["board-nord-a"].scopeFilter = { "key-😀": "value" }
    expect(() => validateAna09dBoardScopes(nonPortableKey)).toThrow(/non-portable object key/)
  })

  it("writes only private ignored inputs and an exclusive 0600 .local.xlsx output", async () => {
    const bindingPath = join(process.cwd(), `.ana09d-binding-${randomUUID()}.json.local`)
    const scopesPath = join(process.cwd(), `.ana09d-scopes-${randomUUID()}.json.local`)
    const outputPath = join(process.cwd(), `.ana09d-manifest-${randomUUID()}.local.xlsx`)
    try {
      await Promise.all([
        writeFile(bindingPath, JSON.stringify(validBinding()), { mode: 0o600 }),
        writeFile(scopesPath, JSON.stringify(validScopes()), { mode: 0o600 }),
      ])
      await expect(writeAna09dPilotManifest({ bindingPath, scopesPath, outputPath })).resolves.toBe(
        outputPath,
      )
      expect((await stat(outputPath)).mode & 0o777).toBe(0o600)
      expect(XLSX.read(await readFile(outputPath)).SheetNames).toEqual([
        "Manifest",
        "Boards",
        "Cards",
      ])
      await expect(
        writeAna09dPilotManifest({ bindingPath, scopesPath, outputPath }),
      ).rejects.toMatchObject({ code: "EEXIST" })
    } finally {
      await Promise.all([
        rm(bindingPath, { force: true }),
        rm(scopesPath, { force: true }),
        rm(outputPath, { force: true }),
      ])
    }
  })

  it("rejects non-private inputs, wrong suffixes, and output paths not ignored by Git", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-ana09d-"))
    const repository = join(root, "repository")
    const bindingPath = join(root, "binding.json.local")
    const scopesPath = join(root, "scopes.json.local")
    try {
      await mkdir(repository)
      execFileSync("git", ["init", "-q"], { cwd: repository })
      await Promise.all([
        writeFile(bindingPath, JSON.stringify(validBinding()), { mode: 0o600 }),
        writeFile(scopesPath, JSON.stringify(validScopes()), { mode: 0o600 }),
      ])
      await chmod(bindingPath, 0o644)
      await expect(
        writeAna09dPilotManifest({
          bindingPath,
          scopesPath,
          outputPath: join(root, "manifest.local.xlsx"),
        }),
      ).rejects.toThrow(/Modus 0600/)
      await chmod(bindingPath, 0o600)
      await expect(
        writeAna09dPilotManifest({
          bindingPath,
          scopesPath,
          outputPath: join(root, "manifest.xlsx"),
        }),
      ).rejects.toThrow(/\.local\.xlsx/)
      await expect(
        writeAna09dPilotManifest({
          bindingPath,
          scopesPath,
          outputPath: join(repository, "manifest.local.xlsx"),
        }),
      ).rejects.toThrow(/wird dort aber nicht ignoriert/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
