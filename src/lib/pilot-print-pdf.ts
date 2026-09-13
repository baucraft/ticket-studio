import {
  degrees,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib"

import type { PilotPrintCard, PilotPrintPreparation } from "@/lib/pilot-api"

const CARD_SHORT_MM = 66
const CARD_LONG_MM = 120
const CARD_MARKER_MM = 18
const BOARD_MARKER_MM = 36
const FIXED_DATE = new Date("2026-09-13T00:00:00.000Z")
const TITLE_SIZE_MM = 2.5
const DETAIL_SIZE_MM = 1.35
const TRADE_COLOR = rgb(0.04, 0.38, 0.42)
const COMPLETED_BACKGROUND = rgb(0.86, 0.96, 0.9)
const COMPLETED_INK = rgb(0.05, 0.32, 0.18)

export type PilotMarkerAssetLoader = (filename: string) => Promise<Uint8Array>

type MarkerAsset = {
  familyWidth: number
  markerOuterEdgeMm: number
  modules: Array<[number, number]>
}

function mm(value: number) {
  return (value * 72) / 25.4
}

function markerFilename(tagId: number, role: "active" | "done" | "board") {
  if (!Number.isInteger(tagId) || tagId < 0 || tagId > 65_534) {
    throw new Error(`Ungueltige vom Backend gelieferte Tag-ID ${tagId}.`)
  }
  const suffix = role === "board" ? "board_36mm" : `card_${role}_18mm`
  return `tagCircle49h12_id${String(tagId).padStart(5, "0")}_${suffix}.svg`
}

let codebookPromise: Promise<Uint8Array> | undefined

export function pilotMarkerAssetFromCodebook(codebook: Uint8Array, filename: string) {
  const match = filename.match(
    /^tagCircle49h12_id(\d{5})_(card_(?:active|done)_18mm|board_36mm)\.svg$/,
  )
  if (!match) throw new Error(`Ungueltiger Markerassetname ${filename}.`)
  const tagId = Number(match[1])
  const board = match[2] === "board_36mm"
  if (
    codebook.length !== 65_535 * 16 ||
    (board && (tagId < 63_486 || tagId > 65_534)) ||
    (!board && tagId > 63_485)
  ) {
    throw new Error(`Tag-ID ${tagId} liegt ausserhalb des gebundenen Rollenbereichs.`)
  }
  const rectangles: string[] = []
  for (let bit = 0; bit < 121; bit += 1) {
    const value = codebook[tagId * 16 + Math.floor(bit / 8)]!
    if (value & (1 << (7 - (bit % 8)))) {
      rectangles.push(
        `    <rect x="${bit % 11}" y="${Math.floor(bit / 11)}" width="1" height="1"/>`,
      )
    }
  }
  if (rectangles.length === 0) throw new Error(`Tag-ID ${tagId} hat keinen gueltigen Code.`)
  const markerMm = board ? 36 : 18
  const canvasMm = ((markerMm * 13) / 11).toFixed(6)
  return new TextEncoder().encode(
    [
      '<?xml version="1.0" encoding="ASCII"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasMm}mm" height="${canvasMm}mm" viewBox="0 0 13 13" shape-rendering="crispEdges">`,
      `  <title>tagCircle49h12 ID ${tagId}</title>`,
      '  <rect width="13" height="13" fill="#fff"/>',
      '  <g transform="translate(1 1)" fill="#000">',
      ...rectangles,
      "  </g>",
      "</svg>",
      "",
    ].join("\n"),
  )
}

export async function loadPilotMarkerAsset(filename: string): Promise<Uint8Array> {
  codebookPromise ??= fetch(`${import.meta.env.BASE_URL}pilot-assets/tagCircle49h12.bits`, {
    credentials: "same-origin",
  }).then(async (response) => {
    if (!response.ok)
      throw new Error("Das gepruefte tagCircle49h12-Codebuch fehlt im Studio-Build.")
    return new Uint8Array(await response.arrayBuffer())
  })
  return pilotMarkerAssetFromCodebook(await codebookPromise, filename)
}

async function markerAsset(
  loader: PilotMarkerAssetLoader,
  filename: string,
  markerOuterEdgeMm: number,
) {
  const svg = new TextDecoder("ascii", { fatal: true }).decode(await loader(filename))
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/)
  if (!viewBox || viewBox[1] !== viewBox[2]) throw new Error(`Ungueltiges Markerasset ${filename}.`)
  const familyWidth = Number(viewBox[1]) - 2
  const modules = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1"\/>/g)].map(
    (match) => [Number(match[1]), Number(match[2])] as [number, number],
  )
  if (familyWidth !== 11 || modules.length === 0) {
    throw new Error(`Markerasset ${filename} gehoert nicht zur gebundenen tagCircle49h12-Familie.`)
  }
  return { familyWidth, markerOuterEdgeMm, modules } satisfies MarkerAsset
}

function drawMarker(page: PDFPage, asset: MarkerAsset, xMm: number, yMm: number, rotate = false) {
  const moduleMm = asset.markerOuterEdgeMm / asset.familyWidth
  const canvasModules = asset.familyWidth + 2
  const canvasMm = moduleMm * canvasModules
  page.drawRectangle({
    x: mm(xMm),
    y: mm(yMm),
    width: mm(canvasMm),
    height: mm(canvasMm),
    color: rgb(1, 1, 1),
  })
  for (const [sourceX, sourceY] of asset.modules) {
    let x = 1 + sourceX
    let y = 1 + (asset.familyWidth - 1 - sourceY)
    if (rotate) {
      x = canvasModules - x - 1
      y = canvasModules - y - 1
    }
    page.drawRectangle({
      x: mm(xMm + x * moduleMm),
      y: mm(yMm + y * moduleMm),
      width: mm(moduleMm),
      height: mm(moduleMm),
      color: rgb(0, 0, 0),
    })
  }
}

function completeWrappedLines(font: PDFFont, text: string, size: number, maxWidth: number) {
  const lines: string[] = []
  let current = ""
  const pushWord = (word: string) => {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      return
    }
    if (current) {
      lines.push(current)
      current = ""
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word
      return
    }
    for (const character of [...word]) {
      const chunk = `${current}${character}`
      if (font.widthOfTextAtSize(chunk, size) <= maxWidth) current = chunk
      else {
        if (!current) throw new Error("Kartentext enthaelt ein nicht darstellbares Zeichen.")
        lines.push(current)
        current = character
      }
    }
  }
  for (const word of text.trim().split(/\s+/)) pushWord(word)
  if (current) lines.push(current)
  return lines
}

function visibleTextLayout(font: PDFFont, bold: PDFFont, card: PilotPrintCard) {
  const maxWidth = mm(35)
  const title = completeWrappedLines(bold, card.activity, mm(TITLE_SIZE_MM), maxWidth)
  const trade = completeWrappedLines(
    font,
    card.trade || "Gewerk nicht angegeben",
    mm(DETAIL_SIZE_MM),
    maxWidth,
  )
  const details = [
    `Bereich: ${card.area || "nicht angegeben"}`,
    ...(card.task ? [`Aufgabe: ${card.task}`] : []),
  ]
  const titleLineMm = TITLE_SIZE_MM * 1.2
  const detailLineMm = DETAIL_SIZE_MM * 1.25
  const context = completeWrappedLines(font, details.join(" | "), mm(DETAIL_SIZE_MM), maxWidth)
  const heightMm = title.length * titleLineMm + 3 + (trade.length + context.length) * detailLineMm
  if (title.length <= 3 && trade.length <= 4 && context.length <= 6 && heightMm <= 16.5) {
    return { title, trade, context, titleLineMm, detailLineMm }
  }
  throw new Error("Kartentext passt nicht vollstaendig in die beiden sichtbaren Kartenenden.")
}

function drawVisibleText(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  card: PilotPrintCard,
  completed: boolean,
) {
  const layout = visibleTextLayout(font, bold, card)
  const color = completed ? COMPLETED_INK : rgb(0.05, 0.07, 0.12)
  const xMm = completed ? 62 : 4
  const rotation = completed ? degrees(180) : undefined
  const direction = completed ? 1 : -1
  let yMm = completed ? 17 : 103
  const drawLines = (lines: string[], sizeMm: number, lineMm: number, lineFont: PDFFont) => {
    for (const line of lines) {
      page.drawText(line, {
        x: mm(xMm),
        y: mm(yMm),
        size: mm(sizeMm),
        font: lineFont,
        rotate: rotation,
        color,
      })
      yMm += direction * lineMm
    }
  }
  drawLines(layout.title, TITLE_SIZE_MM, layout.titleLineMm, bold)
  yMm += direction * 3
  drawLines(layout.trade, DETAIL_SIZE_MM, layout.detailLineMm, font)
  drawLines(layout.context, DETAIL_SIZE_MM, layout.detailLineMm, font)
  return layout
}

function planningLabel(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Kartendatum ist kein ISO-Datum.")
  const value = new Date(`${date}T00:00:00.000Z`)
  if (value.toISOString().slice(0, 10) !== date) throw new Error("Kartendatum ist ungueltig.")
  const thursday = new Date(value)
  const day = thursday.getUTCDay() || 7
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  const [year, month, dayOfMonth] = date.split("-")
  return `geplant: KW ${week} | ${dayOfMonth}.${month}.${year}`
}

function drawCard(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  card: PilotPrintCard,
  activeMarker: MarkerAsset,
  doneMarker: MarkerAsset,
) {
  const markerCanvasMm = (CARD_MARKER_MM * 13) / 11
  page.drawRectangle({ x: 0, y: 0, width: mm(66), height: mm(120), color: rgb(1, 1, 1) })
  page.drawRectangle({
    x: 0,
    y: mm(88),
    width: mm(66),
    height: mm(32),
    color: TRADE_COLOR,
    opacity: 0.1,
  })
  page.drawRectangle({ x: 0, y: 0, width: mm(66), height: mm(32), color: COMPLETED_BACKGROUND })
  page.drawRectangle({ x: 0, y: mm(114), width: mm(66), height: mm(6), color: TRADE_COLOR })
  page.drawRectangle({ x: 0, y: 0, width: mm(66), height: mm(6), color: TRADE_COLOR })
  drawMarker(page, activeMarker, CARD_SHORT_MM - markerCanvasMm - 3, 91)
  drawMarker(page, doneMarker, 3, 7, true)
  page.drawText("AKTIV", { x: mm(4), y: mm(111), size: mm(2.1), font: bold, color: TRADE_COLOR })
  page.drawText("ERLEDIGT", {
    x: mm(62),
    y: mm(9),
    size: mm(2.1),
    font: bold,
    rotate: degrees(180),
    color: COMPLETED_INK,
  })
  const activeLayout = drawVisibleText(page, font, bold, card, false)
  const doneLayout = drawVisibleText(page, font, bold, card, true)
  if (JSON.stringify(activeLayout) !== JSON.stringify(doneLayout)) {
    throw new Error("Die beiden sichtbaren Kartenenden verwenden nicht dasselbe Textlayout.")
  }
  page.drawText(planningLabel(card.date), {
    x: mm(4),
    y: mm(84),
    size: mm(1.8),
    font: bold,
    color: rgb(0.15, 0.18, 0.23),
  })
  page.drawText("Kommentar:", {
    x: mm(4),
    y: mm(77),
    size: mm(1.8),
    font: bold,
    color: rgb(0.15, 0.18, 0.23),
  })
  for (const yMm of [73, 67, 61]) {
    page.drawLine({
      start: { x: mm(4), y: mm(yMm) },
      end: { x: mm(62), y: mm(yMm) },
      thickness: mm(0.2),
      color: rgb(0.55, 0.58, 0.63),
    })
  }
}

function setMetadata(document: PDFDocument, preparation: PilotPrintPreparation, subject: string) {
  document.setTitle(`Pilot ${preparation.boardId} Revision ${preparation.revision}`)
  document.setAuthor("Ticket Studio")
  document.setCreator("Ticket Studio pilot-print-v1")
  document.setProducer("Ticket Studio pilot-print-v1")
  document.setSubject(`${subject} | ${preparation.revisionHash}`)
  document.setCreationDate(FIXED_DATE)
  document.setModificationDate(FIXED_DATE)
}

export async function createPilotCardsPdf(
  preparation: PilotPrintPreparation,
  cardIds: readonly string[] = preparation.cards.map((card) => card.sourcePlanCardId),
  loader: PilotMarkerAssetLoader = loadPilotMarkerAsset,
) {
  const selected = new Set(cardIds)
  if (selected.size === 0 || selected.size !== cardIds.length) {
    throw new Error("Der PDF-Drucksatz muss mindestens eine eindeutige Backendkarte enthalten.")
  }
  const cards = preparation.cards.filter((card) => selected.has(card.sourcePlanCardId))
  if (cards.length !== selected.size)
    throw new Error("PDF-Auswahl ist nicht Teil der Druckvorbereitung.")

  const rawDocument = await PDFDocument.create({ updateMetadata: false })
  const font = await rawDocument.embedFont(StandardFonts.Helvetica)
  const bold = await rawDocument.embedFont(StandardFonts.HelveticaBold)
  for (const [index, card] of cards.entries()) {
    const [activeMarker, doneMarker] = await Promise.all([
      markerAsset(loader, markerFilename(card.activeTagId, "active"), CARD_MARKER_MM),
      markerAsset(loader, markerFilename(card.doneTagId, "done"), CARD_MARKER_MM),
    ])
    const page = rawDocument.addPage([mm(CARD_SHORT_MM), mm(CARD_LONG_MM)])
    try {
      drawCard(page, font, bold, card, activeMarker, doneMarker)
    } catch (error) {
      const message = error instanceof Error ? error.message : "unbekannter Renderfehler"
      throw new Error(`Karte ${card.sourcePlanCardId}: ${message}`)
    }
    page.node.set(PDFName.of("PilotCardIndex"), PDFNumber.of(index + 1))
    page.node.set(PDFName.of("PilotActiveTagId"), PDFNumber.of(card.activeTagId))
    page.node.set(PDFName.of("PilotDoneTagId"), PDFNumber.of(card.doneTagId))
    page.node.set(PDFName.of("PilotVisibleTextFit"), PDFNumber.of(1))
  }
  const rawBytes = await rawDocument.save({ addDefaultPage: false, useObjectStreams: false })

  const document = await PDFDocument.create({ updateMetadata: false })
  setMetadata(
    document,
    preparation,
    `${cards.length} Karten | 66 x 120 mm | Innenrahmen 62.5 x 117 mm`,
  )
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
    const page = document.addPage([mm(CARD_SHORT_MM), mm(CARD_LONG_MM)])
    page.drawPage(embedded, { x: mm(insetX), y: mm(insetY), width: mm(62.5), height: mm(117) })
    page.drawRectangle({
      x: mm(1.875),
      y: mm(1.625),
      width: mm(62.25),
      height: mm(116.75),
      borderColor: rgb(0.15, 0.18, 0.23),
      borderWidth: mm(0.25),
    })
    page.setTrimBox(0, 0, mm(CARD_SHORT_MM), mm(CARD_LONG_MM))
    page.setBleedBox(0, 0, mm(CARD_SHORT_MM), mm(CARD_LONG_MM))
    const card = cards[index]!
    page.node.set(PDFName.of("PilotCardIndex"), PDFNumber.of(index + 1))
    page.node.set(PDFName.of("PilotActiveTagId"), PDFNumber.of(card.activeTagId))
    page.node.set(PDFName.of("PilotDoneTagId"), PDFNumber.of(card.doneTagId))
    page.node.set(PDFName.of("PilotOuterShortMm"), PDFNumber.of(66))
    page.node.set(PDFName.of("PilotOuterLongMm"), PDFNumber.of(120))
    page.node.set(PDFName.of("PilotInnerShortMm"), PDFNumber.of(62.5))
    page.node.set(PDFName.of("PilotInnerLongMm"), PDFNumber.of(117))
    page.node.set(PDFName.of("PilotCardMarkerOuterEdgeMm"), PDFNumber.of(18))
    page.node.set(PDFName.of("PilotVisibleTextFit"), PDFNumber.of(1))
    page.node.set(PDFName.of("PilotBothCardEnds"), PDFNumber.of(1))
    page.node.set(
      PDFName.of("PilotSourceProjectId"),
      PDFHexString.fromText(preparation.sourceProjectId),
    )
    page.node.set(PDFName.of("PilotSourcePlanCardId"), PDFHexString.fromText(card.sourcePlanCardId))
    page.node.set(PDFName.of("PilotSourceActivityId"), PDFHexString.fromText(card.sourceActivityId))
    page.node.set(PDFName.of("PilotRevisionHash"), PDFHexString.fromText(preparation.revisionHash))
  }
  return document.save({ addDefaultPage: false, useObjectStreams: false })
}

function drawCropMarks(page: PDFPage, xMm: number, yMm: number, edgeMm: number) {
  const length = 3
  const gap = 1.5
  const color = rgb(0.15, 0.18, 0.23)
  for (const [start, end] of [
    [
      [xMm - gap - length, yMm],
      [xMm - gap, yMm],
    ],
    [
      [xMm + edgeMm + gap, yMm],
      [xMm + edgeMm + gap + length, yMm],
    ],
    [
      [xMm - gap - length, yMm + edgeMm],
      [xMm - gap, yMm + edgeMm],
    ],
    [
      [xMm + edgeMm + gap, yMm + edgeMm],
      [xMm + edgeMm + gap + length, yMm + edgeMm],
    ],
    [
      [xMm, yMm - gap - length],
      [xMm, yMm - gap],
    ],
    [
      [xMm, yMm + edgeMm + gap],
      [xMm, yMm + edgeMm + gap + length],
    ],
    [
      [xMm + edgeMm, yMm - gap - length],
      [xMm + edgeMm, yMm - gap],
    ],
    [
      [xMm + edgeMm, yMm + edgeMm + gap],
      [xMm + edgeMm, yMm + edgeMm + gap + length],
    ],
  ] as Array<[[number, number], [number, number]]>) {
    page.drawLine({
      start: { x: mm(start[0]), y: mm(start[1]) },
      end: { x: mm(end[0]), y: mm(end[1]) },
      thickness: mm(0.2),
      color,
    })
  }
}

export async function createPilotBoardMarkerPdf(
  preparation: PilotPrintPreparation,
  loader: PilotMarkerAssetLoader = loadPilotMarkerAsset,
) {
  const marker = await markerAsset(
    loader,
    markerFilename(preparation.boardMarkerId, "board"),
    BOARD_MARKER_MM,
  )
  const document = await PDFDocument.create({ updateMetadata: false })
  setMetadata(document, preparation, "Tafelmarker | 36 mm Raster | volle Quiet Zone")
  const page = document.addPage([mm(210), mm(297)])
  const font = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  page.drawText("TAFELMARKER MIT SCHNITTMARKEN", {
    x: mm(18),
    y: mm(278),
    size: mm(4.2),
    font: bold,
    color: TRADE_COLOR,
  })
  page.drawText(`Tafel ${preparation.boardId} | Revision ${preparation.revision} | 100 %`, {
    x: mm(18),
    y: mm(269),
    size: mm(2.6),
    font,
  })
  const x = 30
  const y = 205
  const cutEdge = (BOARD_MARKER_MM * 13) / 11
  drawMarker(page, marker, x, y)
  drawCropMarks(page, x, y, cutEdge)
  page.drawText(`Tafelmarker ID ${preparation.boardMarkerId}`, {
    x: mm(18),
    y: mm(190),
    size: mm(3),
    font: bold,
  })
  page.drawText(`11x11-Raster Soll 36 mm | Ausschnitt ${cutEdge.toFixed(2)} mm`, {
    x: mm(18),
    y: mm(184),
    size: mm(2.1),
    font,
  })
  page.drawText("Nur bei 100 % drucken. Quiet Zone nicht beschneiden.", {
    x: mm(18),
    y: mm(174),
    size: mm(2.1),
    font,
  })
  page.node.set(PDFName.of("PilotBoardMarkerId"), PDFNumber.of(preparation.boardMarkerId))
  page.node.set(PDFName.of("PilotBoardMarkerOuterEdgeMm"), PDFNumber.of(36))
  page.node.set(PDFName.of("PilotBoardMarkerCutEdgeMm"), PDFNumber.of(cutEdge))
  page.node.set(PDFName.of("PilotBoardMarkerQuietZoneMm"), PDFNumber.of((cutEdge - 36) / 2))
  return document.save({ addDefaultPage: false, useObjectStreams: false })
}

export function downloadPilotPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
