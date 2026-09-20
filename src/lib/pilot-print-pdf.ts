import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  rgb,
  StandardFonts,
  type PDFPage,
} from "pdf-lib"

import type { PilotPrintCard, PilotPrintPreparation } from "@/lib/pilot-api"
import {
  drawPilotCardFace,
  mm,
  PILOT_CARD_INNER_LONG_MM,
  PILOT_CARD_INNER_SHORT_MM,
  PILOT_CARD_LONG_MM,
  PILOT_CARD_SHORT_MM,
} from "@/lib/pilot-card-layout"

const CARD_MARKER_MM = 18
const BOARD_MARKER_MM = 36
const FIXED_DATE = new Date("2026-09-13T00:00:00.000Z")
const TRADE_COLOR = rgb(0.04, 0.38, 0.42)
const UNKNOWN_TRADE_COLOR = rgb(0.45, 0.48, 0.52)

export type PilotMarkerAssetLoader = (filename: string) => Promise<Uint8Array>

type MarkerAsset = {
  familyWidth: number
  markerOuterEdgeMm: number
  modules: Array<[number, number]>
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

function drawCard(
  page: PDFPage,
  font: Parameters<typeof drawPilotCardFace>[1],
  bold: Parameters<typeof drawPilotCardFace>[2],
  card: PilotPrintCard,
  activeMarker: MarkerAsset,
  doneMarker: MarkerAsset,
) {
  const markerCanvasMm = (CARD_MARKER_MM * 13) / 11
  const match = card.tradeColor?.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/)
  const tradeColor = match
    ? rgb(
        Number.parseInt(match[1]!, 16) / 255,
        Number.parseInt(match[2]!, 16) / 255,
        Number.parseInt(match[3]!, 16) / 255,
      )
    : UNKNOWN_TRADE_COLOR
  drawPilotCardFace(
    page,
    font,
    bold,
    { ...card, uid: card.sourceActivityId },
    {
      drawActive: () =>
        drawMarker(page, activeMarker, PILOT_CARD_SHORT_MM - markerCanvasMm - 3, 91),
      drawDone: () => drawMarker(page, doneMarker, 3, 7, true),
    },
    tradeColor,
  )
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
    const page = rawDocument.addPage([mm(PILOT_CARD_SHORT_MM), mm(PILOT_CARD_LONG_MM)])
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
