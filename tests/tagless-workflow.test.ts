import { decodePDFRawStream, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { aoaToImportTable } from "@/lib/import-xlsx"
import { createTaglessCardsPdf } from "@/lib/tagless-print-pdf"
import {
  createTaglessTickets,
  EMPTY_TAGLESS_FILTERS,
  filterTaglessTickets,
  isoWeek,
  normalizeTaglessFilters,
  taglessFacetOptions,
  validateTaglessProcessPlan,
} from "@/lib/tagless-workflow"

function excelSerial(date: string) {
  return (Date.parse(`${date}T00:00:00.000Z`) - Date.UTC(1899, 11, 30)) / 86_400_000
}

function processPlanTable() {
  return aoaToImportTable("prozessplan.xlsx", [
    [
      "Id",
      "Prozessname",
      "Startdatum",
      "Enddatum",
      "Dauer",
      "Gewerk",
      "Gewerk Hintergrundfarbe",
      "Bereich Ebene 1",
      "Bereich Ebene 2",
      "Kommentare",
    ],
    [
      101,
      "Waende stellen",
      excelSerial("2026-09-14"),
      excelSerial("2026-09-20"),
      99,
      "Trockenbau",
      "RGB(15,118,110)",
      "Nord",
      "Ebene 1",
      "Material bereitstellen",
    ],
    [
      202,
      "Leitungen montieren",
      excelSerial("2026-09-19"),
      excelSerial("2026-09-20"),
      1,
      "Elektro",
      "RGB(3,105,161)",
      "Sued",
      "Ebene 2",
      "Trasse pruefen",
    ],
  ])
}

function embeddedCardContent(document: PDFDocument, pageIndex: number) {
  const resources = document.getPage(pageIndex).node.Resources()
  if (!resources) throw new Error("missing PDF resources")
  const objects = resources.lookup(PDFName.of("XObject"), PDFDict)
  return objects
    .entries()
    .map(([, object]) => {
      const stream = document.context.lookup(object, PDFRawStream)
      return Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")
    })
    .join("\n")
}

function textOperators(content: string) {
  return [...content.matchAll(/<([0-9A-F]+)> Tj/g)].map((match) =>
    Buffer.from(match[1]!, "hex").toString("latin1"),
  )
}

describe("tagless process-plan workflow", () => {
  it("requires explicit calendar confirmation and ignores contradictory duration hints", () => {
    const table = processPlanTable()
    expect(() => createTaglessTickets(table, null)).toThrow(/sichtbar bestaetigt/)

    const weekdays = createTaglessTickets(table, "weekdays")
    const mondaySaturday = createTaglessTickets(table, "monday-saturday")
    const allDays = createTaglessTickets(table, "all-days")

    expect(weekdays.map((ticket) => ticket.date)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ])
    expect(mondaySaturday).toHaveLength(7)
    expect(mondaySaturday.filter((ticket) => ticket.date === "2026-09-19")).toHaveLength(2)
    expect(allDays).toHaveLength(9)
    expect(allDays.filter((ticket) => ticket.date === "2026-09-20")).toHaveLength(2)
  })

  it("rejects Plan Cards and unknown spreadsheets", () => {
    const planCards = aoaToImportTable("plankarten.xlsx", [
      ["Id", "Prozess ID", "Aufgabe", "Datum"],
      ["card-1", 101, "Waende stellen", excelSerial("2026-09-14")],
    ])
    const unknown = aoaToImportTable("fremd.xlsx", [
      ["Name", "Wert"],
      ["A", "B"],
    ])
    expect(() => createTaglessTickets(planCards, "weekdays")).toThrow(/Nur Prozessplan-XLSX/)
    expect(() => createTaglessTickets(unknown, "weekdays")).toThrow(/Nur Prozessplan-XLSX/)

    const incomplete = aoaToImportTable("leer.xlsx", [
      ["Startdatum", "Enddatum", "Prozessname"],
      [excelSerial("2026-09-14"), excelSerial("2026-09-15"), "Ohne ID"],
    ])
    expect(() => validateTaglessProcessPlan(incomplete)).toThrow(/erforderlichen Spalten/)
  })

  it("filters by area, trade, date, ISO week and free text", () => {
    const tickets = createTaglessTickets(processPlanTable(), "all-days")
    expect(isoWeek("2026-12-31")).toBe("2026-KW53")
    expect(isoWeek("2027-01-01")).toBe("2026-KW53")
    expect(
      filterTaglessTickets(tickets, {
        ...EMPTY_TAGLESS_FILTERS,
        area: ["Nord / Ebene 1"],
        trade: ["Trockenbau"],
        date: ["2026-09-16"],
        query: "material",
      }),
    ).toHaveLength(1)
    expect(
      filterTaglessTickets(tickets, {
        ...EMPTY_TAGLESS_FILTERS,
        week: ["2026-KW38"],
        query: "trasse",
      }),
    ).toHaveLength(2)
  })

  it("combines multi-value filters and limits every facet by the other filters", () => {
    const base = createTaglessTickets(processPlanTable(), "all-days")
    const tickets = [
      ...base,
      {
        ...base[0]!,
        ticketId: "303:2026-10-01",
        taskId: "303",
        taskName: "Decke streichen",
        date: "2026-10-01",
        trade: "Maler",
        area: { level1: "West" },
      },
    ]
    const weeks = { ...EMPTY_TAGLESS_FILTERS, week: ["2026-KW38", "2026-KW40"] }
    expect(filterTaglessTickets(tickets, weeks)).toHaveLength(10)
    expect(
      filterTaglessTickets(tickets, {
        ...weeks,
        trade: ["Elektro", "Maler"],
      }),
    ).toHaveLength(3)

    const north = { ...EMPTY_TAGLESS_FILTERS, area: ["Nord / Ebene 1"] }
    expect(taglessFacetOptions(tickets, north, "trade")).toEqual(["Trockenbau"])
    expect(taglessFacetOptions(tickets, north, "week")).toEqual(["2026-KW38"])
    expect(taglessFacetOptions(tickets, north, "date")).toHaveLength(7)

    const normalized = normalizeTaglessFilters(
      tickets,
      {
        ...north,
        trade: ["Trockenbau"],
        date: ["2026-09-16"],
        week: ["2026-KW40"],
      },
      "week",
    )
    expect(normalized).toMatchObject({
      area: [],
      trade: [],
      date: [],
      week: ["2026-KW40"],
    })
    expect(taglessFacetOptions(tickets, normalized, "trade")).toEqual(["Maler"])
    expect(taglessFacetOptions(tickets, normalized, "area")).toEqual(["West"])
  })

  it("exports only the chosen cards at pilot dimensions without code or tag identity", async () => {
    const tickets = createTaglessTickets(processPlanTable(), "weekdays")
    const chosen = [tickets[0]!, tickets[3]!]
    const bytes = await createTaglessCardsPdf(chosen)
    const document = await PDFDocument.load(bytes)

    expect(document.getPageCount()).toBe(2)
    expect(document.getPage(0).getSize()).toMatchObject({
      width: expect.closeTo((66 * 72) / 25.4, 5),
      height: expect.closeTo((120 * 72) / 25.4, 5),
    })
    expect(
      document.getPage(0).node.lookup(PDFName.of("TaglessBothCardEnds"), PDFNumber).asNumber(),
    ).toBe(1)
    expect(document.getPage(0).node.get(PDFName.of("PilotActiveTagId"))).toBeUndefined()
    expect(document.getPage(0).node.get(PDFName.of("PilotDoneTagId"))).toBeUndefined()

    const firstText = textOperators(embeddedCardContent(document, 0))
    const secondText = textOperators(embeddedCardContent(document, 1))
    expect(firstText.filter((value) => value === "Waende stellen")).toHaveLength(2)
    expect(secondText.filter((value) => value === "Waende stellen")).toHaveLength(2)
    expect(firstText.join(" ")).toContain("Material bereitstellen")
    expect(firstText.join(" ")).not.toMatch(/Tag|Code| ID /i)
    expect(secondText.join(" ")).not.toContain("Leitungen montieren")
    expect(Buffer.from(bytes).toString("latin1")).not.toMatch(/Pilot(?:Active|Done)TagId/)
  })

  it("uses each trade's exact XLSX RGB color in the exported card", async () => {
    const tickets = createTaglessTickets(processPlanTable(), "all-days")
    const dryConstruction = tickets.find((ticket) => ticket.trade === "Trockenbau")!
    const electrical = tickets.find((ticket) => ticket.trade === "Elektro")!
    const bytes = await createTaglessCardsPdf([dryConstruction, electrical])
    const document = await PDFDocument.load(bytes)
    const dryConstructionContent = embeddedCardContent(document, 0)
    const electricalContent = embeddedCardContent(document, 1)

    expect(dryConstruction.tradeColor).toBe("#0f766e")
    expect(electrical.tradeColor).toBe("#0369a1")
    expect(dryConstructionContent).toMatch(/0\.0588\d* 0\.4627\d* 0\.4313\d* rg/)
    expect(electricalContent).toMatch(/0\.0117\d* 0\.4117\d* 0\.6313\d* rg/)
    expect(dryConstructionContent).toMatch(/0\.86 0\.96 0\.9 rg/)
    expect(electricalContent).toMatch(/0\.86 0\.96 0\.9 rg/)
    expect(dryConstructionContent).toMatch(/9\.0708\d* Tf/)
    expect(electricalContent).toMatch(/9\.0708\d* Tf/)
    expect(dryConstructionContent).not.toMatch(/0\.0117\d* 0\.4117\d* 0\.6313\d* rg/)
    expect(electricalContent).not.toMatch(/0\.0588\d* 0\.4627\d* 0\.4313\d* rg/)
  })
})
