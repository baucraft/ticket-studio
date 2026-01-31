import { beforeAll, describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"

import type { SheetJSImport } from "@/lib/sheetjs"
import { DEFAULT_TEMPLATE } from "@/lib/default-template"
import { exportTicketsPdfBytes } from "@/lib/export-pdf"
import { aoaToImportTable, applyMapping, suggestMapping } from "@/lib/import-xlsx"
import { A4_SIZE_MM, mmToPt } from "@/lib/units"
import { renderTemplateString } from "@/lib/render-template"

// Internal pdf-lib helpers for inspecting content streams.
// Use CJS paths to match the runtime build used by pdf-lib in Node.
import PDFContentStream from "pdf-lib/cjs/core/structures/PDFContentStream"
import PDFArray from "pdf-lib/cjs/core/objects/PDFArray"
import PDFRawStream from "pdf-lib/cjs/core/objects/PDFRawStream"
import PDFStream from "pdf-lib/cjs/core/objects/PDFStream"
import { decodePDFRawStream } from "pdf-lib/cjs/core/streams/decode"

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

function decodedPageContents(pdf: PDFDocument, pageIndex: number) {
  const page = pdf.getPages()[pageIndex] as unknown as {
    node: {
      normalizedEntries: () => {
        Contents?: PDFArray
      }
    }
  }

  const entries = page.node.normalizedEntries()
  const contents = entries.Contents
  if (!contents) return ""

  let out = ""
  for (let i = 0, len = contents.size(); i < len; i += 1) {
    const stream = contents.lookup(i, PDFStream)
    if (stream instanceof PDFRawStream) {
      out += new TextDecoder().decode(decodePDFRawStream(stream).decode())
      out += "\n"
    } else if (stream instanceof PDFContentStream) {
      out += new TextDecoder().decode(stream.getUnencodedContents())
      out += "\n"
    }
  }
  return out
}

function textToPdfHexString(text: string) {
  const bytes = new TextEncoder().encode(text)
  return (
    "<" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase() +
    ">"
  )
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

  it("exports a printable A4 PDF (2x2 grid)", async () => {
    const serial = excelSerialFromUtcDate(2026, 7, 13)

    const export15 = roundTripAoa([
      ["Id", "Datum", "Prozess ID", "Aufgabe", "Status", "Gewerk"],
      ["t#0", serial, 14926, "Walls & floors", "OPEN", "Trade"],
      ["t#1", serial + 1, 14926, "Walls & floors", "OPEN", "Trade"],
      ["t#2", serial + 2, 14926, "Walls & floors", "OPEN", "Trade"],
      ["t#3", serial + 3, 14926, "Walls & floors", "OPEN", "Trade"],
      ["t#4", serial + 4, 14926, "Walls & floors", "OPEN", "Trade"],
    ])

    const table = aoaToImportTable("export15.xlsx", export15)
    const mapping = suggestMapping(table)
    const tickets = applyMapping(table, mapping)

    const pdfBytes = await exportTicketsPdfBytes({ tickets, template: DEFAULT_TEMPLATE })
    expect(pdfBytes.length).toBeGreaterThan(1_000)
    expect(new TextDecoder().decode(pdfBytes.slice(0, 4))).toBe("%PDF")

    const pdf = await PDFDocument.load(pdfBytes)
    expect(pdf.getPageCount()).toBe(2)

    const p0 = pdf.getPages()[0]
    const size0 = p0.getSize()
    expect(Math.abs(size0.width - mmToPt(A4_SIZE_MM.width))).toBeLessThan(0.001)
    expect(Math.abs(size0.height - mmToPt(A4_SIZE_MM.height))).toBeLessThan(0.001)

    const content0 = decodedPageContents(pdf, 0)
    expect(content0).toContain(textToPdfHexString("Walls & floors"))

    const content1 = decodedPageContents(pdf, 1)
    expect(content1).toContain(textToPdfHexString("Walls & floors"))
  })
})
