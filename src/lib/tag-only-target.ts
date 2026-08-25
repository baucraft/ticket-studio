import fixtureSource from "@/data/demo-04-synthetic-activities.v1.json"

const CANONICAL_FIXTURE_CONTRACT = JSON.stringify(fixtureSource)

export const TAG_ONLY_CARD_ID_MIN = 0
export const TAG_ONLY_CARD_ID_MAX = 63485
export const TAG_ONLY_BOARD_ID_MIN = 63486
export const TAG_ONLY_BOARD_ID_MAX = 64509
export const TAG_ONLY_SYSTEM_ID_MIN = 64510
export const TAG_ONLY_TEST_ID_MIN = 65022

export const TAG_ONLY_TRADE_COLORS = {
  Trockenbau: "#1d4ed8",
  Elektro: "#92400e",
  Lueftung: "#047857",
  Logistik: "#6d28d9",
  Stahlbau: "#b91c1c",
} as const

export const TAG_ONLY_ASSET_MANIFEST_SHA256 =
  "6dbb2a5adcd58212d151ef1b9a99400337cfb686c1ac9ff8131d55aabaa9f7f4"
export const TAG_ONLY_CANONICAL_SOURCE_PATH = "src/data/demo-04-synthetic-activities.v1.json"
export const TAG_ONLY_CANONICAL_SOURCE_SHA256 =
  "4f165dcdffb1b0659670b0f83208a367ee0b428b5daa132e53e971e0aa13896f"

export type TagOnlyActivity = {
  demoActivityKey: string
  demoProjectKey: "DEMO-04"
  demoArea: "Nord" | "Sued"
  sourceBinding: { state: "unbound" }
  boardId: string
  markerSlot: number
  activeTagId: number
  doneTagId: number
  company: string
  trade: string
  tradeColor: string
  tradeColorSource: "synthetic_mock"
  area: string
  week: string
  shortTarget: string
  fullTarget: string
  deviation: string
  featured: boolean
}

export type TagOnlyBoard = {
  id: string
  demoProjectKey: "DEMO-04"
  demoArea: "Nord" | "Sued"
  name: string
  area: string
  boardMarkerId: number
}

export type TagOnlyDemoProject = {
  demoProjectKey: "DEMO-04"
  name: string
}

export type TagOnlyFixture = {
  schemaVersion: "demo-04-synthetic-activities-v1"
  fixtureVersion: string
  scope: "synthetic_non_product_preflight"
  provenance: {
    contract: string
    assetRepository: string
    assetCommit: string
    cardFamily: "tagCircle49h12"
    referenceFamily: "tagStandard52h13"
  }
  identityContract: {
    demoActivityKey: "stable_demo_bootstrap_key_not_lcmd_process_id"
    demoProjectKey: "demo_context_not_lcmd_project_id"
    sourceBindingState: "unbound_until_real_lcmd_pilot_export"
    tagAssignment: "pre_reserved_demo_pairs_not_derived_from_lcmd_ids_sorting_or_rows"
    lcmdImporterImplemented: false
    writebackImplemented: false
    validatedSynchronization: false
  }
  printContract: {
    qualification: "TESTDRUCK / KEINE PRODUKTIONSFREIGABE"
    paper: "A4"
    scalePercent: 100
    fitToPage: false
    cardWidthMm: 120
    cardHeightMm: 66
    cardMarkerOuterEdgeMm: 18
    boardMarkerOuterEdgeMm: 36
    quietZoneModulesPerSide: 1
  }
  preflight: {
    physicalBoardCount: 1
    mode: "sequential_logical_boards"
    instructions: string[]
    sequence: Array<{ order: number; boardId: string; boardMarkerId: number }>
  }
  demoProjects: TagOnlyDemoProject[]
  boards: TagOnlyBoard[]
  activities: TagOnlyActivity[]
}

export type TagOnlyFilters = {
  company: string[]
  trade: string[]
  area: string[]
  week: string[]
  query: string
}

const REQUIRED_FEATURED_PAIRS = new Set([
  "0/1",
  "74/75",
  "1024/1025",
  "4096/4097",
  "8192/8193",
  "24000/24001",
  "40000/40001",
  "63484/63485",
])
const REQUIRED_BOARD_IDS = new Set([63486, 63487, 63488])
const REQUIRED_ADDITIONAL_SLOTS = new Set(Array.from({ length: 42 }, (_, index) => index + 100))
const REQUIRED_BOARD_CONTRACT = new Map([
  ["board-nord-a", { boardMarkerId: 63486, demoArea: "Nord" }],
  ["board-nord-b", { boardMarkerId: 63487, demoArea: "Nord" }],
  ["board-sued-a", { boardMarkerId: 63488, demoArea: "Sued" }],
] as const)
const REQUIRED_PREFLIGHT_BOARD_IDS = ["board-nord-a", "board-nord-b", "board-sued-a"] as const
const REQUIRED_DEMO_KEY_BY_MARKER_SLOT = new Map<number, string>([
  [0, "D04-001"],
  [37, "D04-002"],
  [512, "D04-003"],
  [2048, "D04-004"],
  [4096, "D04-019"],
  [12000, "D04-020"],
  [20000, "D04-035"],
  [31742, "D04-036"],
  ...Array.from(
    { length: 14 },
    (_, index) => [100 + index, `D04-${String(index + 5).padStart(3, "0")}`] as const,
  ),
  ...Array.from(
    { length: 14 },
    (_, index) => [114 + index, `D04-${String(index + 21).padStart(3, "0")}`] as const,
  ),
  ...Array.from(
    { length: 14 },
    (_, index) => [128 + index, `D04-${String(index + 37).padStart(3, "0")}`] as const,
  ),
])
const ROOT_FIELDS = new Set([
  "schemaVersion",
  "fixtureVersion",
  "scope",
  "provenance",
  "printContract",
  "preflight",
  "boards",
  "activities",
  "identityContract",
  "demoProjects",
])
const PROVENANCE_FIELDS = new Set([
  "contract",
  "assetRepository",
  "assetCommit",
  "cardFamily",
  "referenceFamily",
])
const PRINT_CONTRACT_FIELDS = new Set([
  "qualification",
  "paper",
  "scalePercent",
  "fitToPage",
  "cardWidthMm",
  "cardHeightMm",
  "cardMarkerOuterEdgeMm",
  "boardMarkerOuterEdgeMm",
  "quietZoneModulesPerSide",
])
const PREFLIGHT_FIELDS = new Set(["physicalBoardCount", "mode", "instructions", "sequence"])
const PREFLIGHT_SEQUENCE_FIELDS = new Set(["order", "boardId", "boardMarkerId"])
const IDENTITY_CONTRACT_FIELDS = new Set([
  "demoActivityKey",
  "demoProjectKey",
  "sourceBindingState",
  "tagAssignment",
  "lcmdImporterImplemented",
  "writebackImplemented",
  "validatedSynchronization",
])
const DEMO_PROJECT_FIELDS = new Set(["demoProjectKey", "name"])
const BOARD_FIELDS = new Set(["id", "demoProjectKey", "demoArea", "name", "area", "boardMarkerId"])
const ACTIVITY_FIELDS = new Set([
  "demoActivityKey",
  "demoProjectKey",
  "demoArea",
  "sourceBinding",
  "boardId",
  "markerSlot",
  "activeTagId",
  "doneTagId",
  "company",
  "trade",
  "tradeColor",
  "tradeColorSource",
  "area",
  "week",
  "shortTarget",
  "fullTarget",
  "deviation",
  "featured",
])
const SOURCE_BINDING_FIELDS = new Set(["state"])

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function hasExactFields(value: unknown, fields: ReadonlySet<string>): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === fields.size && keys.every((key) => fields.has(key))
}

export function tagOnlyActivityKey(activity: Pick<TagOnlyActivity, "demoActivityKey">) {
  return activity.demoActivityKey
}

export function validateTagOnlyFixture(fixture: TagOnlyFixture): TagOnlyFixture {
  if (
    !hasExactFields(fixture, ROOT_FIELDS) ||
    !hasExactFields(fixture.provenance, PROVENANCE_FIELDS) ||
    !hasExactFields(fixture.identityContract, IDENTITY_CONTRACT_FIELDS) ||
    fixture.schemaVersion !== "demo-04-synthetic-activities-v1" ||
    fixture.scope !== "synthetic_non_product_preflight" ||
    !hasText(fixture.fixtureVersion) ||
    fixture.provenance?.assetCommit !== "f3fd9a7add5bfd82a886fc65240fdb8e3c9ac5a1" ||
    fixture.provenance?.cardFamily !== "tagCircle49h12" ||
    fixture.provenance?.referenceFamily !== "tagStandard52h13" ||
    fixture.identityContract?.demoActivityKey !== "stable_demo_bootstrap_key_not_lcmd_process_id" ||
    fixture.identityContract?.demoProjectKey !== "demo_context_not_lcmd_project_id" ||
    fixture.identityContract?.sourceBindingState !== "unbound_until_real_lcmd_pilot_export" ||
    fixture.identityContract?.tagAssignment !==
      "pre_reserved_demo_pairs_not_derived_from_lcmd_ids_sorting_or_rows" ||
    fixture.identityContract?.lcmdImporterImplemented !== false ||
    fixture.identityContract?.writebackImplemented !== false ||
    fixture.identityContract?.validatedSynchronization !== false
  ) {
    throw new Error("Der kanonische Zielbildvertrag hat einen unerwarteten Vertragskopf.")
  }
  if (
    !hasExactFields(fixture.printContract, PRINT_CONTRACT_FIELDS) ||
    fixture.printContract?.qualification !== "TESTDRUCK / KEINE PRODUKTIONSFREIGABE" ||
    fixture.printContract.paper !== "A4" ||
    fixture.printContract.scalePercent !== 100 ||
    fixture.printContract.fitToPage !== false ||
    fixture.printContract.cardWidthMm !== 120 ||
    fixture.printContract.cardHeightMm !== 66 ||
    fixture.printContract.cardMarkerOuterEdgeMm !== 18 ||
    fixture.printContract.boardMarkerOuterEdgeMm !== 36 ||
    fixture.printContract.quietZoneModulesPerSide !== 1
  ) {
    throw new Error("Der nichtproduktive Druckvertrag ist ungueltig.")
  }
  if (
    !hasExactFields(fixture.preflight, PREFLIGHT_FIELDS) ||
    fixture.preflight?.physicalBoardCount !== 1 ||
    fixture.preflight.mode !== "sequential_logical_boards" ||
    !Array.isArray(fixture.preflight.instructions) ||
    fixture.preflight.instructions.length < 4 ||
    fixture.preflight.instructions.some((instruction) => !hasText(instruction))
  ) {
    throw new Error("Die Einzeltafel-Preflightkonfiguration ist unvollstaendig.")
  }

  const projects = new Set(fixture.demoProjects.map((item) => item.demoProjectKey))
  if (
    projects.size !== 1 ||
    !projects.has("DEMO-04") ||
    fixture.demoProjects.length !== 1 ||
    fixture.demoProjects.some(
      (item) => !hasExactFields(item, DEMO_PROJECT_FIELDS) || !hasText(item.name),
    )
  ) {
    throw new Error("Die synthetischen Projekte sind ungueltig.")
  }
  const boards = new Map(fixture.boards.map((item) => [item.id, item]))
  const boardMarkerIds = new Set<number>()
  for (const board of fixture.boards) {
    const requiredBoard = REQUIRED_BOARD_CONTRACT.get(
      board.id as (typeof REQUIRED_PREFLIGHT_BOARD_IDS)[number],
    )
    if (
      !hasExactFields(board, BOARD_FIELDS) ||
      !requiredBoard ||
      !hasText(board.id) ||
      !hasText(board.name) ||
      !hasText(board.area) ||
      !projects.has(board.demoProjectKey) ||
      !["Nord", "Sued"].includes(board.demoArea) ||
      board.demoArea !== requiredBoard.demoArea ||
      !Number.isInteger(board.boardMarkerId) ||
      board.boardMarkerId !== requiredBoard.boardMarkerId ||
      board.boardMarkerId < TAG_ONLY_BOARD_ID_MIN ||
      board.boardMarkerId > TAG_ONLY_BOARD_ID_MAX ||
      boardMarkerIds.has(board.boardMarkerId)
    ) {
      throw new Error(`Ungueltige Tafelzuordnung: ${board.id}`)
    }
    boardMarkerIds.add(board.boardMarkerId)
  }
  if (
    boards.size !== 3 ||
    boardMarkerIds.size !== REQUIRED_BOARD_IDS.size ||
    [...boardMarkerIds].some((id) => !REQUIRED_BOARD_IDS.has(id))
  ) {
    throw new Error("Der kanonische Vertrag muss genau drei logische Tafeln binden.")
  }

  const sequenceBoards = new Set<string>()
  fixture.preflight.sequence.forEach((step, index) => {
    const board = boards.get(step.boardId)
    if (
      !hasExactFields(step, PREFLIGHT_SEQUENCE_FIELDS) ||
      step.order !== index + 1 ||
      step.boardId !== REQUIRED_PREFLIGHT_BOARD_IDS[index] ||
      !board ||
      step.boardMarkerId !== board.boardMarkerId ||
      sequenceBoards.has(step.boardId)
    ) {
      throw new Error(`Ungueltiger Einzeltafel-Preflightschritt: ${step.order}`)
    }
    sequenceBoards.add(step.boardId)
  })
  if (sequenceBoards.size !== boards.size) {
    throw new Error("Der Einzeltafel-Preflight muss jede logische Tafel genau einmal abbilden.")
  }

  if (fixture.activities.length !== 50) {
    throw new Error(`Der kanonische Vertrag muss exakt 50 Vorgaenge enthalten.`)
  }
  const demoKeys = new Set<string>()
  const tagIds = new Set<number>()
  const tradeColors = new Map<string, string>()
  const colorTrades = new Map<string, string>()
  const featuredPairs = new Set<string>()
  const additionalSlots = new Set<number>()
  for (const item of fixture.activities) {
    const board = boards.get(item.boardId)
    const demoKey = tagOnlyActivityKey(item)
    if (
      !hasExactFields(item, ACTIVITY_FIELDS) ||
      !/^D04-(?:00[1-9]|0[1-4][0-9]|050)$/.test(demoKey) ||
      REQUIRED_DEMO_KEY_BY_MARKER_SLOT.get(item.markerSlot) !== demoKey ||
      item.demoProjectKey !== "DEMO-04" ||
      !board ||
      board.demoProjectKey !== item.demoProjectKey ||
      board.demoArea !== item.demoArea ||
      demoKeys.has(demoKey) ||
      item.sourceBinding?.state !== "unbound" ||
      !hasExactFields(item.sourceBinding, SOURCE_BINDING_FIELDS)
    ) {
      throw new Error(`Ungueltiger Demo-Bootstrapschluessel: ${item.demoActivityKey}`)
    }
    if (
      !hasText(item.company) ||
      !hasText(item.trade) ||
      !hasText(item.area) ||
      !hasText(item.week) ||
      !hasText(item.shortTarget) ||
      !hasText(item.fullTarget) ||
      !hasText(item.deviation) ||
      typeof item.featured !== "boolean"
    ) {
      throw new Error(`Unvollstaendiger synthetischer Vorgang: ${item.demoActivityKey}`)
    }
    if (
      !Number.isInteger(item.markerSlot) ||
      !Number.isInteger(item.activeTagId) ||
      !Number.isInteger(item.doneTagId) ||
      item.activeTagId !== 2 * item.markerSlot ||
      item.doneTagId !== item.activeTagId + 1 ||
      item.activeTagId % 2 !== 0 ||
      item.doneTagId % 2 !== 1 ||
      item.activeTagId < TAG_ONLY_CARD_ID_MIN ||
      item.doneTagId > TAG_ONLY_CARD_ID_MAX ||
      tagIds.has(item.activeTagId) ||
      tagIds.has(item.doneTagId)
    ) {
      throw new Error(`Ungueltiges nichtproduktives ID-Paar: ${item.demoActivityKey}`)
    }
    const expectedColor = TAG_ONLY_TRADE_COLORS[item.trade as keyof typeof TAG_ONLY_TRADE_COLORS]
    const knownColor = tradeColors.get(item.trade)
    const knownTrade = colorTrades.get(item.tradeColor)
    if (
      item.tradeColorSource !== "synthetic_mock" ||
      item.tradeColor !== expectedColor ||
      (knownColor !== undefined && knownColor !== item.tradeColor) ||
      (knownTrade !== undefined && knownTrade !== item.trade)
    ) {
      throw new Error(`Ungueltige synthetische Gewerksfarbe: ${item.trade}`)
    }
    tradeColors.set(item.trade, item.tradeColor)
    colorTrades.set(item.tradeColor, item.trade)
    demoKeys.add(demoKey)
    tagIds.add(item.activeTagId)
    tagIds.add(item.doneTagId)
    if (item.featured) featuredPairs.add(`${item.activeTagId}/${item.doneTagId}`)
    else additionalSlots.add(item.markerSlot)
  }
  const expectedDemoKeys = new Set(
    Array.from({ length: 50 }, (_, index) => `D04-${String(index + 1).padStart(3, "0")}`),
  )
  if (
    demoKeys.size !== expectedDemoKeys.size ||
    [...expectedDemoKeys].some((key) => !demoKeys.has(key))
  ) {
    throw new Error("Der kanonische Vertrag muss exakt D04-001..D04-050 binden.")
  }
  if (tagIds.size !== 100) throw new Error("Der kanonische Vertrag muss 100 Kartenmarker binden.")
  if (
    featuredPairs.size !== 8 ||
    featuredPairs.size !== REQUIRED_FEATURED_PAIRS.size ||
    [...featuredPairs].some((pair) => !REQUIRED_FEATURED_PAIRS.has(pair))
  ) {
    throw new Error("Die gefuehrte Messeauswahl muss exakt die acht bestehenden ID-Paare nutzen.")
  }
  if (
    additionalSlots.size !== REQUIRED_ADDITIONAL_SLOTS.size ||
    [...additionalSlots].some((slot) => !REQUIRED_ADDITIONAL_SLOTS.has(slot))
  ) {
    throw new Error(
      "Die 42 zusaetzlichen Karten muessen die kanonischen freien Slots 100..141 nutzen.",
    )
  }
  if (JSON.stringify(fixture) !== CANONICAL_FIXTURE_CONTRACT) {
    throw new Error("Der Fixtureinhalt weicht vom kanonischen DEMO-04-Vertrag ab.")
  }
  return fixture
}

export const TAG_ONLY_FIXTURE = validateTagOnlyFixture(fixtureSource as unknown as TagOnlyFixture)

export const TAG_ONLY_BOUND_CARD_IDS = new Set(
  TAG_ONLY_FIXTURE.activities.flatMap((item) => [item.activeTagId, item.doneTagId]),
)
export const TAG_ONLY_BOUND_BOARD_IDS = new Set(
  TAG_ONLY_FIXTURE.boards.map((board) => board.boardMarkerId),
)

export function tagOnlyCardMarkerFilename(tagId: number, status: "active" | "done"): string {
  const parityMatches = status === "active" ? tagId % 2 === 0 : tagId % 2 === 1
  if (!Number.isInteger(tagId) || !parityMatches || !TAG_ONLY_BOUND_CARD_IDS.has(tagId)) {
    throw new Error(`Kein gebundenes ${status}-Markerasset fuer ID ${tagId}`)
  }
  return `tagCircle49h12_id${String(tagId).padStart(5, "0")}_card_${status}_18mm.svg`
}

export function tagOnlyBoardMarkerFilename(tagId: number): string {
  if (!Number.isInteger(tagId) || !TAG_ONLY_BOUND_BOARD_IDS.has(tagId)) {
    throw new Error(`Kein gebundenes Tafelmarkerasset fuer ID ${tagId}`)
  }
  return `tagCircle49h12_id${String(tagId).padStart(5, "0")}_board_36mm.svg`
}

export function filterTagOnlyActivities(
  fixture: TagOnlyFixture,
  demoProjectKey: string,
  boardId: string,
  filters: TagOnlyFilters,
): TagOnlyActivity[] {
  const query = filters.query.trim().toLocaleLowerCase("de")
  return fixture.activities.filter((item) => {
    const searchable = [
      item.demoProjectKey,
      item.demoActivityKey,
      item.company,
      item.trade,
      item.area,
      item.week,
      item.shortTarget,
      item.fullTarget,
      String(item.activeTagId),
      String(item.doneTagId),
    ]
      .join(" ")
      .toLocaleLowerCase("de")
    return (
      (!demoProjectKey || item.demoProjectKey === demoProjectKey) &&
      (!boardId || item.boardId === boardId) &&
      (filters.company.length === 0 || filters.company.includes(item.company)) &&
      (filters.trade.length === 0 || filters.trade.includes(item.trade)) &&
      (filters.area.length === 0 || filters.area.includes(item.area)) &&
      (filters.week.length === 0 || filters.week.includes(item.week)) &&
      (!query || searchable.includes(query))
    )
  })
}
