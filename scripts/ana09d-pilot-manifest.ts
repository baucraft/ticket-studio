import { open, readFile, rm } from "node:fs/promises"
import { basename, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import * as XLSX from "../public/vendor/xlsx-0.20.3.mjs"

import {
  TAG_ONLY_ASSET_MANIFEST_SHA256,
  TAG_ONLY_CANONICAL_SOURCE_PATH,
  TAG_ONLY_CANONICAL_SOURCE_SHA256,
  TAG_ONLY_FIXTURE,
  validateTagOnlyFixture,
  type TagOnlyFixture,
} from "../src/lib/tag-only-target"
import {
  assertNotVersionedPath,
  assertPrivateLocalInput,
  LCMD_DEMO_CARD_COUNT,
  LCMD_DEMO_CARD_HEADERS,
  LCMD_DEMO_PROCESS_COUNT,
  LCMD_DEMO_PROCESS_HEADERS,
  type LcmdDemoBinding,
} from "./lcmd-demo-xlsx-adapter"

export const ANA09D_MANIFEST_HEADERS = ["key", "value"] as const
export const ANA09D_BOARD_HEADERS = [
  "boardId",
  "boardName",
  "boardMarkerId",
  "scopeType",
  "scopeLabel",
  "scopeFilterJson",
] as const
export const ANA09D_CARD_HEADERS = [
  "cardId",
  "demoActivityKey",
  "sourceProjectId",
  "sourceActivityId",
  "boardId",
  "lifecycle",
  "activeTagId",
  "doneTagId",
  "company",
  "trade",
  "area",
  "activity",
  "week",
] as const

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type Ana09dBoardScope = {
  scopeType: string
  scopeLabel: string
  scopeFilter: Record<string, JsonValue>
}

export type Ana09dBoardScopes = Record<string, Ana09dBoardScope>

export type Ana09dManifestInput = {
  revision: number
  expectedCardIds: string[]
  boardScopes: Ana09dBoardScopes
}

const BINDING_FIELDS = new Set([
  "schemaVersion",
  "scope",
  "qualification",
  "fixtureVersion",
  "canonicalSource",
  "sourceProjectId",
  "sourceFiles",
  "contract",
  "bindings",
])
const CANONICAL_SOURCE_FIELDS = new Set(["path", "sha256"])
const SOURCE_FILE_FIELDS = new Set(["processes", "cards"])
const SOURCE_FILE_BINDING_FIELDS = new Set(["name", "sha256"])
const CONTRACT_FIELDS = new Set(["processRows", "cardRows", "processHeaders", "cardHeaders"])
const BINDING_ENTRY_FIELDS = new Set([
  "demoActivityKey",
  "sourceActivityId",
  "activeTagId",
  "doneTagId",
])
const SCOPE_FIELDS = new Set(["scopeType", "scopeLabel", "scopeFilter"])
const MANIFEST_INPUT_FIELDS = new Set(["revision", "expectedCardIds", "boardScopes"])

function hasExactFields(
  value: unknown,
  fields: ReadonlySet<string>,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === fields.size && keys.every((key) => fields.has(key))
}

function isExactString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim()
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

function hasExactHeaders(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((header, index) => header === expected[index])
  )
}

export function validateAna09dPilotBinding(
  value: unknown,
  fixtureValue: TagOnlyFixture = TAG_ONLY_FIXTURE,
): LcmdDemoBinding {
  const fixture = validateTagOnlyFixture(fixtureValue)
  if (!hasExactFields(value, BINDING_FIELDS)) {
    throw new Error("ANA-09D binding has unexpected or missing fields.")
  }
  if (
    value.schemaVersion !== "demo-04-lcmd-binding-v1" ||
    value.scope !== "local_read_only_demo_binding" ||
    value.qualification !== "DEMONSTRATOR / KEINE PRODUKTIONSFREIGABE" ||
    value.fixtureVersion !== fixture.fixtureVersion ||
    !isExactString(value.sourceProjectId)
  ) {
    throw new Error("ANA-09D binding has an invalid or non-canonical contract header.")
  }
  if (
    !hasExactFields(value.canonicalSource, CANONICAL_SOURCE_FIELDS) ||
    value.canonicalSource.path !== TAG_ONLY_CANONICAL_SOURCE_PATH ||
    value.canonicalSource.sha256 !== TAG_ONLY_CANONICAL_SOURCE_SHA256
  ) {
    throw new Error("ANA-09D binding does not reference the pinned canonical source.")
  }
  if (
    !hasExactFields(value.sourceFiles, SOURCE_FILE_FIELDS) ||
    !hasExactFields(value.sourceFiles.processes, SOURCE_FILE_BINDING_FIELDS) ||
    !hasExactFields(value.sourceFiles.cards, SOURCE_FILE_BINDING_FIELDS) ||
    !isExactString(value.sourceFiles.processes.name) ||
    !isExactString(value.sourceFiles.cards.name) ||
    basename(value.sourceFiles.processes.name) !== value.sourceFiles.processes.name ||
    basename(value.sourceFiles.cards.name) !== value.sourceFiles.cards.name ||
    !isSha256(value.sourceFiles.processes.sha256) ||
    !isSha256(value.sourceFiles.cards.sha256)
  ) {
    throw new Error("ANA-09D binding source file metadata is invalid.")
  }
  if (
    !hasExactFields(value.contract, CONTRACT_FIELDS) ||
    value.contract.processRows !== LCMD_DEMO_PROCESS_COUNT ||
    value.contract.cardRows !== LCMD_DEMO_CARD_COUNT ||
    !hasExactHeaders(value.contract.processHeaders, LCMD_DEMO_PROCESS_HEADERS) ||
    !hasExactHeaders(value.contract.cardHeaders, LCMD_DEMO_CARD_HEADERS)
  ) {
    throw new Error("ANA-09D binding LCMD schema contract is invalid.")
  }
  if (!Array.isArray(value.bindings) || value.bindings.length !== fixture.activities.length) {
    throw new Error("ANA-09D binding must contain exactly 50 entries.")
  }

  const activityByKey = new Map(
    fixture.activities.map((activity) => [activity.demoActivityKey, activity]),
  )
  const seenKeys = new Set<string>()
  const seenSourceIds = new Set<string>()
  for (const [index, entry] of value.bindings.entries()) {
    if (!hasExactFields(entry, BINDING_ENTRY_FIELDS)) {
      throw new Error(`ANA-09D binding entry ${index + 1} has an invalid schema.`)
    }
    const activity =
      typeof entry.demoActivityKey === "string"
        ? activityByKey.get(entry.demoActivityKey)
        : undefined
    if (!activity || seenKeys.has(activity.demoActivityKey)) {
      throw new Error(`ANA-09D binding entry ${index + 1} has an unknown or duplicate D04 key.`)
    }
    if (!isExactString(entry.sourceActivityId) || seenSourceIds.has(entry.sourceActivityId)) {
      throw new Error(`ANA-09D binding entry ${index + 1} has an invalid or duplicate source ID.`)
    }
    if (entry.activeTagId !== activity.activeTagId || entry.doneTagId !== activity.doneTagId) {
      throw new Error(`ANA-09D binding entry ${index + 1} differs from the audited tag pair.`)
    }
    seenKeys.add(activity.demoActivityKey)
    seenSourceIds.add(entry.sourceActivityId)
  }
  if (fixture.activities.some((activity) => !seenKeys.has(activity.demoActivityKey))) {
    throw new Error("ANA-09D binding does not cover D04-001 through D04-050 exactly once.")
  }
  return value as unknown as LcmdDemoBinding
}

function canonicalizeJson(value: unknown, location: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number" && Number.isSafeInteger(value)) return value
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalizeJson(item, `${location}[${index}]`))
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.keys(value)
        .map((key) => {
          if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
            throw new Error(`${location} has a non-portable object key.`)
          }
          return key
        })
        .sort()
        .map((key) => [
          key,
          canonicalizeJson((value as Record<string, unknown>)[key], `${location}.${key}`),
        ]),
    )
  }
  throw new Error(`${location} must contain only finite JSON values.`)
}

export function validateAna09dBoardScopes(
  value: unknown,
  fixtureValue: TagOnlyFixture = TAG_ONLY_FIXTURE,
): Ana09dBoardScopes {
  const fixture = validateTagOnlyFixture(fixtureValue)
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ANA-09D board scopes must be an object keyed by board ID.")
  }
  const candidate = value as Record<string, unknown>
  const expectedBoardIds = fixture.preflight.sequence.map((step) => step.boardId)
  const actualBoardIds = Object.keys(candidate)
  if (
    actualBoardIds.length !== expectedBoardIds.length ||
    actualBoardIds.some((boardId) => !expectedBoardIds.includes(boardId))
  ) {
    throw new Error("ANA-09D board scopes must contain exactly the three canonical boards.")
  }
  const scopes: Ana09dBoardScopes = {}
  for (const boardId of expectedBoardIds) {
    const scope = candidate[boardId]
    if (
      !hasExactFields(scope, SCOPE_FIELDS) ||
      !isExactString(scope.scopeType) ||
      !isExactString(scope.scopeLabel) ||
      !scope.scopeFilter ||
      typeof scope.scopeFilter !== "object" ||
      Array.isArray(scope.scopeFilter)
    ) {
      throw new Error(`ANA-09D scope for ${boardId} has an invalid schema.`)
    }
    scopes[boardId] = {
      scopeType: scope.scopeType,
      scopeLabel: scope.scopeLabel,
      scopeFilter: canonicalizeJson(
        scope.scopeFilter,
        `ANA-09D scope filter for ${boardId}`,
      ) as Record<string, JsonValue>,
    }
  }
  return scopes
}

export function validateAna09dManifestInput(
  value: unknown,
  fixtureValue: TagOnlyFixture = TAG_ONLY_FIXTURE,
): Ana09dManifestInput {
  const fixture = validateTagOnlyFixture(fixtureValue)
  if (
    !hasExactFields(value, MANIFEST_INPUT_FIELDS) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 ||
    !Array.isArray(value.expectedCardIds)
  ) {
    throw new Error("ANA-09D manifest input has an invalid revision or schema.")
  }

  const canonicalIds = fixture.activities.map((activity) => activity.demoActivityKey)
  const selectedIds = value.expectedCardIds
  const selectedSet = new Set(selectedIds)
  if (
    selectedIds.length < fixture.boards.length ||
    selectedSet.size !== selectedIds.length ||
    selectedIds.some((cardId) => !isExactString(cardId) || !canonicalIds.includes(cardId)) ||
    canonicalIds
      .filter((cardId) => selectedSet.has(cardId))
      .some((cardId, index) => {
        return cardId !== selectedIds[index]
      })
  ) {
    throw new Error("ANA-09D expected card IDs must be a unique canonical-order subset.")
  }
  if (value.revision === 1 && selectedIds.length !== canonicalIds.length) {
    throw new Error("ANA-09D revision 1 must retain the canonical 50-card G4 set.")
  }
  if (
    fixture.boards.some(
      (board) =>
        !fixture.activities.some(
          (activity) => activity.boardId === board.id && selectedSet.has(activity.demoActivityKey),
        ),
    )
  ) {
    throw new Error("ANA-09D expected card IDs must retain at least one card per board.")
  }

  return {
    revision: value.revision as number,
    expectedCardIds: [...selectedIds] as string[],
    boardScopes: validateAna09dBoardScopes(value.boardScopes, fixture),
  }
}

function worksheet(rows: Array<Array<string | number>>, expectedRange: string): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet["!ref"] = expectedRange
  for (const cell of Object.values(sheet)) {
    if (!cell || typeof cell !== "object" || !("t" in cell)) continue
    const typedCell = cell as XLSX.CellObject
    if (
      (typedCell.t !== "s" && typedCell.t !== "n") ||
      typedCell.f !== undefined ||
      (typedCell.t === "n" && !Number.isSafeInteger(typedCell.v))
    ) {
      throw new Error("ANA-09D workbook cells must be formula-free strings or safe integers.")
    }
  }
  return sheet
}

export function generateAna09dPilotManifest(
  bindingValue: LcmdDemoBinding,
  manifestInputValue: Ana09dManifestInput,
  fixtureValue: TagOnlyFixture = TAG_ONLY_FIXTURE,
): Uint8Array {
  const fixture = validateTagOnlyFixture(fixtureValue)
  const binding = validateAna09dPilotBinding(bindingValue, fixture)
  const manifestInput = validateAna09dManifestInput(manifestInputValue, fixture)
  const boardScopes = manifestInput.boardScopes
  const expectedCardIds = new Set(manifestInput.expectedCardIds)
  const bindingByKey = new Map(binding.bindings.map((entry) => [entry.demoActivityKey, entry]))

  const manifestRows: Array<Array<string | number>> = [
    [...ANA09D_MANIFEST_HEADERS],
    ["schemaVersion", "ana09d-pilot-manifest-v1"],
    ["manifestId", "demo-04-pilot"],
    ["revision", manifestInput.revision],
    ["qualification", "G4_CONTROLLED_READ_ONLY"],
    ["projectId", "demo-04-pilot"],
    ["projectName", fixture.demoProjects[0].name],
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
  ]
  const boardRows: Array<Array<string | number>> = [
    [...ANA09D_BOARD_HEADERS],
    ...fixture.preflight.sequence.map((step) => {
      const board = fixture.boards.find((candidate) => candidate.id === step.boardId)!
      const scope = boardScopes[board.id]
      return [
        board.id,
        board.name,
        board.boardMarkerId,
        scope.scopeType,
        scope.scopeLabel,
        JSON.stringify(scope.scopeFilter),
      ]
    }),
  ]
  const cardRows: Array<Array<string | number>> = [
    [...ANA09D_CARD_HEADERS],
    ...fixture.activities
      .filter((activity) => expectedCardIds.has(activity.demoActivityKey))
      .map((activity) => {
        const bindingEntry = bindingByKey.get(activity.demoActivityKey)!
        return [
          activity.demoActivityKey,
          activity.demoActivityKey,
          binding.sourceProjectId,
          bindingEntry.sourceActivityId,
          activity.boardId,
          "active",
          activity.activeTagId,
          activity.doneTagId,
          activity.company,
          activity.trade,
          activity.area,
          activity.fullTarget,
          activity.week,
        ]
      }),
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet(manifestRows, "A1:B20"), "Manifest")
  XLSX.utils.book_append_sheet(workbook, worksheet(boardRows, "A1:F4"), "Boards")
  XLSX.utils.book_append_sheet(workbook, worksheet(cardRows, `A1:M${cardRows.length}`), "Cards")
  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
    bookSST: false,
  }) as Uint8Array
}

function assertLocalSuffix(path: string, suffix: string, label: string): void {
  if (!path.endsWith(suffix)) throw new Error(`${label} must end with ${suffix}.`)
}

async function readPrivateJson(path: string, label: string): Promise<unknown> {
  assertLocalSuffix(path, ".local", label)
  await assertPrivateLocalInput(path, label)
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} is not valid JSON.`)
    throw error
  }
}

export async function writeAna09dPilotManifest(options: {
  bindingPath: string
  manifestInputPath: string
  outputPath: string
}): Promise<string> {
  assertLocalSuffix(options.outputPath, ".local.xlsx", "ANA-09D output")
  await assertNotVersionedPath(options.outputPath, "ANA-09D output")
  const [binding, manifestInput] = await Promise.all([
    readPrivateJson(options.bindingPath, "ANA-09D binding"),
    readPrivateJson(options.manifestInputPath, "ANA-09D manifest input"),
  ])
  const bytes = generateAna09dPilotManifest(
    validateAna09dPilotBinding(binding),
    validateAna09dManifestInput(manifestInput),
  )
  const outputPath = resolve(options.outputPath)
  const handle = await open(outputPath, "wx", 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => undefined)
    await rm(outputPath, { force: true })
    throw error
  }
  await handle.close()
  return outputPath
}

async function main(): Promise<void> {
  const flags = ["--binding", "--manifest-input", "--output"] as const
  const values = Object.fromEntries(
    flags.map((flag) => {
      const index = process.argv.indexOf(flag)
      return [flag, index >= 0 ? process.argv[index + 1] : undefined]
    }),
  ) as Record<(typeof flags)[number], string | undefined>
  if (
    process.argv.length !== 8 ||
    flags.some((flag) => !values[flag]) ||
    new Set(process.argv.slice(2).filter((value) => value.startsWith("--"))).size !== flags.length
  ) {
    throw new Error(
      "Usage: npm run demo:ana09d-manifest -- --binding <json.local> --manifest-input <json.local> --output <name.local.xlsx>",
    )
  }
  const outputPath = await writeAna09dPilotManifest({
    bindingPath: values["--binding"]!,
    manifestInputPath: values["--manifest-input"]!,
    outputPath: values["--output"]!,
  })
  console.log(`Generated private ANA-09D pilot manifest at ${outputPath}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
