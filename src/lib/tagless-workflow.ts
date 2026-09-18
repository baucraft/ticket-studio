import { applyMapping, suggestMapping, type GenerateMode } from "@/lib/import-xlsx"
import type { ImportTable, TicketData } from "@/lib/ticket-types"

export type TaglessDayMode = Exclude<GenerateMode, "auto">

export type TaglessFilters = {
  area: string
  trade: string
  date: string
  week: string
  query: string
}

export const EMPTY_TAGLESS_FILTERS: TaglessFilters = {
  area: "",
  trade: "",
  date: "",
  week: "",
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

export function filterTaglessTickets(tickets: readonly TicketData[], filters: TaglessFilters) {
  const query = filters.query.trim().toLocaleLowerCase("de")
  return tickets.filter((ticket) => {
    const area = ticketArea(ticket)
    if (filters.area && area !== filters.area) return false
    if (filters.trade && (ticket.trade || "Ohne Gewerk") !== filters.trade) return false
    if (filters.date && ticket.date !== filters.date) return false
    if (filters.week && isoWeek(ticket.date || "") !== filters.week) return false
    if (!query) return true
    return [ticket.taskName, ticket.trade, area, ticket.date, ticket.description]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("de")
      .includes(query)
  })
}
