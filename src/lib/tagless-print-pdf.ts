import { PDFDocument, PDFName, PDFNumber, rgb, StandardFonts } from "pdf-lib"

import {
  drawPilotCardFace,
  mm,
  PILOT_CARD_INNER_LONG_MM,
  PILOT_CARD_INNER_SHORT_MM,
  PILOT_CARD_LONG_MM,
  PILOT_CARD_SHORT_MM,
} from "@/lib/pilot-card-layout"
import { ticketArea } from "@/lib/tagless-workflow"
import type { TicketData } from "@/lib/ticket-types"

const FIXED_DATE = new Date("2026-09-18T00:00:00.000Z")
const DEFAULT_TRADE_COLOR = "#0f766e"
const TAGLESS_TITLE_SIZE_MM = 3.2

export function taglessPdfTradeColor(value?: string) {
  const match = (value || DEFAULT_TRADE_COLOR).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!match) return taglessPdfTradeColor(DEFAULT_TRADE_COLOR)
  return rgb(
    Number.parseInt(match[1]!, 16) / 255,
    Number.parseInt(match[2]!, 16) / 255,
    Number.parseInt(match[3]!, 16) / 255,
  )
}

export async function createTaglessCardsPdf(tickets: readonly TicketData[]) {
  if (
    tickets.length === 0 ||
    new Set(tickets.map((ticket) => ticket.ticketId)).size !== tickets.length
  ) {
    throw new Error("Der PDF-Drucksatz muss mindestens eine eindeutige lokale Karte enthalten.")
  }

  const rawDocument = await PDFDocument.create({ updateMetadata: false })
  const font = await rawDocument.embedFont(StandardFonts.Helvetica)
  const bold = await rawDocument.embedFont(StandardFonts.HelveticaBold)
  for (const [index, ticket] of tickets.entries()) {
    if (!ticket.date) throw new Error(`Karte ${index + 1} hat kein Datum.`)
    const page = rawDocument.addPage([mm(PILOT_CARD_SHORT_MM), mm(PILOT_CARD_LONG_MM)])
    try {
      drawPilotCardFace(
        page,
        font,
        bold,
        {
          activity: ticket.taskName,
          task: ticket.description,
          trade: ticket.trade,
          area: ticketArea(ticket),
          date: ticket.date,
        },
        undefined,
        taglessPdfTradeColor(ticket.tradeColor),
        TAGLESS_TITLE_SIZE_MM,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "unbekannter Renderfehler"
      throw new Error(`Karte ${index + 1}: ${message}`)
    }
    page.node.set(PDFName.of("TaglessCardIndex"), PDFNumber.of(index + 1))
    page.node.set(PDFName.of("TaglessVisibleTextFit"), PDFNumber.of(1))
  }
  const rawBytes = await rawDocument.save({ addDefaultPage: false, useObjectStreams: false })

  const document = await PDFDocument.create({ updateMetadata: false })
  document.setTitle("Prozessplan-Karten ohne Tags")
  document.setAuthor("Ticket Studio")
  document.setCreator("Ticket Studio tagless-print-v1")
  document.setProducer("Ticket Studio tagless-print-v1")
  document.setSubject(
    `${tickets.length} Karten | ${PILOT_CARD_SHORT_MM} x ${PILOT_CARD_LONG_MM} mm | Innenrahmen ${PILOT_CARD_INNER_SHORT_MM} x ${PILOT_CARD_INNER_LONG_MM} mm`,
  )
  document.setCreationDate(FIXED_DATE)
  document.setModificationDate(FIXED_DATE)

  const source = await PDFDocument.load(rawBytes, { updateMetadata: false })
  const insetX = 1.75
  const insetY = 1.5
  for (const [index, sourcePage] of source.getPages().entries()) {
    const embedded = await document.embedPage(sourcePage, {
      left: mm(insetX),
      bottom: mm(insetY),
      right: mm(64.25),
      top: mm(118.5),
    })
    const page = document.addPage([mm(PILOT_CARD_SHORT_MM), mm(PILOT_CARD_LONG_MM)])
    page.drawPage(embedded, {
      x: mm(insetX),
      y: mm(insetY),
      width: mm(PILOT_CARD_INNER_SHORT_MM),
      height: mm(PILOT_CARD_INNER_LONG_MM),
    })
    page.drawRectangle({
      x: mm(1.875),
      y: mm(1.625),
      width: mm(62.25),
      height: mm(116.75),
      borderColor: rgb(0.15, 0.18, 0.23),
      borderWidth: mm(0.25),
    })
    page.setTrimBox(0, 0, mm(PILOT_CARD_SHORT_MM), mm(PILOT_CARD_LONG_MM))
    page.setBleedBox(0, 0, mm(PILOT_CARD_SHORT_MM), mm(PILOT_CARD_LONG_MM))
    page.node.set(PDFName.of("TaglessCardIndex"), PDFNumber.of(index + 1))
    page.node.set(PDFName.of("TaglessOuterShortMm"), PDFNumber.of(PILOT_CARD_SHORT_MM))
    page.node.set(PDFName.of("TaglessOuterLongMm"), PDFNumber.of(PILOT_CARD_LONG_MM))
    page.node.set(PDFName.of("TaglessInnerShortMm"), PDFNumber.of(PILOT_CARD_INNER_SHORT_MM))
    page.node.set(PDFName.of("TaglessInnerLongMm"), PDFNumber.of(PILOT_CARD_INNER_LONG_MM))
    page.node.set(PDFName.of("TaglessVisibleTextFit"), PDFNumber.of(1))
    page.node.set(PDFName.of("TaglessBothCardEnds"), PDFNumber.of(1))
  }
  return document.save({ addDefaultPage: false, useObjectStreams: false })
}

export function downloadTaglessPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
