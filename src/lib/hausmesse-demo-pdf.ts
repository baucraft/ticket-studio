import { degrees, PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib"

import {
  createHausmesseDemoTickets,
  HAUSMESSE_CASE_ID,
  HAUSMESSE_LAYOUT_VERSION,
} from "@/lib/hausmesse-demo"
import { mmToPt } from "@/lib/units"
import type { TicketData } from "@/lib/ticket-types"

const CARD_WIDTH_MM = 66
const CARD_HEIGHT_MM = 120
const LABEL_WIDTH_MM = 25
const LABEL_HEIGHT_MM = 15
const TAG_SIZE_MM = 9
const DM_SIZE_MM = 11
const CODE_GAP_MM = 0.7
const SYMBOL_LEFT_MM = (LABEL_WIDTH_MM - TAG_SIZE_MM - CODE_GAP_MM - DM_SIZE_MM) / 2
const TOP_LABEL_X_MM = CARD_WIDTH_MM - LABEL_WIDTH_MM - 1
const TOP_LABEL_Y_MM = 1
const BOTTOM_LABEL_X_MM = 1
const BOTTOM_LABEL_Y_MM = CARD_HEIGHT_MM - LABEL_HEIGHT_MM - 1
const FIXED_DATE = new Date("2026-08-03T00:00:00.000Z")

function color(hex: string) {
  return rgb(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  )
}

function yFromTop(topMm: number, heightMm = 0) {
  return mmToPt(CARD_HEIGHT_MM - topMm - heightMm)
}

function fitText(font: PDFFont, text: string, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let fitted = text
  while (fitted.length && font.widthOfTextAtSize(`${fitted}...`, size) > maxWidth) {
    fitted = fitted.slice(0, -1)
  }
  return `${fitted}...`
}

function drawPathAtTop(
  page: PDFPage,
  path: string,
  naturalSize: number,
  xMm: number,
  topMm: number,
  sizeMm: number,
) {
  page.drawSvgPath(path, {
    x: mmToPt(xMm),
    y: mmToPt(CARD_HEIGHT_MM - topMm),
    scale: mmToPt(sizeMm) / naturalSize,
    color: rgb(0, 0, 0),
  })
}

function drawCodePair(page: PDFPage, ticket: TicketData, finished: boolean) {
  const labelX = finished ? BOTTOM_LABEL_X_MM : TOP_LABEL_X_MM
  const labelTop = finished ? BOTTOM_LABEL_Y_MM : TOP_LABEL_Y_MM
  page.drawRectangle({
    x: mmToPt(labelX),
    y: yFromTop(labelTop, LABEL_HEIGHT_MM),
    width: mmToPt(LABEL_WIDTH_MM),
    height: mmToPt(LABEL_HEIGHT_MM),
    color: rgb(1, 1, 1),
    borderColor: rgb(0.58, 0.64, 0.72),
    borderWidth: mmToPt(0.15),
  })
  const tagPath = finished ? ticket.finishedAprilTagRotatedPath! : ticket.activeAprilTagPath!
  const dataMatrixPath = finished ? ticket.dataMatrixRotatedPath! : ticket.dataMatrixPath!
  if (finished) {
    drawPathAtTop(
      page,
      dataMatrixPath,
      28,
      labelX + SYMBOL_LEFT_MM,
      labelTop + (LABEL_HEIGHT_MM - DM_SIZE_MM) / 2,
      DM_SIZE_MM,
    )
    drawPathAtTop(
      page,
      tagPath,
      8,
      labelX + SYMBOL_LEFT_MM + DM_SIZE_MM + CODE_GAP_MM,
      labelTop + (LABEL_HEIGHT_MM - TAG_SIZE_MM) / 2,
      TAG_SIZE_MM,
    )
  } else {
    drawPathAtTop(
      page,
      tagPath,
      8,
      labelX + SYMBOL_LEFT_MM,
      labelTop + (LABEL_HEIGHT_MM - TAG_SIZE_MM) / 2,
      TAG_SIZE_MM,
    )
    drawPathAtTop(
      page,
      dataMatrixPath,
      28,
      labelX + SYMBOL_LEFT_MM + TAG_SIZE_MM + CODE_GAP_MM,
      labelTop + (LABEL_HEIGHT_MM - DM_SIZE_MM) / 2,
      DM_SIZE_MM,
    )
  }
}

function drawCard(page: PDFPage, font: PDFFont, bold: PDFFont, ticket: TicketData) {
  const pageWidth = mmToPt(CARD_WIDTH_MM)
  const pageHeight = mmToPt(CARD_HEIGHT_MM)
  const tradeColor = color(ticket.tradeColor ?? "#3b82f6")
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.07, 0.09, 0.15),
    borderWidth: mmToPt(0.3),
  })
  page.drawRectangle({
    x: 0,
    y: yFromTop(0, 30),
    width: pageWidth,
    height: mmToPt(30),
    color: tradeColor,
    opacity: 0.12,
  })
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: mmToPt(30),
    color: tradeColor,
    opacity: 0.12,
  })
  page.drawRectangle({
    x: 0,
    y: yFromTop(0, 30),
    width: mmToPt(6),
    height: mmToPt(30),
    color: tradeColor,
  })
  page.drawRectangle({
    x: mmToPt(CARD_WIDTH_MM - 6),
    y: 0,
    width: mmToPt(6),
    height: mmToPt(30),
    color: tradeColor,
  })
  page.drawLine({
    start: { x: 0, y: yFromTop(30) },
    end: { x: pageWidth, y: yFromTop(30) },
    thickness: mmToPt(0.25),
    color: rgb(0.8, 0.84, 0.88),
  })
  page.drawLine({
    start: { x: 0, y: mmToPt(30) },
    end: { x: pageWidth, y: mmToPt(30) },
    thickness: mmToPt(0.25),
    color: rgb(0.8, 0.84, 0.88),
  })
  drawCodePair(page, ticket, false)
  drawCodePair(page, ticket, true)

  const trade = fitText(bold, ticket.trade ?? "", mmToPt(2.4), mmToPt(30))
  const company = fitText(font, ticket.company ?? "", mmToPt(2), mmToPt(30))
  const task = fitText(bold, ticket.taskName, mmToPt(3.1), mmToPt(55))
  page.drawText(trade, {
    x: mmToPt(8),
    y: yFromTop(7),
    size: mmToPt(2.4),
    font: bold,
    color: rgb(0.07, 0.09, 0.15),
  })
  page.drawText(company, {
    x: mmToPt(8),
    y: yFromTop(12),
    size: mmToPt(2),
    font,
    color: rgb(0.28, 0.35, 0.44),
  })
  page.drawText(task, {
    x: mmToPt(8),
    y: yFromTop(21),
    size: mmToPt(3.1),
    font: bold,
    color: rgb(0.07, 0.09, 0.15),
  })
  page.drawText(`${ticket.ticketId} | AKTIV`, {
    x: mmToPt(8),
    y: yFromTop(28),
    size: mmToPt(1.8),
    font,
    color: rgb(0.39, 0.45, 0.55),
  })

  page.drawText(trade, {
    x: mmToPt(CARD_WIDTH_MM - 8),
    y: mmToPt(7),
    size: mmToPt(2.4),
    font: bold,
    rotate: degrees(180),
    color: rgb(0.07, 0.09, 0.15),
  })
  page.drawText(company, {
    x: mmToPt(CARD_WIDTH_MM - 8),
    y: mmToPt(12),
    size: mmToPt(2),
    font,
    rotate: degrees(180),
    color: rgb(0.28, 0.35, 0.44),
  })
  page.drawText(task, {
    x: mmToPt(CARD_WIDTH_MM - 8),
    y: mmToPt(21),
    size: mmToPt(3.1),
    font: bold,
    rotate: degrees(180),
    color: rgb(0.07, 0.09, 0.15),
  })
  page.drawText(`${ticket.ticketId} | ERLEDIGT`, {
    x: mmToPt(CARD_WIDTH_MM - 8),
    y: mmToPt(28),
    size: mmToPt(1.8),
    font,
    rotate: degrees(180),
    color: rgb(0.39, 0.45, 0.55),
  })
  const contract = "HAUSMESSE DEMO | combined-v1-relative"
  const contractWidth = font.widthOfTextAtSize(contract, mmToPt(2.2))
  page.drawText(contract, {
    x: (pageWidth - contractWidth) / 2,
    y: mmToPt(61),
    size: mmToPt(2.2),
    font,
    color: rgb(0.58, 0.64, 0.72),
  })
  const qualification = "DEMO-FELDREFERENZ | KEIN PRODUKTIONSLAYOUT"
  const qualificationWidth = bold.widthOfTextAtSize(qualification, mmToPt(1.8))
  page.drawText(qualification, {
    x: (pageWidth - qualificationWidth) / 2,
    y: mmToPt(56),
    size: mmToPt(1.8),
    font: bold,
    color: rgb(0.71, 0.32, 0.04),
  })
}

export async function createHausmesseDemoPdf(input?: unknown): Promise<Uint8Array> {
  const tickets = await createHausmesseDemoTickets(input)
  const document = await PDFDocument.create({ updateMetadata: false })
  document.setTitle("Hausmesse Demo Karten")
  document.setAuthor("Ticket Studio")
  document.setSubject(`${HAUSMESSE_CASE_ID} | ${HAUSMESSE_LAYOUT_VERSION}`)
  document.setProducer("Ticket Studio DEMO-02")
  document.setCreator("Ticket Studio DEMO-02")
  document.setCreationDate(FIXED_DATE)
  document.setModificationDate(FIXED_DATE)
  const font = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  for (const ticket of tickets) {
    const page = document.addPage([mmToPt(CARD_WIDTH_MM), mmToPt(CARD_HEIGHT_MM)])
    drawCard(page, font, bold, ticket)
  }
  return document.save({ addDefaultPage: false, useObjectStreams: false, objectsPerTick: 1000 })
}

function drawCropMarks(page: PDFPage, x: number, y: number, width: number, height: number) {
  const mark = mmToPt(3)
  const gap = mmToPt(1)
  const colorValue = rgb(0.25, 0.25, 0.25)
  const segments = [
    [
      { x: x - gap - mark, y },
      { x: x - gap, y },
    ],
    [
      { x, y: y - gap - mark },
      { x, y: y - gap },
    ],
    [
      { x: x + width + gap, y },
      { x: x + width + gap + mark, y },
    ],
    [
      { x: x + width, y: y - gap - mark },
      { x: x + width, y: y - gap },
    ],
    [
      { x: x - gap - mark, y: y + height },
      { x: x - gap, y: y + height },
    ],
    [
      { x, y: y + height + gap },
      { x, y: y + height + gap + mark },
    ],
    [
      { x: x + width + gap, y: y + height },
      { x: x + width + gap + mark, y: y + height },
    ],
    [
      { x: x + width, y: y + height + gap },
      { x: x + width, y: y + height + gap + mark },
    ],
  ]
  for (const [start, end] of segments) {
    page.drawLine({ start, end, thickness: 0.4, color: colorValue })
  }
}

export async function createHausmesseDemoPrintPdf(input?: unknown): Promise<Uint8Array> {
  const cards = await createHausmesseDemoPdf(input)
  const document = await PDFDocument.create({ updateMetadata: false })
  document.setTitle("Hausmesse Demo Karten A4 Druckbogen")
  document.setAuthor("Ticket Studio")
  document.setSubject(`${HAUSMESSE_CASE_ID} | A4 actual size | ${HAUSMESSE_LAYOUT_VERSION}`)
  document.setProducer("Ticket Studio DEMO-02")
  document.setCreator("Ticket Studio DEMO-02")
  document.setCreationDate(FIXED_DATE)
  document.setModificationDate(FIXED_DATE)
  const embeddedCards = await document.embedPdf(
    cards,
    Array.from({ length: 14 }, (_, index) => index),
  )
  const pageWidth = mmToPt(210)
  const pageHeight = mmToPt(297)
  const cardWidth = mmToPt(CARD_WIDTH_MM)
  const cardHeight = mmToPt(CARD_HEIGHT_MM)
  const positions = [
    { x: mmToPt(20), y: mmToPt(157) },
    { x: mmToPt(124), y: mmToPt(157) },
    { x: mmToPt(20), y: mmToPt(20) },
    { x: mmToPt(124), y: mmToPt(20) },
  ]
  for (let index = 0; index < embeddedCards.length; index += 1) {
    const slot = index % positions.length
    if (slot === 0) document.addPage([pageWidth, pageHeight])
    const page = document.getPages().at(-1)!
    const position = positions[slot]
    page.drawPage(embeddedCards[index], {
      x: position.x,
      y: position.y,
      width: cardWidth,
      height: cardHeight,
    })
    drawCropMarks(page, position.x, position.y, cardWidth, cardHeight)
  }
  return document.save({ addDefaultPage: false, useObjectStreams: false, objectsPerTick: 1000 })
}
