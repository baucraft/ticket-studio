import { applyMapping, suggestMapping, type GenerateMode } from "@/lib/import-xlsx"
import type { ImportTable, TicketData } from "@/lib/ticket-types"

export type TaglessDayMode = Exclude<GenerateMode, "auto">

export type TaglessFilters = {
  area: string[]
  trade: string[]
  date: string[]
  week: string[]
  query: string
}

export type TaglessFacet = "area" | "trade" | "date" | "week"

export const EMPTY_TAGLESS_FILTERS: TaglessFilters = {
  area: [],
  trade: [],
  date: [],
  week: [],
  query: "",
}

export function ticketArea(ticket: TicketData) {
  if (ticket.area?.path) return ticket.area.path
  return [
    ticket.area?.level1,
    ticket.area?.level2,
    ticket.area?.level3,
    ticket.area?.level4,
    ticket.area?.level5,
  ]
    .filter(Boolean)
    .join(" / ")
}

export function isoWeek(date: string) {
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

export function createTaglessTickets(table: ImportTable, confirmedMode: TaglessDayMode | null) {
  if (table.sourceKind !== "processPlan") {
    throw new Error("Nur Prozessplan-XLSX mit Startdatum und Enddatum wird akzeptiert.")
  }
  if (!confirmedMode) {
    throw new Error("Die Arbeitswoche muss vor der Tagesbildung sichtbar bestaetigt werden.")
  }
  const mapping = suggestMapping(table)
  if (!mapping.taskId || !mapping.taskName || !mapping.startDate || !mapping.endDate) {
    throw new Error("Der Prozessplan enthaelt nicht alle erforderlichen Spalten.")
  }
  const tickets = applyMapping(table, mapping, { processPlanDayMode: confirmedMode })
  if (tickets.length === 0) {
    throw new Error("Der Prozessplan enthaelt keine auswertbaren Vorgaenge mit gueltigem Zeitraum.")
  }
  const keys = new Set<string>()
  for (const ticket of tickets) {
    if (keys.has(ticket.ticketId)) {
      throw new Error("Der Prozessplan erzeugt nicht eindeutige lokale Karten.")
    }
    keys.add(ticket.ticketId)
  }
  return tickets
}

export function validateTaglessProcessPlan(table: ImportTable) {
  createTaglessTickets(table, "all-days")
}

function facetValue(ticket: TicketData, facet: TaglessFacet) {
  if (facet === "area") return ticketArea(ticket) || "Ohne Bereich"
  if (facet === "trade") return ticket.trade || "Ohne Gewerk"
  if (facet === "date") return ticket.date || "Ohne Datum"
  return isoWeek(ticket.date || "") || "Ohne ISO-Woche"
}

function matchesTaglessFilters(
  ticket: TicketData,
  filters: TaglessFilters,
  ignoredFacet?: TaglessFacet,
) {
  const query = filters.query.trim().toLocaleLowerCase("de")
  for (const facet of ["area", "trade", "date", "week"] as const) {
    if (
      facet !== ignoredFacet &&
      filters[facet].length &&
      !filters[facet].includes(facetValue(ticket, facet))
    ) {
      return false
    }
  }
  if (!query) return true
  return [ticket.taskName, ticket.trade, ticketArea(ticket), ticket.date, ticket.description]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("de")
    .includes(query)
}

export function filterTaglessTickets(tickets: readonly TicketData[], filters: TaglessFilters) {
  return tickets.filter((ticket) => matchesTaglessFilters(ticket, filters))
}

export function taglessFacetOptions(
  tickets: readonly TicketData[],
  filters: TaglessFilters,
  facet: TaglessFacet,
) {
  return [
    ...new Set(
      tickets
        .filter((ticket) => matchesTaglessFilters(ticket, filters, facet))
        .map((ticket) => facetValue(ticket, facet)),
    ),
  ].sort((left, right) => left.localeCompare(right, "de"))
}

export function normalizeTaglessFilters(
  tickets: readonly TicketData[],
  filters: TaglessFilters,
  lockedFacet?: TaglessFacet,
) {
  const next: TaglessFilters = {
    area: [...filters.area],
    trade: [...filters.trade],
    date: [...filters.date],
    week: [...filters.week],
    query: filters.query,
  }
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false
    for (const facet of ["area", "trade", "date", "week"] as const) {
      if (facet === lockedFacet) continue
      const available = new Set(taglessFacetOptions(tickets, next, facet))
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
