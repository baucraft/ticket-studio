import { randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as XLSX from "xlsx"
import { describe, expect, it } from "vitest"

import {
  createLcmdDemoBinding,
  createLcmdDemoSelectionReview,
  LCMD_DEMO_CARD_COUNT,
  LCMD_DEMO_CARD_HEADERS,
  LCMD_DEMO_PROCESS_COUNT,
  LCMD_DEMO_PROCESS_HEADERS,
  LCMD_DEMO_REBASELINE_BUILDINGS,
  LCMD_DEMO_REBASELINE_FLOORS,
  LCMD_DEMO_REBASELINE_SCOPE,
  validateLcmdDemoWorkbooks,
  writeLcmdDemoBinding,
  writeLcmdDemoSelectionReview,
} from "../scripts/lcmd-demo-xlsx-adapter"
import { TAG_ONLY_FIXTURE } from "@/lib/tag-only-target"

function workbookBytes(headers: readonly string[], rows: unknown[][], secondSheet = false) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([[...headers], ...rows]),
    "Sheet 1",
  )
  if (secondSheet) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["x"]]), "Extra")
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
}

function validSources() {
  const processClasses = [
    ["Unterputz ELT", "Elektro"],
    ["Verputzen", "Putz"],
    ["Steigleitung ELT", "Elektro"],
    ["Steigleitung HSL", "HLS"],
    ["TBW", "Trockenbau"],
    ["Estrich", "Estrich"],
    ["Naturstein", "Bodenleger"],
    ["Alutüren", "Türen"],
    ["Maler", "Maler"],
    ["Feininstallation ELT", "Elektro"],
    ["Feininstallation HLS", "HLS"],
    ["Feinreinigung", "Reinigung"],
    ["Schließzylinder", "Türen"],
  ] as const
  const processRows = Array.from({ length: LCMD_DEMO_PROCESS_COUNT }, (_, index) => {
    const areaIndex = Math.floor(index / processClasses.length)
    const processIndex = index % processClasses.length
    const building = LCMD_DEMO_REBASELINE_BUILDINGS[Math.floor(areaIndex / 5)]
    const floor = LCMD_DEMO_REBASELINE_FLOORS[areaIndex % 5]
    const [processName, trade] = processClasses[processIndex]
    const row = Array.from({ length: LCMD_DEMO_PROCESS_HEADERS.length }, () => null)
    row[0] = `P-${String(index + 1).padStart(3, "0")}`
    row[1] = processName
    row[2] = 46200 + index
    row[3] = 46201 + index
    row[7] = trade
    row[11] = building
    row[12] = floor
    row[13] = "Wohnung"
    row[14] = `${building}_${floor}_Wohnung`
    row[15] = `AREA-${areaIndex + 1}`
    row[16] = 26 + processIndex
    row[17] = 26 + processIndex
    return row
  })
  const cardRows = Array.from({ length: LCMD_DEMO_CARD_COUNT }, (_, index) => {
    const row = Array.from({ length: LCMD_DEMO_CARD_HEADERS.length }, () => null)
    row[0] = `C-${String(index + 1).padStart(3, "0")}`
    row[6] = `P-${String((index % LCMD_DEMO_PROCESS_COUNT) + 1).padStart(3, "0")}`
    return row
  })
  return {
    processRows,
    cardRows,
    processes: workbookBytes(LCMD_DEMO_PROCESS_HEADERS, processRows),
    cards: workbookBytes(LCMD_DEMO_CARD_HEADERS, cardRows),
  }
}

function validSelection() {
  const scopeIndexes = [0, 1, 3, 4, 5]
  return {
    schemaVersion: "demo-04-lcmd-selection-v1",
    sourceProjectId: "LOCAL-SYNTHETIC-PROJECT",
    bindings: Array.from({ length: 10 }, (_, areaIndex) =>
      scopeIndexes.map((processIndex) => areaIndex * 13 + processIndex + 1),
    )
      .flat()
      .map((sourceIndex, index) => ({
        demoActivityKey: `D04-${String(index + 1).padStart(3, "0")}`,
        sourceActivityId: `P-${String(sourceIndex).padStart(3, "0")}`,
      })),
  }
}

describe("DEMO-04 read-only LCMD XLSX adapter", () => {
  it("validates the pinned German schemas and binds only through an explicit 50-entry selection", () => {
    const { processes, cards } = validSources()
    const binding = createLcmdDemoBinding(processes, cards, validSelection(), {
      processes: "/private/original-smoke-processes.xlsx",
      cards: "/private/original-smoke-cards.xlsx",
    })

    expect(binding.contract.processRows).toBe(130)
    expect(binding.contract.cardRows).toBe(750)
    expect(binding.fixtureVersion).toBe(TAG_ONLY_FIXTURE.fixtureVersion)
    expect(binding.canonicalSource).toMatchObject({
      path: "src/data/demo-04-synthetic-activities.v1.json",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(binding.sourceFiles).toEqual({
      processes: {
        name: "original-smoke-processes.xlsx",
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      cards: {
        name: "original-smoke-cards.xlsx",
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    })
    expect(binding.bindings).toHaveLength(50)
    expect(LCMD_DEMO_REBASELINE_SCOPE).toHaveLength(5)
    expect(binding.bindings[0]).toEqual({
      demoActivityKey: "D04-001",
      sourceActivityId: "P-001",
      activeTagId: TAG_ONLY_FIXTURE.activities[0].activeTagId,
      doneTagId: TAG_ONLY_FIXTURE.activities[0].doneTagId,
    })
  })

  it("creates a local review list and an intentionally invalid empty selection template", () => {
    const { processes, cards } = validSources()
    const review = createLcmdDemoSelectionReview(processes, cards, {
      processes: "/private/original-smoke-processes.xlsx",
      cards: "/private/original-smoke-cards.xlsx",
    })
    expect(review.processes).toHaveLength(130)
    expect(review.processes[0]).toEqual({
      sourceActivityId: "P-001",
      processName: "Unterputz ELT",
      trade: "Elektro",
      areaLevel1: "Gebäude A",
      areaLevel2: "EG",
      areaLevel3: "Wohnung",
      areaPath: "Gebäude A_EG_Wohnung",
      sourceAreaId: "AREA-1",
      startDate: "2026-06-27",
      endDate: "2026-06-28",
      weekStart: 26,
      weekEnd: 26,
      cardCount: 6,
    })
    expect(review.selectionTemplate.bindings).toHaveLength(50)
    expect(review.selectionTemplate.bindings[0]).toEqual({
      demoActivityKey: "D04-001",
      sourceActivityId: "",
    })
    expect(() => createLcmdDemoBinding(processes, cards, review.selectionTemplate)).toThrow(
      /sourceProjectId/,
    )
  })

  it("rejects schema drift and multiple worksheets", () => {
    const { processRows, cards } = validSources()
    const driftedHeaders = [...LCMD_DEMO_PROCESS_HEADERS]
    ;[driftedHeaders[0], driftedHeaders[1]] = [driftedHeaders[1], driftedHeaders[0]]
    expect(() =>
      validateLcmdDemoWorkbooks(workbookBytes(driftedHeaders, processRows), cards),
    ).toThrow(/Spaltenfingerprint/)
    expect(() =>
      validateLcmdDemoWorkbooks(workbookBytes(LCMD_DEMO_PROCESS_HEADERS, processRows, true), cards),
    ).toThrow(/genau ein Arbeitsblatt/)
  })

  it("rejects non-XLSX and oversized input before workbook parsing", () => {
    const { cards } = validSources()
    expect(() => validateLcmdDemoWorkbooks(Buffer.from("not an xlsx"), cards)).toThrow(
      /XLSX-ZIP-Signatur/,
    )
    expect(() => validateLcmdDemoWorkbooks(new Uint8Array(5 * 1024 * 1024 + 1), cards)).toThrow(
      /XLSX-Groessenlimit/,
    )
  })

  it("rejects unexpected worksheet dimensions before row expansion", () => {
    const { processRows, cards } = validSources()
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([[...LCMD_DEMO_PROCESS_HEADERS], ...processRows])
    worksheet.A1000 = { t: "s", v: "unexpected" }
    worksheet["!ref"] = "A1:U1000"
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet 1")
    const processes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer
    expect(() => validateLcmdDemoWorkbooks(processes, cards)).toThrow(/Arbeitsblattdimensionen/)
  })

  it("rejects duplicate IDs and unresolved card references", () => {
    const { processRows, cardRows, processes } = validSources()
    const duplicateProcesses = structuredClone(processRows)
    duplicateProcesses[1][0] = duplicateProcesses[0][0]
    expect(() =>
      validateLcmdDemoWorkbooks(
        workbookBytes(LCMD_DEMO_PROCESS_HEADERS, duplicateProcesses),
        workbookBytes(LCMD_DEMO_CARD_HEADERS, cardRows),
      ),
    ).toThrow(/Doppelte Prozess-ID/)

    const unresolvedCards = structuredClone(cardRows)
    unresolvedCards[0][6] = "P-NOT-FOUND"
    expect(() =>
      validateLcmdDemoWorkbooks(processes, workbookBytes(LCMD_DEMO_CARD_HEADERS, unresolvedCards)),
    ).toThrow(/Nicht aufloesbare Prozess ID/)

    const duplicateCards = structuredClone(cardRows)
    duplicateCards[1][0] = duplicateCards[0][0]
    expect(() =>
      validateLcmdDemoWorkbooks(processes, workbookBytes(LCMD_DEMO_CARD_HEADERS, duplicateCards)),
    ).toThrow(/Doppelte Plankarten-ID/)
  })

  it("rejects deviations from the observed German demo semantics", () => {
    const { processRows, cards } = validSources()
    const additionalIdRows = structuredClone(processRows)
    additionalIdRows[0][20] = "unexpected"
    expect(() =>
      validateLcmdDemoWorkbooks(workbookBytes(LCMD_DEMO_PROCESS_HEADERS, additionalIdRows), cards),
    ).toThrow(/Zusätzliche ID muss leer/)

    const extraTradeRows = structuredClone(processRows)
    extraTradeRows[0][7] = "Gewerk 10"
    expect(() =>
      validateLcmdDemoWorkbooks(workbookBytes(LCMD_DEMO_PROCESS_HEADERS, extraTradeRows), cards),
    ).toThrow(/13 Prozessnamen und 9 Gewerke/)

    const invalidDates = structuredClone(processRows)
    invalidDates[0][3] = "2026-02-31"
    expect(() =>
      validateLcmdDemoWorkbooks(workbookBytes(LCMD_DEMO_PROCESS_HEADERS, invalidDates), cards),
    ).toThrow(/gueltiges Datum/)

    const reversedDates = structuredClone(processRows)
    reversedDates[0][2] = "2026-03-02"
    reversedDates[0][3] = "2026-03-01"
    expect(() =>
      validateLcmdDemoWorkbooks(workbookBytes(LCMD_DEMO_PROCESS_HEADERS, reversedDates), cards),
    ).toThrow(/endet vor dem Startdatum/)

    const workbook1904 = XLSX.utils.book_new()
    workbook1904.Workbook = { WBProps: { date1904: true } }
    XLSX.utils.book_append_sheet(
      workbook1904,
      XLSX.utils.aoa_to_sheet([[...LCMD_DEMO_PROCESS_HEADERS], ...processRows]),
      "Sheet 1",
    )
    expect(() =>
      validateLcmdDemoWorkbooks(
        XLSX.write(workbook1904, { type: "buffer", bookType: "xlsx" }) as Buffer,
        cards,
      ),
    ).toThrow(/Excel-1904-Datumssystem/)
  })

  it("rejects unsafe numeric IDs and implicit or incomplete selections", () => {
    const { processRows, processes, cards } = validSources()
    const unsafeRows = structuredClone(processRows)
    unsafeRows[0][0] = Number.MAX_SAFE_INTEGER + 1
    expect(() =>
      validateLcmdDemoWorkbooks(workbookBytes(LCMD_DEMO_PROCESS_HEADERS, unsafeRows), cards),
    ).toThrow(/sichere Ganzzahl/)

    const incomplete = validSelection()
    incomplete.bindings.pop()
    expect(() => createLcmdDemoBinding(processes, cards, incomplete)).toThrow(/exakt 50/)

    const duplicateSource = validSelection()
    duplicateSource.bindings[1].sourceActivityId = duplicateSource.bindings[0].sourceActivityId
    expect(() => createLcmdDemoBinding(processes, cards, duplicateSource)).toThrow(
      /Doppelte ausgewaehlte/,
    )

    const outsideScope = validSelection()
    outsideScope.bindings[0].sourceActivityId = "P-003"
    expect(() => createLcmdDemoBinding(processes, cards, outsideScope)).toThrow(
      /Rebaseline-Zuordnung/,
    )

    const permuted = validSelection()
    ;[permuted.bindings[0].sourceActivityId, permuted.bindings[1].sourceActivityId] = [
      permuted.bindings[1].sourceActivityId,
      permuted.bindings[0].sourceActivityId,
    ]
    expect(() => createLcmdDemoBinding(processes, cards, permuted)).toThrow(/Rebaseline-Zuordnung/)
  })

  it("writes only ignored .local files with exclusive creation and restrictive permissions", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-lcmd-demo-"))
    const { processes, cards } = validSources()
    const processesPath = join(root, "processes.xlsx")
    const cardsPath = join(root, "cards.xlsx")
    const selectionPath = join(root, "selection.json.local")
    const outputPath = join(process.cwd(), `.lcmd-demo-binding-${randomUUID()}.json.local`)
    const reviewPath = join(process.cwd(), `.lcmd-demo-review-${randomUUID()}.json.local`)
    try {
      await Promise.all([
        writeFile(processesPath, processes),
        writeFile(cardsPath, cards),
        writeFile(selectionPath, JSON.stringify(validSelection())),
      ])
      await Promise.all([
        chmod(processesPath, 0o600),
        chmod(cardsPath, 0o600),
        chmod(selectionPath, 0o600),
      ])
      await expect(
        writeLcmdDemoBinding({ processesPath, cardsPath, selectionPath, outputPath }),
      ).resolves.toBe(outputPath)
      const output = JSON.parse(await readFile(outputPath, "utf8"))
      expect(output.bindings).toHaveLength(50)
      expect((await stat(outputPath)).mode & 0o777).toBe(0o600)
      await expect(
        writeLcmdDemoBinding({ processesPath, cardsPath, selectionPath, outputPath }),
      ).rejects.toMatchObject({ code: "EEXIST" })
      await expect(
        writeLcmdDemoBinding({
          processesPath,
          cardsPath,
          selectionPath,
          outputPath: join(root, "binding.json"),
        }),
      ).rejects.toThrow(/\.local/)
      await expect(
        writeLcmdDemoSelectionReview({ processesPath, cardsPath, outputPath: reviewPath }),
      ).resolves.toBe(reviewPath)
      const review = JSON.parse(await readFile(reviewPath, "utf8"))
      expect(review.processes).toHaveLength(130)
      expect(
        review.selectionTemplate.bindings.every(
          (binding: { sourceActivityId: string }) => binding.sourceActivityId === "",
        ),
      ).toBe(true)
      expect((await stat(reviewPath)).mode & 0o777).toBe(0o600)
      await expect(
        writeLcmdDemoSelectionReview({ processesPath, cardsPath, outputPath: reviewPath }),
      ).rejects.toMatchObject({ code: "EEXIST" })
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outputPath, { force: true })
      await rm(reviewPath, { force: true })
    }
  })

  it("rejects local source files with group or foreign permissions", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-lcmd-permissions-"))
    const { processes, cards } = validSources()
    const processesPath = join(root, "processes.xlsx")
    const cardsPath = join(root, "cards.xlsx")
    try {
      await Promise.all([
        writeFile(processesPath, processes, { mode: 0o644 }),
        writeFile(cardsPath, cards, { mode: 0o600 }),
      ])
      await expect(
        writeLcmdDemoSelectionReview({
          processesPath,
          cardsPath,
          outputPath: join(root, "review.json.local"),
        }),
      ).rejects.toThrow(/Modus 0600/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("rejects a .local output that another Git repository does not ignore", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-lcmd-git-ignore-"))
    const repository = join(root, "repository")
    try {
      await mkdir(repository)
      execFileSync("git", ["init", "-q"], { cwd: repository })
      await expect(
        writeLcmdDemoBinding({
          processesPath: join(root, "unused-processes.xlsx"),
          cardsPath: join(root, "unused-cards.xlsx"),
          selectionPath: join(root, "selection.json.local"),
          outputPath: join(repository, "binding.json.local"),
        }),
      ).rejects.toThrow(/wird dort aber nicht ignoriert/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
