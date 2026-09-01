import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { lstat, open, readFile, rm } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import * as XLSX from "../public/vendor/xlsx-0.20.3.mjs"

import {
  TAG_ONLY_CANONICAL_SOURCE_PATH,
  TAG_ONLY_CANONICAL_SOURCE_SHA256,
  TAG_ONLY_FIXTURE,
  validateTagOnlyFixture,
} from "../src/lib/tag-only-target"

export const LCMD_DEMO_PROCESS_HEADERS = [
  "Id",
  "Prozessname",
  "Startdatum",
  "Enddatum",
  "Status",
  "Status Text",
  "Dauer",
  "Gewerk",
  "Gewerk Hintergrundfarbe",
  "Vorgänger",
  "Nachfolger",
  "Bereich Ebene 1",
  "Bereich Ebene 2",
  "Bereich Ebene 3",
  "Bereichspfad",
  "Bereiche ID",
  "KW Start",
  "KW Ende",
  "Kommentare",
  "Verantwortlicher",
  "Zusätzliche ID",
] as const

export const LCMD_DEMO_CARD_HEADERS = [
  "Id",
  "Bereich Ebene 1",
  "Bereich Ebene 2",
  "Bereich Ebene 3",
  "Datum",
  "Prozessname",
  "Prozess ID",
  "Aufgabe",
  "Status",
  "Beschreibung",
  "Gewerk",
  "Gewerk Beschreibung",
  "Arbeitskräfte",
  "Status zuletzt aktualisiert",
  "Verantwortlicher",
] as const

export const LCMD_DEMO_PROCESS_COUNT = 130
export const LCMD_DEMO_CARD_COUNT = 750
export const LCMD_DEMO_REBASELINE_SCOPE = [
  { processName: "Unterputz ELT", trade: "Elektro", demoColor: "#92400e" },
  { processName: "Verputzen", trade: "Putz", demoColor: "#475569" },
  { processName: "Steigleitung HSL", trade: "HLS", demoColor: "#b91c1c" },
  { processName: "TBW", trade: "Trockenbau", demoColor: "#1d4ed8" },
  { processName: "Estrich", trade: "Estrich", demoColor: "#047857" },
] as const
export const LCMD_DEMO_REBASELINE_BUILDINGS = ["Gebäude A", "Gebäude B"] as const
export const LCMD_DEMO_REBASELINE_FLOORS = ["EG", "1.OG", "2.OG", "3.OG", "4.OG"] as const

const MAX_XLSX_BYTES = 5 * 1024 * 1024
const execFileAsync = promisify(execFile)

const DEMO_KEYS = Array.from(
  { length: 50 },
  (_, index) => `D04-${String(index + 1).padStart(3, "0")}`,
)

type WorkbookContract = {
  processIds: Set<string>
  cardIds: Set<string>
  processIdsWithCards: Set<string>
  processes: Array<{
    sourceActivityId: string
    processName: string
    trade: string
    areaLevel1: string
    areaLevel2: string
    areaLevel3: string
    areaPath: string
    sourceAreaId: string
    startDate: string
    endDate: string
    weekStart: number
    weekEnd: number
    cardCount: number
  }>
}

type SelectionBinding = {
  demoActivityKey: string
  sourceActivityId: string
}

export type LcmdDemoSelection = {
  schemaVersion: "demo-04-lcmd-selection-v1"
  sourceProjectId: string
  bindings: SelectionBinding[]
}

export type LcmdDemoBinding = {
  schemaVersion: "demo-04-lcmd-binding-v1"
  scope: "local_read_only_demo_binding"
  qualification: "DEMONSTRATOR / KEINE PRODUKTIONSFREIGABE"
  fixtureVersion: string
  canonicalSource: { path: string; sha256: string }
  sourceProjectId: string
  sourceFiles: {
    processes: { name: string; sha256: string }
    cards: { name: string; sha256: string }
  }
  contract: {
    processRows: number
    cardRows: number
    processHeaders: readonly string[]
    cardHeaders: readonly string[]
  }
  bindings: Array<{
    demoActivityKey: string
    sourceActivityId: string
    activeTagId: number
    doneTagId: number
  }>
}

export type LcmdDemoSelectionReview = {
  schemaVersion: "demo-04-lcmd-selection-review-v1"
  qualification: "LOCAL REVIEW / KEINE BINDUNG / KEINE PRODUKTIONSFREIGABE"
  sourceFiles: { processes: string; cards: string }
  processes: WorkbookContract["processes"]
  selectionTemplate: {
    schemaVersion: "demo-04-lcmd-selection-v1"
    sourceProjectId: ""
    bindings: Array<{ demoActivityKey: string; sourceActivityId: "" }>
  }
}

function normalizeOpaqueId(value: unknown, location: string): string {
  if (typeof value === "string") {
    const normalized = value.trim()
    if (normalized) return normalized
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value)
  throw new Error(`${location} muss eine nichtleere opake String-ID oder sichere Ganzzahl sein.`)
}

function requiredText(value: unknown, location: string): string {
  if (typeof value === "string" && value.trim()) return value.trim()
  throw new Error(`${location} muss belegt sein.`)
}

function requiredInteger(value: unknown, location: string): number {
  const normalized = typeof value === "string" && value.trim() ? Number(value.trim()) : value
  if (typeof normalized === "number" && Number.isSafeInteger(normalized)) return normalized
  throw new Error(`${location} muss eine sichere Ganzzahl sein.`)
}

function dateOnly(value: unknown, location: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const wholeDays = Math.floor(value)
    const date = new Date(Date.UTC(1899, 11, 30) + wholeDays * 24 * 60 * 60 * 1000)
    if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 10)
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === "string") {
    const normalized = value.trim()
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match) {
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
      if (date.toISOString().slice(0, 10) === normalized) return normalized
    }
  }
  throw new Error(`${location} muss ein gueltiges Datum sein.`)
}

function hasExactFields(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return (
    actual.length === expected.length &&
    actual.every((field, index) => field === [...expected].sort()[index])
  )
}

function readRows(
  bytes: Uint8Array,
  label: string,
  expectedHeaders: readonly string[],
  expectedRows: number,
): unknown[][] {
  if (bytes.byteLength < 4 || bytes.byteLength > MAX_XLSX_BYTES) {
    throw new Error(`${label} liegt ausserhalb des erlaubten XLSX-Groessenlimits.`)
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error(`${label} besitzt keine XLSX-ZIP-Signatur.`)
  }
  const workbook = XLSX.read(bytes, { type: "array", raw: true })
  if (workbook.Workbook?.WBProps?.date1904) {
    throw new Error(`${label} verwendet das nicht freigegebene Excel-1904-Datumssystem.`)
  }
  if (workbook.SheetNames.length !== 1) {
    throw new Error(`${label} muss genau ein Arbeitsblatt enthalten.`)
  }
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!worksheet) throw new Error(`${label} enthaelt kein lesbares Arbeitsblatt.`)
  const rangeValue = worksheet["!ref"]
  if (typeof rangeValue !== "string") {
    throw new Error(`${label} besitzt keinen gueltigen Arbeitsblattbereich.`)
  }
  const range = XLSX.utils.decode_range(rangeValue)
  if (
    range.s.r !== 0 ||
    range.s.c !== 0 ||
    range.e.r !== expectedRows ||
    range.e.c !== expectedHeaders.length - 1
  ) {
    throw new Error(`${label} besitzt nicht die erwarteten Arbeitsblattdimensionen.`)
  }
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true,
  }) as unknown[][]
  const headers = rows[0] ?? []
  if (
    headers.length !== expectedHeaders.length ||
    headers.some((header, index) => header !== expectedHeaders[index])
  ) {
    throw new Error(`${label} entspricht nicht dem geordneten deutschen Spaltenfingerprint.`)
  }
  const dataRows = rows.slice(1)
  if (dataRows.length !== expectedRows) {
    throw new Error(`${label} muss exakt ${expectedRows} Datenzeilen enthalten.`)
  }
  if (dataRows.some((row) => row.every((cell) => cell == null || cell === ""))) {
    throw new Error(`${label} enthaelt eine leere Datenzeile.`)
  }
  return dataRows
}

export function validateLcmdDemoWorkbooks(
  processBytes: Uint8Array,
  cardBytes: Uint8Array,
): WorkbookContract {
  const processRows = readRows(
    processBytes,
    "Prozess-Export",
    LCMD_DEMO_PROCESS_HEADERS,
    LCMD_DEMO_PROCESS_COUNT,
  )
  const cardRows = readRows(
    cardBytes,
    "Plankarten-Export",
    LCMD_DEMO_CARD_HEADERS,
    LCMD_DEMO_CARD_COUNT,
  )
  const processIds = new Set<string>()
  const processNames = new Set<string>()
  const trades = new Set<string>()
  const processes: WorkbookContract["processes"] = []
  for (const [index, row] of processRows.entries()) {
    const id = normalizeOpaqueId(row[0], `Prozess-Export Zeile ${index + 2} / Id`)
    if (processIds.has(id)) {
      throw new Error(`Doppelte Prozess-ID in Prozess-Export Zeile ${index + 2}.`)
    }
    processIds.add(id)
    const processName = requiredText(row[1], `Prozess-Export Zeile ${index + 2} / Prozessname`)
    const trade = requiredText(row[7], `Prozess-Export Zeile ${index + 2} / Gewerk`)
    processNames.add(processName)
    trades.add(trade)
    const startDate = dateOnly(row[2], `Prozess-Export Zeile ${index + 2} / Startdatum`)
    const endDate = dateOnly(row[3], `Prozess-Export Zeile ${index + 2} / Enddatum`)
    if (startDate > endDate) {
      throw new Error(`Prozess-Export Zeile ${index + 2} endet vor dem Startdatum.`)
    }
    processes.push({
      sourceActivityId: id,
      processName,
      trade,
      areaLevel1: requiredText(row[11], `Prozess-Export Zeile ${index + 2} / Bereich Ebene 1`),
      areaLevel2: requiredText(row[12], `Prozess-Export Zeile ${index + 2} / Bereich Ebene 2`),
      areaLevel3: requiredText(row[13], `Prozess-Export Zeile ${index + 2} / Bereich Ebene 3`),
      areaPath: requiredText(row[14], `Prozess-Export Zeile ${index + 2} / Bereichspfad`),
      sourceAreaId: normalizeOpaqueId(row[15], `Prozess-Export Zeile ${index + 2} / Bereiche ID`),
      startDate,
      endDate,
      weekStart: requiredInteger(row[16], `Prozess-Export Zeile ${index + 2} / KW Start`),
      weekEnd: requiredInteger(row[17], `Prozess-Export Zeile ${index + 2} / KW Ende`),
      cardCount: 0,
    })
    if (row[20] != null && row[20] !== "") {
      throw new Error(`Prozess-Export Zeile ${index + 2} / Zusätzliche ID muss leer sein.`)
    }
  }
  if (processNames.size !== 13 || trades.size !== 9) {
    throw new Error("Prozess-Export muss exakt 13 Prozessnamen und 9 Gewerke enthalten.")
  }

  const cardIds = new Set<string>()
  const processIdsWithCards = new Set<string>()
  for (const [index, row] of cardRows.entries()) {
    const cardId = normalizeOpaqueId(row[0], `Plankarten-Export Zeile ${index + 2} / Id`)
    if (cardIds.has(cardId)) {
      throw new Error(`Doppelte Plankarten-ID in Plankarten-Export Zeile ${index + 2}.`)
    }
    cardIds.add(cardId)
    const processId = normalizeOpaqueId(row[6], `Plankarten-Export Zeile ${index + 2} / Prozess ID`)
    if (!processIds.has(processId)) {
      throw new Error(`Nicht aufloesbare Prozess ID in Plankarten-Export Zeile ${index + 2}.`)
    }
    processIdsWithCards.add(processId)
    const process = processes.find((candidate) => candidate.sourceActivityId === processId)
    if (!process) throw new Error("Interner Relationsfehler im LCMD-Demo-Vertrag.")
    process.cardCount += 1
  }
  return { processIds, cardIds, processIdsWithCards, processes }
}

export function validateLcmdDemoSelection(
  value: unknown,
  contract: WorkbookContract,
): LcmdDemoSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Die Demoauswahl muss ein JSON-Objekt sein.")
  }
  if (!hasExactFields(value, ["schemaVersion", "sourceProjectId", "bindings"])) {
    throw new Error("Die Demoauswahl enthaelt unerwartete oder fehlende Felder.")
  }
  const candidate = value as Record<string, unknown>
  if (candidate.schemaVersion !== "demo-04-lcmd-selection-v1") {
    throw new Error("Unbekannte Schema-Version der Demoauswahl.")
  }
  const sourceProjectId = normalizeOpaqueId(candidate.sourceProjectId, "sourceProjectId")
  if (!Array.isArray(candidate.bindings) || candidate.bindings.length !== DEMO_KEYS.length) {
    throw new Error("Die Demoauswahl muss exakt 50 Bindungen enthalten.")
  }

  const bindings: SelectionBinding[] = []
  const seenDemoKeys = new Set<string>()
  const seenSourceIds = new Set<string>()
  for (const [index, valueBinding] of candidate.bindings.entries()) {
    if (
      !valueBinding ||
      typeof valueBinding !== "object" ||
      Array.isArray(valueBinding) ||
      !hasExactFields(valueBinding, ["demoActivityKey", "sourceActivityId"])
    ) {
      throw new Error(`Bindung ${index + 1} besitzt nicht den exakten Vertrag.`)
    }
    const binding = valueBinding as Record<string, unknown>
    const demoActivityKey = normalizeOpaqueId(
      binding.demoActivityKey,
      `Bindung ${index + 1} / demoActivityKey`,
    )
    const sourceActivityId = normalizeOpaqueId(
      binding.sourceActivityId,
      `Bindung ${index + 1} / sourceActivityId`,
    )
    if (!DEMO_KEYS.includes(demoActivityKey)) {
      throw new Error(`Unbekannter DEMO-04-Schluessel in Bindung ${index + 1}.`)
    }
    if (seenDemoKeys.has(demoActivityKey)) {
      throw new Error(`Doppelter DEMO-04-Schluessel in Bindung ${index + 1}.`)
    }
    if (seenSourceIds.has(sourceActivityId)) {
      throw new Error(`Doppelte ausgewaehlte LCMD-Prozess-ID in Bindung ${index + 1}.`)
    }
    if (!contract.processIds.has(sourceActivityId)) {
      throw new Error(`LCMD-Prozess-ID aus Bindung ${index + 1} fehlt im Prozess-Export.`)
    }
    if (!contract.processIdsWithCards.has(sourceActivityId)) {
      throw new Error(`LCMD-Prozess-ID aus Bindung ${index + 1} besitzt keine Plankarte.`)
    }
    seenDemoKeys.add(demoActivityKey)
    seenSourceIds.add(sourceActivityId)
    bindings.push({ demoActivityKey, sourceActivityId })
  }
  if (DEMO_KEYS.some((key) => !seenDemoKeys.has(key))) {
    throw new Error("Die Demoauswahl muss D04-001..D04-050 vollstaendig abdecken.")
  }
  return { schemaVersion: "demo-04-lcmd-selection-v1", sourceProjectId, bindings }
}

export function validateLcmdDemoRebaselineScope(
  selection: LcmdDemoSelection,
  contract: WorkbookContract,
): void {
  const processById = new Map(
    contract.processes.map((process) => [process.sourceActivityId, process]),
  )
  const selected = selection.bindings.map((binding) => processById.get(binding.sourceActivityId)!)
  for (const binding of selection.bindings) {
    const expectedIndex = DEMO_KEYS.indexOf(binding.demoActivityKey)
    const expectedAreaIndex = Math.floor(expectedIndex / LCMD_DEMO_REBASELINE_SCOPE.length)
    const expectedScope =
      LCMD_DEMO_REBASELINE_SCOPE[expectedIndex % LCMD_DEMO_REBASELINE_SCOPE.length]
    const expectedBuilding = LCMD_DEMO_REBASELINE_BUILDINGS[Math.floor(expectedAreaIndex / 5)]
    const expectedFloor = LCMD_DEMO_REBASELINE_FLOORS[expectedAreaIndex % 5]
    const process = processById.get(binding.sourceActivityId)!
    if (
      process.areaLevel1 !== expectedBuilding ||
      process.areaLevel2 !== expectedFloor ||
      process.processName !== expectedScope.processName ||
      process.trade !== expectedScope.trade
    ) {
      throw new Error(
        `Rebaseline-Zuordnung fuer ${binding.demoActivityKey} entspricht nicht dem Scope.`,
      )
    }
  }
  const selectedAreaIds = new Set<string>()
  for (const areaLevel1 of LCMD_DEMO_REBASELINE_BUILDINGS) {
    for (const areaLevel2 of LCMD_DEMO_REBASELINE_FLOORS) {
      const areaProcesses = selected.filter(
        (process) => process.areaLevel1 === areaLevel1 && process.areaLevel2 === areaLevel2,
      )
      if (
        areaProcesses.length !== LCMD_DEMO_REBASELINE_SCOPE.length ||
        new Set(areaProcesses.map((process) => process.sourceAreaId)).size !== 1 ||
        new Set(areaProcesses.map((process) => process.areaPath)).size !== 1 ||
        areaProcesses.some((process) => process.areaLevel3 !== "Wohnung")
      ) {
        throw new Error(`Rebaseline-Bereich ${areaLevel1}/${areaLevel2} ist nicht eindeutig.`)
      }
      selectedAreaIds.add(areaProcesses[0].sourceAreaId)
      for (const scope of LCMD_DEMO_REBASELINE_SCOPE) {
        const matches = areaProcesses.filter(
          (process) => process.processName === scope.processName && process.trade === scope.trade,
        )
        if (matches.length !== 1) {
          throw new Error(
            `Rebaseline-Prozessklasse ${scope.processName}/${scope.trade} fehlt oder ist mehrdeutig.`,
          )
        }
      }
    }
  }
  if (selectedAreaIds.size !== 10) {
    throw new Error("Der Rebaseline-Scope muss exakt zehn eindeutige LCMD-Bereiche enthalten.")
  }
}

export function createLcmdDemoBinding(
  processBytes: Uint8Array,
  cardBytes: Uint8Array,
  selectionValue: unknown,
  sourceFiles = { processes: "processes.xlsx", cards: "cards.xlsx" },
): LcmdDemoBinding {
  const contract = validateLcmdDemoWorkbooks(processBytes, cardBytes)
  const selection = validateLcmdDemoSelection(selectionValue, contract)
  validateLcmdDemoRebaselineScope(selection, contract)
  const fixture = validateTagOnlyFixture(TAG_ONLY_FIXTURE)
  const selectedByDemoKey = new Map(
    selection.bindings.map((binding) => [binding.demoActivityKey, binding.sourceActivityId]),
  )
  return {
    schemaVersion: "demo-04-lcmd-binding-v1",
    scope: "local_read_only_demo_binding",
    qualification: "DEMONSTRATOR / KEINE PRODUKTIONSFREIGABE",
    fixtureVersion: fixture.fixtureVersion,
    canonicalSource: {
      path: TAG_ONLY_CANONICAL_SOURCE_PATH,
      sha256: TAG_ONLY_CANONICAL_SOURCE_SHA256,
    },
    sourceProjectId: selection.sourceProjectId,
    sourceFiles: {
      processes: {
        name: basename(sourceFiles.processes),
        sha256: createHash("sha256").update(processBytes).digest("hex"),
      },
      cards: {
        name: basename(sourceFiles.cards),
        sha256: createHash("sha256").update(cardBytes).digest("hex"),
      },
    },
    contract: {
      processRows: contract.processIds.size,
      cardRows: contract.cardIds.size,
      processHeaders: LCMD_DEMO_PROCESS_HEADERS,
      cardHeaders: LCMD_DEMO_CARD_HEADERS,
    },
    bindings: fixture.activities.map((activity) => ({
      demoActivityKey: activity.demoActivityKey,
      sourceActivityId: selectedByDemoKey.get(activity.demoActivityKey)!,
      activeTagId: activity.activeTagId,
      doneTagId: activity.doneTagId,
    })),
  }
}

export function createLcmdDemoSelectionReview(
  processBytes: Uint8Array,
  cardBytes: Uint8Array,
  sourceFiles = { processes: "processes.xlsx", cards: "cards.xlsx" },
): LcmdDemoSelectionReview {
  const contract = validateLcmdDemoWorkbooks(processBytes, cardBytes)
  return {
    schemaVersion: "demo-04-lcmd-selection-review-v1",
    qualification: "LOCAL REVIEW / KEINE BINDUNG / KEINE PRODUKTIONSFREIGABE",
    sourceFiles: {
      processes: basename(sourceFiles.processes),
      cards: basename(sourceFiles.cards),
    },
    processes: contract.processes,
    selectionTemplate: {
      schemaVersion: "demo-04-lcmd-selection-v1",
      sourceProjectId: "",
      bindings: DEMO_KEYS.map((demoActivityKey) => ({ demoActivityKey, sourceActivityId: "" })),
    },
  }
}

async function nearestGitRoot(path: string): Promise<string | null> {
  let candidate = resolve(path)
  while (true) {
    try {
      await lstat(join(candidate, ".git"))
      return candidate
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    const parent = dirname(candidate)
    if (parent === candidate) return null
    candidate = parent
  }
}

export async function assertNotVersionedPath(path: string, label: string): Promise<void> {
  const gitRoot = await nearestGitRoot(dirname(resolve(path)))
  if (!gitRoot) return
  try {
    await execFileAsync("git", ["-C", gitRoot, "check-ignore", "-q", "--", resolve(path)])
  } catch (error) {
    if ((error as { code?: string | number }).code === 1) {
      throw new Error(`${label} liegt in einem Git-Repository, wird dort aber nicht ignoriert.`)
    }
    throw new Error(`${label} konnte nicht sicher gegen Git-Ignorierung geprueft werden.`)
  }
}

export async function assertPrivateLocalInput(path: string, label: string): Promise<void> {
  const metadata = await lstat(path)
  if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
    throw new Error(`${label} muss eine lokale regulaere Datei mit Modus 0600 sein.`)
  }
  await assertNotVersionedPath(path, label)
}

export async function assertUnversionedLocalPath(path: string, label: string): Promise<void> {
  if (!path.endsWith(".local")) {
    throw new Error(`${label} muss auf .local enden.`)
  }
  await assertNotVersionedPath(path, label)
}

async function writeExclusiveLocalJson(path: string, value: unknown): Promise<string> {
  const outputPath = resolve(path)
  const handle = await open(outputPath, "wx", 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8")
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => undefined)
    await rm(outputPath, { force: true })
    throw error
  }
  await handle.close()
  return outputPath
}

export async function writeLcmdDemoSelectionReview(options: {
  processesPath: string
  cardsPath: string
  outputPath: string
}): Promise<string> {
  await assertUnversionedLocalPath(options.outputPath, "Ausgabe")
  await Promise.all([
    assertPrivateLocalInput(options.processesPath, "Prozess-Export"),
    assertPrivateLocalInput(options.cardsPath, "Plankarten-Export"),
  ])
  const [processBytes, cardBytes] = await Promise.all([
    readFile(options.processesPath),
    readFile(options.cardsPath),
  ])
  const review = createLcmdDemoSelectionReview(processBytes, cardBytes, {
    processes: options.processesPath,
    cards: options.cardsPath,
  })
  return writeExclusiveLocalJson(options.outputPath, review)
}

export async function writeLcmdDemoBinding(options: {
  processesPath: string
  cardsPath: string
  selectionPath: string
  outputPath: string
}): Promise<string> {
  await assertUnversionedLocalPath(options.selectionPath, "Auswahl")
  await assertUnversionedLocalPath(options.outputPath, "Ausgabe")
  await Promise.all([
    assertPrivateLocalInput(options.processesPath, "Prozess-Export"),
    assertPrivateLocalInput(options.cardsPath, "Plankarten-Export"),
    assertPrivateLocalInput(options.selectionPath, "Auswahl"),
  ])
  const [processBytes, cardBytes, selectionBytes] = await Promise.all([
    readFile(options.processesPath),
    readFile(options.cardsPath),
    readFile(options.selectionPath),
  ])
  let selection: unknown
  try {
    selection = JSON.parse(selectionBytes.toString("utf8"))
  } catch {
    throw new Error("Die lokale Demoauswahl ist kein gueltiges JSON.")
  }
  const binding = createLcmdDemoBinding(processBytes, cardBytes, selection, {
    processes: options.processesPath,
    cards: options.cardsPath,
  })
  return writeExclusiveLocalJson(options.outputPath, binding)
}
