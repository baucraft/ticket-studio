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

export const TAG_ONLY_BOUND_CARD_IDS = new Set([
  0, 1, 74, 75, 1024, 1025, 4096, 4097, 8192, 8193, 24000, 24001, 40000, 40001, 63484, 63485,
])
export const TAG_ONLY_BOUND_BOARD_IDS = new Set([63486, 63487, 63488])
export const TAG_ONLY_ASSET_MANIFEST_SHA256 =
  "51d5b532702e288927f77a2a5c24414fbfbe481a16c40d16a091aebd5367c8a9"

export type TagOnlyActivity = {
  sourceProjectId: string
  sourceActivityId: string
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
}

export type TagOnlyBoard = {
  id: string
  sourceProjectId: string
  name: string
  area: string
  boardMarkerId: number
}

export type TagOnlyProject = {
  sourceProjectId: string
  name: string
}

export type TagOnlyFixture = {
  schemaVersion: "demo-04-tag-only-fixture-v1"
  scope: "synthetic_non_product_target_picture"
  provenance: "ANA-09C4 capacity and asset contract"
  projects: TagOnlyProject[]
  boards: TagOnlyBoard[]
  activities: TagOnlyActivity[]
}

type ActivitySeed = Omit<
  TagOnlyActivity,
  "activeTagId" | "doneTagId" | "tradeColor" | "tradeColorSource"
>

const activity = (seed: ActivitySeed): TagOnlyActivity => {
  const tradeColor = TAG_ONLY_TRADE_COLORS[seed.trade as keyof typeof TAG_ONLY_TRADE_COLORS]
  if (!tradeColor) throw new Error(`Keine synthetische Gewerksfarbe fuer ${seed.trade}`)
  return {
    ...seed,
    tradeColor,
    tradeColorSource: "synthetic_mock",
    activeTagId: 2 * seed.markerSlot,
    doneTagId: 2 * seed.markerSlot + 1,
  }
}

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

export const TAG_ONLY_FIXTURE: TagOnlyFixture = {
  schemaVersion: "demo-04-tag-only-fixture-v1",
  scope: "synthetic_non_product_target_picture",
  provenance: "ANA-09C4 capacity and asset contract",
  projects: [
    { sourceProjectId: "synthetic-project-nord", name: "SYN Campus Nord" },
    { sourceProjectId: "synthetic-project-sued", name: "SYN Werkhof Sued" },
  ],
  boards: [
    {
      id: "board-nord-a",
      sourceProjectId: "synthetic-project-nord",
      name: "Tafel A - Ausbau Ost",
      area: "Bauteil A / Ebene 2",
      boardMarkerId: 63486,
    },
    {
      id: "board-nord-b",
      sourceProjectId: "synthetic-project-nord",
      name: "Tafel B - Technik West",
      area: "Bauteil B / Ebene 1",
      boardMarkerId: 63487,
    },
    {
      id: "board-sued-a",
      sourceProjectId: "synthetic-project-sued",
      name: "Tafel A - Logistik",
      area: "Halle 1 / Abschnitt Nord",
      boardMarkerId: 63488,
    },
  ],
  activities: [
    activity({
      sourceProjectId: "synthetic-project-nord",
      sourceActivityId: "SYN-PROC-1001",
      boardId: "board-nord-a",
      markerSlot: 0,
      company: "Mock Partner Blau",
      trade: "Trockenbau",
      area: "Bauteil A / Ebene 2",
      week: "KW 36",
      shortTarget: "Wandachsen A2.14 stellen",
      fullTarget:
        "Metallstaenderwaende in den Achsen A2.14 bis A2.18 stellen und fuer die Folgegewerke freigeben.",
      deviation: "IST / Abweichung: __________________________________",
    }),
    activity({
      sourceProjectId: "synthetic-project-nord",
      sourceActivityId: "SYN-PROC-1002",
      boardId: "board-nord-a",
      markerSlot: 37,
      company: "Mock Partner Blau",
      trade: "Trockenbau",
      area: "Bauteil A / Ebene 2",
      week: "KW 37",
      shortTarget: "Beplankung erste Lage",
      fullTarget:
        "Erste Beplankung inklusive dokumentierter Installationsfreigabe im Bereich A2 Ost abschliessen.",
      deviation: "IST / Abweichung: __________________________________",
    }),
    activity({
      sourceProjectId: "synthetic-project-nord",
      sourceActivityId: "SYN-PROC-1003",
      boardId: "board-nord-a",
      markerSlot: 512,
      company: "Mock Elektro Alpha",
      trade: "Elektro",
      area: "Bauteil A / Ebene 2",
      week: "KW 38",
      shortTarget: "Trassen im Flur montieren",
      fullTarget:
        "Kabeltrassen im Hauptflur montieren, kennzeichnen und die Schnittstelle zur Brandabschottung melden.",
      deviation: "IST / Abweichung: __________________________________",
    }),
    activity({
      sourceProjectId: "synthetic-project-nord",
      sourceActivityId: "SYN-PROC-1004",
      boardId: "board-nord-a",
      markerSlot: 2048,
      company: "Mock Klima Team",
      trade: "Lueftung",
      area: "Bauteil A / Ebene 2",
      week: "KW 39",
      shortTarget: "Hauptkanal Abschnitt Ost",
      fullTarget:
        "Hauptkanal im Abschnitt Ost inklusive Aufhaengungen und gepruefter Revisionszugaenge fertigstellen.",
      deviation: "IST / Abweichung: __________________________________",
    }),
    activity({
      sourceProjectId: "synthetic-project-nord",
      sourceActivityId: "SYN-PROC-2001",
      boardId: "board-nord-b",
      markerSlot: 4096,
      company: "Mock Elektro Alpha",
      trade: "Elektro",
      area: "Bauteil B / Ebene 1",
      week: "KW 36",
      shortTarget: "Unterverteilung vorbereiten",
      fullTarget:
        "Unterverteilung B1 vorbereiten, Stromkreise beschriften und den Prueftermin abstimmen.",
      deviation: "IST / Abweichung: __________________________________",
    }),
    activity({
      sourceProjectId: "synthetic-project-nord",
      sourceActivityId: "SYN-PROC-2002",
      boardId: "board-nord-b",
      markerSlot: 12000,
      company: "Mock Klima Team",
      trade: "Lueftung",
      area: "Bauteil B / Ebene 1",
      week: "KW 40",
      shortTarget: "Volumenstromregler setzen",
      fullTarget:
        "Volumenstromregler gemaess synthetischem Montageplan setzen und fuer die Einregulierung markieren.",
      deviation: "IST / Abweichung: __________________________________",
    }),
    activity({
      sourceProjectId: "synthetic-project-sued",
      sourceActivityId: "SYN-PROC-1001",
      boardId: "board-sued-a",
      markerSlot: 20000,
      company: "Mock Logistik GmbH",
      trade: "Logistik",
      area: "Halle 1 / Abschnitt Nord",
      week: "KW 37",
      shortTarget: "Materialzone einrichten",
      fullTarget:
        "Materialzone Nord markieren, Rettungswege freihalten und Uebergabeflaechen sichtbar zuordnen.",
      deviation: "IST / Abweichung: __________________________________",
    }),
    activity({
      sourceProjectId: "synthetic-project-sued",
      sourceActivityId: "SYN-PROC-1002",
      boardId: "board-sued-a",
      markerSlot: 31742,
      company: "Mock Stahl Partner",
      trade: "Stahlbau",
      area: "Halle 1 / Abschnitt Nord",
      week: "KW 41",
      shortTarget: "Buehnenanschluss montieren",
      fullTarget:
        "Buehnenanschluss am Nordfeld montieren und die Kontrollpunkte fuer die Abnahme zugaenglich halten.",
      deviation: "IST / Abweichung: __________________________________",
    }),
  ],
}

export type TagOnlyFilters = {
  company: string
  trade: string
  area: string
  week: string
}

export function filterTagOnlyActivities(
  fixture: TagOnlyFixture,
  projectId: string,
  boardId: string,
  filters: TagOnlyFilters,
): TagOnlyActivity[] {
  return fixture.activities.filter(
    (item) =>
      item.sourceProjectId === projectId &&
      item.boardId === boardId &&
      (!filters.company || item.company === filters.company) &&
      (!filters.trade || item.trade === filters.trade) &&
      (!filters.area || item.area === filters.area) &&
      (!filters.week || item.week === filters.week),
  )
}

export function validateTagOnlyFixture(fixture: TagOnlyFixture): TagOnlyFixture {
  if (
    fixture.schemaVersion !== "demo-04-tag-only-fixture-v1" ||
    fixture.scope !== "synthetic_non_product_target_picture"
  ) {
    throw new Error("Das Zielbild-Fixture hat einen unerwarteten Vertragskopf.")
  }
  const projects = new Set(fixture.projects.map((item) => item.sourceProjectId))
  const boards = new Map(fixture.boards.map((item) => [item.id, item]))
  const boardMarkerIds = new Set<number>()
  const sourceKeys = new Set<string>()
  const tagIds = new Set<number>()
  const tradeColors = new Map<string, string>()
  const colorTrades = new Map<string, string>()
  for (const board of fixture.boards) {
    if (
      !projects.has(board.sourceProjectId) ||
      !Number.isInteger(board.boardMarkerId) ||
      board.boardMarkerId < TAG_ONLY_BOARD_ID_MIN ||
      board.boardMarkerId > TAG_ONLY_BOARD_ID_MAX ||
      !TAG_ONLY_BOUND_BOARD_IDS.has(board.boardMarkerId) ||
      boardMarkerIds.has(board.boardMarkerId)
    ) {
      throw new Error(`Ungueltige Tafelzuordnung: ${board.id}`)
    }
    boardMarkerIds.add(board.boardMarkerId)
  }
  for (const item of fixture.activities) {
    const board = boards.get(item.boardId)
    const sourceKey = `${item.sourceProjectId}\u0000${item.sourceActivityId}`
    if (!board || board.sourceProjectId !== item.sourceProjectId || sourceKeys.has(sourceKey)) {
      throw new Error(`Ungueltiger Quellschluessel: ${item.sourceActivityId}`)
    }
    if (
      !Number.isInteger(item.markerSlot) ||
      !Number.isInteger(item.activeTagId) ||
      !Number.isInteger(item.doneTagId) ||
      item.activeTagId !== 2 * item.markerSlot ||
      item.doneTagId !== 2 * item.markerSlot + 1 ||
      item.activeTagId < TAG_ONLY_CARD_ID_MIN ||
      item.doneTagId > TAG_ONLY_CARD_ID_MAX ||
      !TAG_ONLY_BOUND_CARD_IDS.has(item.activeTagId) ||
      !TAG_ONLY_BOUND_CARD_IDS.has(item.doneTagId) ||
      tagIds.has(item.activeTagId) ||
      tagIds.has(item.doneTagId)
    ) {
      throw new Error(`Ungueltiges nichtproduktives ID-Paar: ${item.sourceActivityId}`)
    }
    const knownColor = tradeColors.get(item.trade)
    const knownTrade = colorTrades.get(item.tradeColor)
    if (
      item.tradeColorSource !== "synthetic_mock" ||
      !/^#[0-9a-f]{6}$/i.test(item.tradeColor) ||
      (knownColor !== undefined && knownColor !== item.tradeColor) ||
      (knownTrade !== undefined && knownTrade !== item.trade)
    ) {
      throw new Error(`Ungueltige synthetische Gewerksfarbe: ${item.trade}`)
    }
    tradeColors.set(item.trade, item.tradeColor)
    colorTrades.set(item.tradeColor, item.trade)
    sourceKeys.add(sourceKey)
    tagIds.add(item.activeTagId)
    tagIds.add(item.doneTagId)
  }
  return fixture
}
