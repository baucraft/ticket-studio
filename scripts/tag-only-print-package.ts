import { createHash } from "node:crypto"
import { lstat, mkdir, mkdtemp, open, readFile, rename, rm } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import {
  degrees,
  PDFDocument,
  PDFName,
  PDFNumber,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib"

import {
  TAG_ONLY_CANONICAL_SOURCE_PATH,
  TAG_ONLY_CANONICAL_SOURCE_SHA256,
  tagOnlyBoardMarkerFilename,
  tagOnlyCardMarkerFilename,
  validateTagOnlyFixture,
  type TagOnlyActivity,
  type TagOnlyFixture,
} from "../src/lib/tag-only-target"
import { acquireTargetLock, recoverTargetArtifacts } from "./target-lock.mjs"
import { verifyTagOnlyAssetsAgainstSource } from "./verify-tag-only-assets.mjs"

const FIXED_DATE = new Date("2026-08-22T00:00:00.000Z")
const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const CARD_SHORT_MM = 66
const CARD_LONG_MM = 120
const CARD_COLUMNS = 3
const CARD_ROWS = 2
const CARDS_PER_PAGE = CARD_COLUMNS * CARD_ROWS
export const TAG_ONLY_A4_CARD_LAYOUT = {
  xPositionsMm: [3, 72, 141],
  yPositionsMm: [150, 27],
  cardShortMm: CARD_SHORT_MM,
  cardLongMm: CARD_LONG_MM,
  cropMarkMm: 1.25,
} as const

export const TAG_ONLY_PRINT_FILES = {
  cardsPdf: "demo04-tag-only-cards-a4.pdf",
  calibrationPdf: "demo04-tag-only-calibration-a4.pdf",
  manifestJson: "demo04-tag-only-manifest.json",
  manifestCsv: "demo04-tag-only-manifest.csv",
  boardAssignment: "demo04-tag-only-board-assignment.json",
  instructions: "PRINT-INSTRUCTIONS.txt",
  source: "SOURCE.json",
  checksums: "SHA256SUMS",
} as const

export type TagOnlyPrintPackage = {
  cardsPdf: Uint8Array
  calibrationPdf: Uint8Array
  manifestJson: Uint8Array
  manifestCsv: Uint8Array
  boardAssignment: Uint8Array
  instructions: Uint8Array
  source: Uint8Array
  checksums: Uint8Array
}

type MarkerAsset = {
  filename: string
  familyWidth: number
  markerOuterEdgeMm: number
  modules: Array<[number, number]>
}

type MarkerAssetSource = string | ReadonlyMap<string, Uint8Array>

type SourceBinding = {
  path: typeof TAG_ONLY_CANONICAL_SOURCE_PATH
  sha256: string
  bytes: Uint8Array
  fixture: TagOnlyFixture
}

function mm(value: number) {
  return (value * 72) / 25.4
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function readCanonicalSource(): Promise<SourceBinding> {
  const bytes = await readFile(resolve(TAG_ONLY_CANONICAL_SOURCE_PATH))
  const digest = sha256(bytes)
  if (digest !== TAG_ONLY_CANONICAL_SOURCE_SHA256) {
    throw new Error("Canonical DEMO-04 source differs from the pinned SHA-256")
  }
  const fixture = validateTagOnlyFixture(JSON.parse(bytes.toString("utf8")) as TagOnlyFixture)
  return { path: TAG_ONLY_CANONICAL_SOURCE_PATH, sha256: digest, bytes, fixture }
}

function pdfColor(hex: string) {
  return rgb(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  )
}

function fitText(font: PDFFont, text: string, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let fitted = text
  while (fitted.length && font.widthOfTextAtSize(`${fitted}...`, size) > maxWidth) {
    fitted = fitted.slice(0, -1)
  }
  return `${fitted}...`
}

function wrappedLines(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
  maxLines: number,
) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  for (const word of words) {
    const candidate = lines.length === 0 ? word : `${lines.at(-1)} ${word}`
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      if (lines.length === 0) lines.push(word)
      else lines[lines.length - 1] = candidate
    } else if (lines.length < maxLines) lines.push(word)
    else {
      lines[lines.length - 1] = fitText(font, `${lines.at(-1)} ${word}`, size, maxWidth)
      break
    }
  }
  return lines
}

async function markerAsset(source: MarkerAssetSource, filename: string, markerOuterEdgeMm: number) {
  const bytes =
    typeof source === "string" ? await readFile(join(source, filename)) : source.get(filename)
  if (!bytes) throw new Error(`Missing verified marker SVG: ${filename}`)
  const svg = Buffer.from(bytes).toString("ascii")
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/)
  if (!viewBox || viewBox[1] !== viewBox[2]) throw new Error(`Invalid marker SVG: ${filename}`)
  const familyWidth = Number(viewBox[1]) - 2
  const modules = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1"\/>/g)].map(
    (match) => [Number(match[1]), Number(match[2])] as [number, number],
  )
  if (![10, 11].includes(familyWidth) || modules.length === 0) {
    throw new Error(`Invalid marker module contract: ${filename}`)
  }
  return { filename, familyWidth, markerOuterEdgeMm, modules } satisfies MarkerAsset
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

function setDeterministicMetadata(
  document: PDFDocument,
  title: string,
  subject: string,
  sourceSha256: string,
) {
  document.setTitle(title)
  document.setAuthor("Ticket Studio")
  document.setSubject(`${subject} | canonical source SHA-256 ${sourceSha256}`)
  document.setProducer("Ticket Studio DEMO-04 synthetic preflight")
  document.setCreator("Ticket Studio DEMO-04 synthetic preflight")
  document.setCreationDate(FIXED_DATE)
  document.setModificationDate(FIXED_DATE)
}

function drawCard(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  activity: TagOnlyActivity,
  activeMarker: MarkerAsset,
  doneMarker: MarkerAsset,
  sourceSha256: string,
) {
  const tradeColor = pdfColor(activity.tradeColor)
  const markerCanvasMm = (18 * 13) / 11
  page.drawRectangle({
    x: 0,
    y: 0,
    width: mm(CARD_SHORT_MM),
    height: mm(CARD_LONG_MM),
    color: rgb(1, 1, 1),
    borderColor: rgb(0.15, 0.18, 0.23),
    borderWidth: mm(0.25),
  })
  page.drawRectangle({
    x: 0,
    y: mm(88),
    width: mm(CARD_SHORT_MM),
    height: mm(32),
    color: tradeColor,
    opacity: 0.1,
  })
  page.drawRectangle({
    x: 0,
    y: 0,
    width: mm(CARD_SHORT_MM),
    height: mm(32),
    color: tradeColor,
    opacity: 0.1,
  })
  page.drawRectangle({
    x: 0,
    y: mm(114),
    width: mm(CARD_SHORT_MM),
    height: mm(6),
    color: tradeColor,
  })
  page.drawRectangle({ x: 0, y: 0, width: mm(CARD_SHORT_MM), height: mm(6), color: tradeColor })

  drawMarker(page, activeMarker, CARD_SHORT_MM - markerCanvasMm - 3, 91)
  drawMarker(page, doneMarker, 3, 7, true)

  const endTextWidth = mm(35)
  const titleSize = mm(2.8)
  page.drawText("AKTIV", { x: mm(4), y: mm(111), size: mm(2.1), font: bold, color: tradeColor })
  page.drawText(fitText(bold, activity.shortTarget, titleSize, endTextWidth), {
    x: mm(4),
    y: mm(103),
    size: titleSize,
    font: bold,
    color: rgb(0.05, 0.07, 0.12),
  })
  page.drawText(fitText(font, `${activity.trade} / ${activity.week}`, mm(1.8), endTextWidth), {
    x: mm(4),
    y: mm(97),
    size: mm(1.8),
    font,
    color: rgb(0.25, 0.3, 0.38),
  })
  page.drawText(`ID ${activity.activeTagId}`, {
    x: mm(43),
    y: mm(89.5),
    size: mm(1.7),
    font: bold,
    color: rgb(0.05, 0.07, 0.12),
  })

  page.drawText("ERLEDIGT", {
    x: mm(62),
    y: mm(9),
    size: mm(2.1),
    font: bold,
    rotate: degrees(180),
    color: tradeColor,
  })
  page.drawText(fitText(bold, activity.shortTarget, titleSize, endTextWidth), {
    x: mm(62),
    y: mm(17),
    size: titleSize,
    font: bold,
    rotate: degrees(180),
    color: rgb(0.05, 0.07, 0.12),
  })
  page.drawText(fitText(font, `${activity.trade} / ${activity.week}`, mm(1.8), endTextWidth), {
    x: mm(62),
    y: mm(23),
    size: mm(1.8),
    font,
    rotate: degrees(180),
    color: rgb(0.25, 0.3, 0.38),
  })
  page.drawText(`ID ${activity.doneTagId}`, {
    x: mm(23),
    y: mm(30.5),
    size: mm(1.7),
    font: bold,
    rotate: degrees(180),
    color: rgb(0.05, 0.07, 0.12),
  })

  page.drawLine({
    start: { x: mm(4), y: mm(84) },
    end: { x: mm(62), y: mm(84) },
    thickness: mm(0.2),
    color: rgb(0.65, 0.69, 0.75),
    dashArray: [mm(1), mm(1)],
  })
  page.drawText(activity.deviation, {
    x: mm(5),
    y: mm(78),
    size: mm(1.8),
    font,
    color: rgb(0.25, 0.3, 0.38),
  })
  const targetLines = wrappedLines(font, activity.fullTarget, mm(2.2), mm(56), 5)
  targetLines.forEach((line, index) => {
    page.drawText(line, {
      x: mm(5),
      y: mm(69 - index * 5),
      size: mm(2.2),
      font,
      color: rgb(0.08, 0.1, 0.16),
    })
  })
  page.drawText(`${activity.demoActivityKey} | LCMD source: unbound`, {
    x: mm(5),
    y: mm(39),
    size: mm(1.55),
    font,
    color: rgb(0.35, 0.4, 0.48),
  })
  page.drawText(`Quelle SHA-256 ${sourceSha256}`, {
    x: mm(5),
    y: mm(42),
    size: mm(1.15),
    font,
    color: rgb(0.35, 0.4, 0.48),
  })
  page.drawText("TESTDRUCK / KEINE PRODUKTIONSFREIGABE", {
    x: mm(5),
    y: mm(35),
    size: mm(1.55),
    font: bold,
    color: rgb(0.71, 0.32, 0.04),
  })
}

function drawCropMarks(page: PDFPage, xMm: number, yMm: number) {
  const x = mm(xMm)
  const y = mm(yMm)
  const width = mm(CARD_SHORT_MM)
  const height = mm(CARD_LONG_MM)
  const mark = mm(TAG_ONLY_A4_CARD_LAYOUT.cropMarkMm)
  const ink = rgb(0.2, 0.2, 0.2)
  const corners = [
    [x, y, -1, -1],
    [x + width, y, 1, -1],
    [x, y + height, -1, 1],
    [x + width, y + height, 1, 1],
  ] as const
  for (const [cornerX, cornerY, xDirection, yDirection] of corners) {
    page.drawLine({
      start: { x: cornerX, y: cornerY },
      end: { x: cornerX + mark * xDirection, y: cornerY },
      thickness: 0.35,
      color: ink,
    })
    page.drawLine({
      start: { x: cornerX, y: cornerY },
      end: { x: cornerX, y: cornerY + mark * yDirection },
      thickness: 0.35,
      color: ink,
    })
  }
}

async function createTagOnlyCardPagesPdfFromFixture(
  fixture: TagOnlyFixture,
  assetSource: MarkerAssetSource,
  sourceSha256: string,
) {
  const document = await PDFDocument.create({ updateMetadata: false })
  setDeterministicMetadata(
    document,
    "DEMO-04 synthetic cards",
    fixture.fixtureVersion,
    sourceSha256,
  )
  const font = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  for (const activity of fixture.activities) {
    const activeFilename = tagOnlyCardMarkerFilename(activity.activeTagId, "active")
    const doneFilename = tagOnlyCardMarkerFilename(activity.doneTagId, "done")
    const [activeMarker, doneMarker] = await Promise.all([
      markerAsset(assetSource, activeFilename, 18),
      markerAsset(assetSource, doneFilename, 18),
    ])
    const page = document.addPage([mm(CARD_SHORT_MM), mm(CARD_LONG_MM)])
    drawCard(page, font, bold, activity, activeMarker, doneMarker, sourceSha256)
  }
  return document.save({ addDefaultPage: false, useObjectStreams: false, objectsPerTick: 1000 })
}

export async function createTagOnlyCardPagesPdf() {
  const source = await readCanonicalSource()
  const verified = verifyTagOnlyAssetsAgainstSource(resolve("public/ana09c4"), source.bytes)
  return createTagOnlyCardPagesPdfFromFixture(
    source.fixture,
    verified.verifiedSvgBytes,
    source.sha256,
  )
}

export async function createTagOnlyCardPagesPdfForTest(
  fixtureInput: TagOnlyFixture,
  assetDir = resolve("public/ana09c4"),
) {
  const fixture = validateTagOnlyFixture(structuredClone(fixtureInput))
  const bytes = new TextEncoder().encode(`${JSON.stringify(fixture, null, 2)}\n`)
  return createTagOnlyCardPagesPdfFromFixture(fixture, assetDir, sha256(bytes))
}

function drawA4PageQualification(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  pageNumber: number,
  sourceSha256: string,
) {
  page.drawText("TESTDRUCK / KEINE PRODUKTIONSFREIGABE", {
    x: mm(5),
    y: mm(289),
    size: mm(3.1),
    font: bold,
    color: rgb(0.71, 0.32, 0.04),
  })
  page.drawText(`DEMO-04 | A4 | 100 % | Seite ${pageNumber}/9`, {
    x: mm(151),
    y: mm(289),
    size: mm(2),
    font,
    color: rgb(0.25, 0.3, 0.38),
  })
  page.drawText(`Quelle SHA-256 ${sourceSha256}`, {
    x: mm(5),
    y: mm(285),
    size: mm(1.35),
    font,
    color: rgb(0.25, 0.3, 0.38),
  })
  page.drawText(
    "Beim Drucken 'An Seite anpassen' deaktivieren; Kartenmass 120 x 66 mm nachmessen.",
    {
      x: mm(5),
      y: mm(5),
      size: mm(1.9),
      font,
      color: rgb(0.25, 0.3, 0.38),
    },
  )
}

async function createCardsA4Pdf(
  fixture: TagOnlyFixture,
  assetSource: MarkerAssetSource,
  sourceSha256: string,
) {
  const cardBytes = await createTagOnlyCardPagesPdfFromFixture(fixture, assetSource, sourceSha256)
  const document = await PDFDocument.create({ updateMetadata: false })
  setDeterministicMetadata(
    document,
    "DEMO-04 50 Karten A4 Testdruck",
    `${fixture.fixtureVersion} | 50 cards | 120 x 66 mm | actual size`,
    sourceSha256,
  )
  const font = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const embeddedCards = await document.embedPdf(
    cardBytes,
    Array.from({ length: fixture.activities.length }, (_, index) => index),
  )
  for (
    let pageIndex = 0;
    pageIndex < Math.ceil(embeddedCards.length / CARDS_PER_PAGE);
    pageIndex += 1
  ) {
    const page = document.addPage([mm(A4_WIDTH_MM), mm(A4_HEIGHT_MM)])
    const cards = embeddedCards.slice(pageIndex * CARDS_PER_PAGE, (pageIndex + 1) * CARDS_PER_PAGE)
    drawA4PageQualification(page, font, bold, pageIndex + 1, sourceSha256)
    cards.forEach((card, index) => {
      const xMm = TAG_ONLY_A4_CARD_LAYOUT.xPositionsMm[index % CARD_COLUMNS]
      const yMm = TAG_ONLY_A4_CARD_LAYOUT.yPositionsMm[Math.floor(index / CARD_COLUMNS)]
      page.drawPage(card, {
        x: mm(xMm),
        y: mm(yMm),
        width: mm(CARD_SHORT_MM),
        height: mm(CARD_LONG_MM),
      })
      drawCropMarks(page, xMm, yMm)
    })
    page.node.set(PDFName.of("Demo04CardCount"), PDFNumber.of(cards.length))
    page.node.set(PDFName.of("Demo04CardWidthMm"), PDFNumber.of(120))
    page.node.set(PDFName.of("Demo04CardHeightMm"), PDFNumber.of(66))
  }
  return document.save({ addDefaultPage: false, useObjectStreams: false, objectsPerTick: 1000 })
}

function markerLabel(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  title: string,
  detail: string,
  xMm: number,
  yMm: number,
) {
  page.drawText(title, { x: mm(xMm), y: mm(yMm), size: mm(2.5), font: bold })
  page.drawText(detail, {
    x: mm(xMm),
    y: mm(yMm - 4),
    size: mm(1.8),
    font,
    color: rgb(0.3, 0.35, 0.42),
  })
}

async function createCalibrationPdf(
  fixture: TagOnlyFixture,
  assetSource: MarkerAssetSource,
  sourceSha256: string,
) {
  const document = await PDFDocument.create({ updateMetadata: false })
  setDeterministicMetadata(
    document,
    "DEMO-04 Kalibrier- und Referenzbogen",
    `${fixture.fixtureVersion} | A4 | actual size | non-production`,
    sourceSha256,
  )
  const page = document.addPage([mm(A4_WIDTH_MM), mm(A4_HEIGHT_MM)])
  const font = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const [card, sameOuter, sameModule, ...boardMarkers] = await Promise.all([
    markerAsset(assetSource, tagOnlyCardMarkerFilename(0, "active"), 18),
    markerAsset(assetSource, "tagStandard52h13_id00000_reference_18mm.svg", 18),
    markerAsset(assetSource, "tagStandard52h13_id00000_reference_module_matched.svg", 180 / 11),
    ...fixture.boards.map((board) =>
      markerAsset(assetSource, tagOnlyBoardMarkerFilename(board.boardMarkerId), 36),
    ),
  ])

  page.drawText("TESTDRUCK / KEINE PRODUKTIONSFREIGABE", {
    x: mm(12),
    y: mm(280),
    size: mm(4.2),
    font: bold,
    color: rgb(0.71, 0.32, 0.04),
  })
  page.drawText("DEMO-04 Kalibrier-/Referenzbogen | A4 | 100 %", {
    x: mm(12),
    y: mm(272),
    size: mm(3),
    font: bold,
  })
  page.drawText(`Kanonische Quelle SHA-256 ${sourceSha256}`, {
    x: mm(12),
    y: mm(268),
    size: mm(1.4),
    font,
    color: rgb(0.25, 0.3, 0.38),
  })
  page.drawText(
    "Marker-Aussenmass bezeichnet den offiziellen Familienrasterrand; die weisse Quiet Zone liegt ausserhalb.",
    {
      x: mm(12),
      y: mm(266),
      size: mm(2),
      font,
      color: rgb(0.25, 0.3, 0.38),
    },
  )

  boardMarkers.forEach((marker, index) => {
    const board = fixture.boards[index]
    const x = 12 + index * 71.5
    drawMarker(page, marker, x, 210)
    markerLabel(
      page,
      font,
      bold,
      `Tafelmarker ${board.boardMarkerId}`,
      "tagCircle49h12 | 36 mm",
      x,
      204,
    )
    page.node.set(PDFName.of(`Demo04BoardMarker${board.boardMarkerId}`), PDFNumber.of(1))
  })

  drawMarker(page, card, 14, 165)
  markerLabel(page, font, bold, "Kartenmarker", "tagCircle49h12 ID 0 | 18 mm", 14, 159)
  drawMarker(page, sameOuter, 79, 165)
  markerLabel(page, font, bold, "Referenz", "tagStandard52h13 ID 0 | 18 mm", 79, 159)
  drawMarker(page, sameModule, 144, 167)
  markerLabel(page, font, bold, "Referenz", "Modulgleich | 180/11 mm", 144, 159)

  page.drawRectangle({
    x: mm(12),
    y: mm(125),
    width: mm(100),
    height: mm(10),
    borderColor: rgb(0, 0, 0),
    borderWidth: mm(0.25),
  })
  for (let index = 0; index <= 10; index += 1) {
    page.drawLine({
      start: { x: mm(12 + index * 10), y: mm(125) },
      end: { x: mm(12 + index * 10), y: mm(index % 5 === 0 ? 137 : 132) },
      thickness: mm(0.2),
      color: rgb(0, 0, 0),
    })
  }
  page.drawText("100-mm-Massreferenz", { x: mm(12), y: mm(119), size: mm(2.2), font: bold })

  const instructions = [
    "1. Papierformat A4 und Skalierung 100 % waehlen.",
    "2. 'An Seite anpassen', Verkleinern und automatische Skalierung deaktivieren.",
    "3. 100-mm-Referenz, 18-mm-Kartenmarker, 36-mm-Tafelmarker und Kartenmass 120 x 66 mm nachmessen.",
    "4. Durchgehende weisse Quiet Zone um jeden Marker visuell kontrollieren.",
    "5. Drucker, Treiber, Papier, Skalierung und Messwerte im Preflightprotokoll festhalten.",
    "6. Beide Kartenorientierungen aus Nahdistanz testen; identische Ersatzkarten nie gleichzeitig stecken.",
  ]
  page.drawText("Druck- und Messhinweise", { x: mm(12), y: mm(108), size: mm(3), font: bold })
  instructions.forEach((line, index) => {
    page.drawText(line, { x: mm(12), y: mm(100 - index * 7), size: mm(2.05), font })
  })
  page.drawText("Einzeltafel-Preflight: drei getrennte Belegungen", {
    x: mm(12),
    y: mm(57),
    size: mm(3),
    font: bold,
  })
  fixture.preflight.sequence.forEach((step, index) => {
    const boardEntry = fixture.boards.find((item) => item.id === step.boardId)!
    const cardCount = fixture.activities.filter((item) => item.boardId === step.boardId).length
    page.drawText(
      `${step.order}. Tafel leeren, Marker ${step.boardMarkerId} anbringen, ${cardCount} Karten fuer ${boardEntry.name} einsetzen.`,
      { x: mm(12), y: mm(49 - index * 7), size: mm(2.05), font },
    )
  })
  page.drawText(
    "Dieser Bogen ist Referenz und Testhilfe, kein Produkt- oder Kartenmarker-Vertrag fuer tagStandard52h13.",
    {
      x: mm(12),
      y: mm(16),
      size: mm(2),
      font: bold,
      color: rgb(0.71, 0.32, 0.04),
    },
  )
  page.node.set(PDFName.of("Demo04CalibrationSheet"), PDFNumber.of(1))
  page.node.set(PDFName.of("Demo04BoardMarkerCount"), PDFNumber.of(boardMarkers.length))
  return document.save({ addDefaultPage: false, useObjectStreams: false, objectsPerTick: 1000 })
}

function csvCell(value: string | number | boolean) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function serializeCsv(fixture: TagOnlyFixture, source: SourceBinding) {
  const headers = [
    "canonicalSourcePath",
    "canonicalSourceSha256",
    "demoProjectKey",
    "demoActivityKey",
    "demoArea",
    "sourceBindingState",
    "boardId",
    "boardName",
    "boardMarkerId",
    "company",
    "trade",
    "tradeColor",
    "tradeColorSource",
    "area",
    "week",
    "shortTarget",
    "fullTarget",
    "deviation",
    "markerSlot",
    "activeTagId",
    "doneTagId",
    "featured",
  ]
  const rows = fixture.activities.map((activity) => {
    const board = fixture.boards.find((item) => item.id === activity.boardId)!
    return [
      source.path,
      source.sha256,
      activity.demoProjectKey,
      activity.demoActivityKey,
      activity.demoArea,
      activity.sourceBinding.state,
      activity.boardId,
      board.name,
      board.boardMarkerId,
      activity.company,
      activity.trade,
      activity.tradeColor,
      activity.tradeColorSource,
      activity.area,
      activity.week,
      activity.shortTarget,
      activity.fullTarget,
      activity.deviation,
      activity.markerSlot,
      activity.activeTagId,
      activity.doneTagId,
      activity.featured,
    ].map(csvCell)
  })
  return `${[headers, ...rows].map((row) => row.join(",")).join("\n")}\n`
}

function boardAssignment(fixture: TagOnlyFixture, source: SourceBinding) {
  return {
    schemaVersion: "demo-04-board-assignment-v1",
    fixtureVersion: fixture.fixtureVersion,
    scope: fixture.scope,
    canonicalSource: { path: source.path, sha256: source.sha256 },
    sourceBinding: { state: "unbound" },
    physicalBoardCount: fixture.preflight.physicalBoardCount,
    mode: fixture.preflight.mode,
    instructions: fixture.preflight.instructions,
    sequence: fixture.preflight.sequence.map((step) => {
      const board = fixture.boards.find((item) => item.id === step.boardId)!
      return {
        order: step.order,
        clearPhysicalBoardBeforeUse: true,
        boardId: board.id,
        boardName: board.name,
        demoProjectKey: board.demoProjectKey,
        demoArea: board.demoArea,
        boardMarkerId: board.boardMarkerId,
        activities: fixture.activities
          .filter((activity) => activity.boardId === board.id)
          .map((activity) => ({ ...activity })),
      }
    }),
  }
}

function printInstructions(fixture: TagOnlyFixture, source: SourceBinding) {
  return [
    fixture.printContract.qualification,
    `Fixture: ${fixture.fixtureVersion}`,
    `Kanonische Quelle: ${source.path}`,
    `Kanonische Quelle SHA-256: ${source.sha256}`,
    "Noch nicht an einen LCMD-Export gebunden.",
    "Demo-Tag-IDs vorab reserviert, nicht produktiv vergeben.",
    "Keine LCMD-Liveverbindung. Kein Writeback. Keine validierte laufende Synchronisierung.",
    "",
    "Druckkonfiguration:",
    "- Papierformat: A4",
    "- Skalierung: 100 % / Tatsaechliche Groesse",
    "- 'An Seite anpassen': deaktiviert",
    "- Kartenmass nach Schnitt: 120 x 66 mm",
    "- Kartenmarker-Aussenmass: 18 mm zuzueglich unbedruckter Quiet Zone",
    "- Tafelmarker-Aussenmass: 36 mm zuzueglich unbedruckter Quiet Zone",
    "",
    "Vor Verwendung Drucker, Treiber, Papier, Skalierung und nachgemessene Masse protokollieren.",
    "Beide 180-Grad-Orientierungen pruefen. Ersatzdrucke getrennt halten.",
    "Dieser Satz ist ein ungewerteter synthetischer Preflight und keine Produktionsfreigabe.",
    "",
  ].join("\n")
}

async function createTagOnlyPrintPackageFromSource(
  source: SourceBinding,
  assetDir: string,
): Promise<TagOnlyPrintPackage> {
  const fixture = source.fixture
  const verified = verifyTagOnlyAssetsAgainstSource(assetDir, source.bytes)
  const [cardsPdf, calibrationPdf] = await Promise.all([
    createCardsA4Pdf(fixture, verified.verifiedSvgBytes, source.sha256),
    createCalibrationPdf(fixture, verified.verifiedSvgBytes, source.sha256),
  ])
  const encoder = new TextEncoder()
  const manifestJson = encoder.encode(
    `${JSON.stringify(
      {
        schemaVersion: "demo04-tag-only-print-manifest-v1",
        canonicalSource: { path: source.path, sha256: source.sha256 },
        fixture,
      },
      null,
      2,
    )}\n`,
  )
  const manifestCsv = encoder.encode(serializeCsv(fixture, source))
  const boardAssignmentBytes = encoder.encode(
    `${JSON.stringify(boardAssignment(fixture, source), null, 2)}\n`,
  )
  const instructions = encoder.encode(printInstructions(fixture, source))
  const sourceJson = encoder.encode(
    `${JSON.stringify(
      {
        schemaVersion: "demo04-tag-only-source-v1",
        canonicalSource: { path: source.path, sha256: source.sha256 },
        fixtureVersion: fixture.fixtureVersion,
        scope: fixture.scope,
        sourceBinding: { state: "unbound" },
      },
      null,
      2,
    )}\n`,
  )
  const artifacts = {
    cardsPdf,
    calibrationPdf,
    manifestJson,
    manifestCsv,
    boardAssignment: boardAssignmentBytes,
    instructions,
    source: sourceJson,
  }
  const checksumLines = (Object.keys(artifacts) as Array<keyof typeof artifacts>)
    .map((key) => `${sha256(artifacts[key])}  ${TAG_ONLY_PRINT_FILES[key]}`)
    .sort()
  return { ...artifacts, checksums: encoder.encode(`${checksumLines.join("\n")}\n`) }
}

export async function createTagOnlyPrintPackage(): Promise<TagOnlyPrintPackage> {
  const source = await readCanonicalSource()
  return createTagOnlyPrintPackageFromSource(source, resolve("public/ana09c4"))
}

export async function createTagOnlyPrintPackageForTest(
  fixtureInput: TagOnlyFixture,
  assetDir = resolve("public/ana09c4"),
): Promise<TagOnlyPrintPackage> {
  const fixture = validateTagOnlyFixture(structuredClone(fixtureInput))
  const bytes = new TextEncoder().encode(`${JSON.stringify(fixture, null, 2)}\n`)
  return createTagOnlyPrintPackageFromSource(
    { path: TAG_ONLY_CANONICAL_SOURCE_PATH, sha256: sha256(bytes), bytes, fixture },
    assetDir,
  )
}

const PACKAGE_FILES: Array<[keyof TagOnlyPrintPackage, string]> = [
  ["cardsPdf", TAG_ONLY_PRINT_FILES.cardsPdf],
  ["calibrationPdf", TAG_ONLY_PRINT_FILES.calibrationPdf],
  ["manifestJson", TAG_ONLY_PRINT_FILES.manifestJson],
  ["manifestCsv", TAG_ONLY_PRINT_FILES.manifestCsv],
  ["boardAssignment", TAG_ONLY_PRINT_FILES.boardAssignment],
  ["instructions", TAG_ONLY_PRINT_FILES.instructions],
  ["source", TAG_ONLY_PRINT_FILES.source],
  ["checksums", TAG_ONLY_PRINT_FILES.checksums],
]

async function assertAbsent(path: string) {
  try {
    await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
  throw new Error(`Tag-only output directory already exists: ${path}`)
}

export async function writeTagOnlyPrintPackage(
  outputValue: string,
  { replace = false }: { replace?: boolean } = {},
) {
  const source = await readCanonicalSource()
  return writeTagOnlyPrintPackageFromSource(outputValue, source, resolve("public/ana09c4"), replace)
}

async function writeTagOnlyPrintPackageFromSource(
  outputValue: string,
  source: SourceBinding,
  assetDir: string,
  replace = false,
) {
  const outputDir = resolve(outputValue)
  const parent = dirname(outputDir)
  await mkdir(parent, { recursive: true })
  const targetLock = acquireTargetLock(outputDir)
  try {
    recoverTargetArtifacts(outputDir, { restoreBackup: true })
    if (!replace) await assertAbsent(outputDir)
    const stagingDir = await mkdtemp(join(parent, `.${basename(outputDir)}.tmp-`))
    try {
      const printPackage = await createTagOnlyPrintPackageFromSource(source, assetDir)
      for (const [key, filename] of PACKAGE_FILES) {
        const handle = await open(join(stagingDir, filename), "wx")
        try {
          await handle.writeFile(printPackage[key])
          await handle.sync()
        } finally {
          await handle.close()
        }
      }
      if (!replace) {
        await assertAbsent(outputDir)
        await rename(stagingDir, outputDir)
      } else {
        const backupDir = join(parent, `.${basename(outputDir)}.backup`)
        await assertAbsent(backupDir)
        try {
          await rename(outputDir, backupDir)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
        try {
          await rename(stagingDir, outputDir)
          await rm(backupDir, { recursive: true, force: true })
        } catch (error) {
          try {
            await rename(backupDir, outputDir)
          } catch (restoreError) {
            if ((restoreError as NodeJS.ErrnoException).code !== "ENOENT") throw restoreError
          }
          throw error
        }
      }
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true })
      throw error
    }
  } finally {
    targetLock.release()
  }
  return outputDir
}

export async function writeTagOnlyPrintPackageForTest(
  outputValue: string,
  fixtureInput: TagOnlyFixture,
  assetDir = resolve("public/ana09c4"),
) {
  const fixture = validateTagOnlyFixture(structuredClone(fixtureInput))
  const bytes = new TextEncoder().encode(`${JSON.stringify(fixture, null, 2)}\n`)
  return writeTagOnlyPrintPackageFromSource(
    outputValue,
    { path: TAG_ONLY_CANONICAL_SOURCE_PATH, sha256: sha256(bytes), bytes, fixture },
    assetDir,
  )
}
