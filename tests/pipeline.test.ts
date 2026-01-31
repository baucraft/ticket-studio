import { beforeAll, describe, expect, it } from "vitest"

import type { SheetJSImport } from "@/lib/sheetjs"
import { aoaToImportTable, applyMapping, suggestMapping } from "@/lib/import-xlsx"
import { renderTemplateString } from "@/lib/render-template"

let XLSX: SheetJSImport

beforeAll(async () => {
  XLSX = (await import("../public/vendor/xlsx-0.20.3.mjs")) as unknown as SheetJSImport
})

function excelSerialFromUtcDate(y: number, m: number, d: number) {
  const epoch = Date.UTC(1899, 11, 30)
  const ms = Date.UTC(y, m - 1, d) - epoch
  return ms / (24 * 60 * 60 * 1000)
}

function roundTripAoa(aoa: unknown[][]) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa as unknown[][])
  XLSX.utils.book_append_sheet(wb, ws, "Sheet 1")
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer

  const wb2 = XLSX.read(bytes, { type: "array" })
  const ws2 = (wb2.Sheets as Record<string, unknown>)[wb2.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws2, { header: 1, defval: "" }) as unknown[][]
}

describe("ticket pipeline", () => {
  it("renders Mustache tokens without HTML escaping", () => {
    expect(renderTemplateString("{{taskName}}", { taskName: "Walls & floors" })).toBe(
      "Walls & floors",
    )
  })

  it("detects export (15) and generates tickets", () => {
    const serial = excelSerialFromUtcDate(2026, 7, 13) // 2026-07-13

    const export15 = roundTripAoa([
      [
        "Id",
        "Bereich Ebene 1",
        "Bereich Ebene 2",
        "Bereich Ebene 3",
        "Bereich Ebene 4",
        "Bereich Ebene 5",
        "Datum",
        "Prozessname",
        "Prozess ID",
        "Aufgabe",
        "Status",
        "Beschreibung",
        "Gewerk",
      ],
      [
        "14926-0#0",
        "Gebäude A",
        "L10",
        "Takt 4",
        "Wände",
        "",
        serial,
        "Deckensystem",
        14926,
        "Deckensystem",
        "OPEN",
        "",
        "Heiz-Kühldecke GK",
      ],
      [
        "14926-0#1",
        "Gebäude A",
        "L10",
        "Takt 4",
        "Wände",
        "",
        serial + 1,
        "Deckensystem",
        14926,
        "Deckensystem",
        "OPEN",
        "",
        "Heiz-Kühldecke GK",
      ],
    ])

    const table = aoaToImportTable("export15.xlsx", export15)
    expect(table.sourceKind).toBe("export15")

    const mapping = suggestMapping(table)
    const tickets = applyMapping(table, mapping)

    expect(tickets).toHaveLength(2)
    expect(tickets[0]).toMatchObject({
      ticketId: "14926-0#0",
      taskId: "14926",
      taskName: "Deckensystem",
      date: "2026-07-13",
      status: "OPEN",
      trade: "Heiz-Kühldecke GK",
    })
  })

  it("detects export (14) and expands tasks into day tickets", () => {
    const start = excelSerialFromUtcDate(2026, 7, 13) // Mon
    const end = excelSerialFromUtcDate(2026, 7, 17) // Fri

    const export14 = roundTripAoa([
      [
        "Id",
        "Prozessname",
        "Startdatum",
        "Enddatum",
        "Status",
        "Status Text",
        "Dauer",
        "Gewerk",
        "Gewerk Hintergrundfarbe",
        "Bereich Ebene 1",
        "Bereich Ebene 2",
      ],
      [
        14926,
        "Deckensystem",
        start,
        end,
        0,
        "Offen",
        5,
        "Heiz-Kühldecke GK",
        "RGB(11,0,176)",
        "Gebäude A",
        "L10",
      ],
    ])

    const table = aoaToImportTable("export14.xlsx", export14)
    expect(table.sourceKind).toBe("export14")

    const mapping = suggestMapping(table)
    const tickets = applyMapping(table, mapping, { export14DayMode: "auto" })

    expect(tickets).toHaveLength(5)
    expect(tickets[0].date).toBe("2026-07-13")
    expect(tickets[4].date).toBe("2026-07-17")
    expect(tickets[0].tradeColor).toBe("#0b00b0")
  })

  // Note: PDF export test removed because it requires browser canvas APIs
  // which are not available in Node.js. PDF export is tested manually in the browser.
})
