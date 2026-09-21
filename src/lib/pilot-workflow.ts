import type {
  PilotDelta,
  PilotPlanCard,
  PilotPrintPreparation,
  PilotPrintRequest,
  PilotProjectState,
  PilotRevision,
} from "@/lib/pilot-api"

export type PilotCardDisposition =
  | "new_print"
  | "replacement_print"
  | "reuse"
  | "outside"
  | "clarify"

export type PilotCardFilters = {
  area: string[]
  trade: string[]
  process: string[]
  week: string[]
  query: string
}

export type PilotCardFacet = "area" | "trade" | "process" | "week"

export const PILOT_BOARD_CAPACITY = 900

export const EMPTY_PILOT_CARD_FILTERS: PilotCardFilters = {
  area: [],
  trade: [],
  process: [],
  week: [],
  query: "",
}

export function mergePilotCardSelection(current: readonly string[], added: readonly string[]) {
  const next = [...new Set([...current, ...added])]
  return next.length <= PILOT_BOARD_CAPACITY ? next : null
}

export function pilotIsoWeek(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ""
  const value = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== date) return ""
  const thursday = new Date(value)
  const day = thursday.getUTCDay() || 7
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day)
  const weekYear = thursday.getUTCFullYear()
  const yearStart = new Date(Date.UTC(weekYear, 0, 1))
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${weekYear}-KW${String(week).padStart(2, "0")}`
}

function pilotFacetValue(card: PilotPlanCard, facet: PilotCardFacet) {
  if (facet === "area") return card.area ?? ""
  if (facet === "trade") return card.trade ?? ""
  if (facet === "process") return card.sourceActivityId
  return pilotIsoWeek(card.date) || "Ohne ISO-Woche"
}

function matchesPilotFilters(
  card: PilotPlanCard,
  filters: PilotCardFilters,
  ignoredFacet?: PilotCardFacet,
) {
  for (const facet of ["area", "trade", "process", "week"] as const) {
    if (
      facet !== ignoredFacet &&
      filters[facet].length &&
      !filters[facet].includes(pilotFacetValue(card, facet))
    ) {
      return false
    }
  }
  const query = filters.query.trim().toLocaleLowerCase("de")
  if (!query) return true
  return [
    card.activity,
    card.task,
    card.trade,
    card.company,
    card.area,
    card.date,
    card.sourceStatus,
  ].some((value) => value?.toLocaleLowerCase("de").includes(query))
}

function pilotProcessOptions(cards: readonly PilotPlanCard[]) {
  const grouped = new Map<string, PilotPlanCard[]>()
  for (const card of cards) {
    const current = grouped.get(card.sourceActivityId) ?? []
    current.push(card)
    grouped.set(card.sourceActivityId, current)
  }
  return [...grouped.entries()]
    .map(([value, entries]) => {
      const first = entries[0]!
      const areas = [...new Set(entries.map((card) => card.area).filter(Boolean))] as string[]
      const dates = entries.map((card) => card.date).sort()
      const range = dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} bis ${dates.at(-1)}`
      return {
        value,
        label: `${first.activity} · ${areas.join(" / ") || "ohne Bereich"} · ${range}`,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label, "de"))
}

export function filterPilotCards(cards: readonly PilotPlanCard[], filters: PilotCardFilters) {
  return cards.filter((card) => matchesPilotFilters(card, filters))
}

export function pilotFacetOptions(
  cards: readonly PilotPlanCard[],
  filters: PilotCardFilters,
  facet: PilotCardFacet,
) {
  const candidates = cards.filter((card) => matchesPilotFilters(card, filters, facet))
  if (facet === "process") return pilotProcessOptions(candidates)
  return [...new Set(candidates.map((card) => pilotFacetValue(card, facet)))]
    .sort((left, right) => left.localeCompare(right, "de"))
    .map((value) => ({
      value,
      label:
        facet === "area"
          ? value || "Ohne Bereich"
          : facet === "trade"
            ? value || "Ohne Gewerk"
            : value.replace(/^(\d{4})-KW(\d{2})$/, "KW $2 / $1"),
    }))
}

export function normalizePilotFilters(
  cards: readonly PilotPlanCard[],
  filters: PilotCardFilters,
  lockedFacet?: PilotCardFacet,
) {
  const next: PilotCardFilters = {
    area: [...filters.area],
    trade: [...filters.trade],
    process: [...filters.process],
    week: [...filters.week],
    query: filters.query,
  }
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false
    for (const facet of ["area", "trade", "process", "week"] as const) {
      if (facet === lockedFacet) continue
      const available = new Set(pilotFacetOptions(cards, next, facet).map((option) => option.value))
      const retained = next[facet].filter((value) => available.has(value))
      if (retained.length !== next[facet].length) {
        next[facet] = retained
        changed = true
      }
    }
    if (!changed) break
  }
  return next
}

export function pilotActiveCards(state: PilotProjectState) {
  const result = new Map<
    string,
    { boardId: string; revision: number; card: PilotPrintPreparation["cards"][number] }
  >()
  if (!("boards" in state.activePlacement)) return result
  for (const [boardId, preparation] of Object.entries(state.activePlacement.boards)) {
    for (const card of preparation.cards) {
      result.set(card.sourcePlanCardId, { boardId, revision: preparation.revision, card })
    }
  }
  return result
}

export function pilotCardDisposition(
  delta: PilotDelta,
  active: ReturnType<typeof pilotActiveCards>,
  selectedRevision?: number,
): PilotCardDisposition {
  if (delta.kind === "outside_forecast") return "outside"
  if (["removed_or_unclear", "removed_confirmed", "parent_conflict"].includes(delta.kind)) {
    return "clarify"
  }
  if (
    selectedRevision !== undefined &&
    active.get(delta.sourcePlanCardId)?.revision === selectedRevision
  )
    return "reuse"
  if (delta.replacementPrintRequired) return "replacement_print"
  return active.has(delta.sourcePlanCardId) ? "reuse" : "new_print"
}

export function pilotCardsInScope(cards: PilotPlanCard[], start: string, end: string) {
  return cards.filter((card) => card.date >= start && card.date <= end)
}

export function pilotCardsToPrint(
  preparation: PilotPrintPreparation,
  revision: PilotRevision,
  state: PilotProjectState,
) {
  const delta = new Map(revision.delta.map((item) => [item.sourcePlanCardId, item]))
  const active = pilotActiveCards(state)
  return preparation.cards
    .filter((card) => {
      const item = delta.get(card.sourcePlanCardId)
      return item && pilotCardDisposition(item, active, revision.revision) !== "reuse"
    })
    .map((card) => card.sourcePlanCardId)
}

export function assertPilotPrintPreparation(
  preparation: PilotPrintPreparation,
  request: PilotPrintRequest,
  sourceProjectId: string,
) {
  const responseIds = preparation.cards.map((card) => card.sourcePlanCardId)
  if (
    preparation.requestId !== request.requestId ||
    preparation.sourceProjectId !== sourceProjectId ||
    preparation.revision !== request.revision ||
    preparation.boardId !== request.boardId ||
    responseIds.length !== request.cardIds.length ||
    responseIds.some((id, index) => id !== request.cardIds[index])
  ) {
    throw new Error("Die Druckvorbereitung passt nicht zur angeforderten Projekt-/Kartenbindung.")
  }
}
