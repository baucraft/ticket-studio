import { degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib"

export const PILOT_CARD_SHORT_MM = 66
export const PILOT_CARD_LONG_MM = 120
export const PILOT_CARD_INNER_SHORT_MM = 62.5
export const PILOT_CARD_INNER_LONG_MM = 117

const MAX_TITLE_SIZE_MM = 3.2
const MIN_TITLE_SIZE_MM = 1.8
const MAX_DETAIL_SIZE_MM = 1.35
const MIN_DETAIL_SIZE_MM = 0.9
const TEXT_OUTER_DEPTH_MM = -3
const TEXT_DEPTH_MM = 14
const LINE_GAP_MM = 0.4
const SECTION_GAP_MM = 0.8
const TITLE_HIERARCHY_GAP_MM = 0.2
const DEFAULT_TRADE_COLOR = rgb(0.04, 0.38, 0.42)
export const COMPLETED_BACKGROUND_RGB = [217 / 255, 249 / 255, 157 / 255] as const
export const COMPLETED_BACKGROUND_CSS = "rgb(217 249 157)"
const COMPLETED_BACKGROUND = rgb(...COMPLETED_BACKGROUND_RGB)
const COMPLETED_INK = rgb(54 / 255, 83 / 255, 20 / 255)

export type PilotCardLayoutData = {
  uid: string
  activity: string
  task?: string | null
  trade?: string | null
  area?: string | null
  date: string
}

export function mm(value: number) {
  return (value * 72) / 25.4
}

export function cardMetaLine(
  uid: string,
  date: string,
  trade?: string | null,
  area?: string | null,
) {
  if (!uid.trim()) throw new Error("Karten-ID fehlt.")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Kartendatum ist kein ISO-Datum.")
  const value = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== date) {
    throw new Error("Kartendatum ist ungueltig.")
  }
  const isoDay = value.getUTCDay() || 7
  const thursday = new Date(value)
  thursday.setUTCDate(thursday.getUTCDate() + 4 - isoDay)
  const weekYear = thursday.getUTCFullYear()
  const yearStart = new Date(Date.UTC(weekYear, 0, 1))
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `ID ${uid.trim()} | KW ${String(week).padStart(2, "0")}/${String(weekYear).slice(-2)}-${isoDay} | ${trade?.trim() || "Gewerk nicht angegeben"} | ${area?.trim() || "Bereich nicht angegeben"}`
}

export function cardVisibleMetaLine(uid: string, trade?: string | null, area?: string | null) {
  if (!uid.trim()) throw new Error("Karten-ID fehlt.")
  return `ID ${uid.trim()} | ${trade?.trim() || "Gewerk nicht angegeben"} | ${area?.trim() || "Bereich nicht angegeben"}`
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

function visibleTextLayout(
  font: PDFFont,
  bold: PDFFont,
  card: PilotCardLayoutData,
  withCodes: boolean,
  titleSizeMm: number,
  detailSizeMm: number,
) {
  const maxWidth = mm(withCodes ? 35 : 54)
  const titleText = card.task?.trim() || card.activity
  const title = completeWrappedLines(bold, titleText, mm(titleSizeMm), maxWidth)
  const meta = completeWrappedLines(
    font,
    cardVisibleMetaLine(card.uid, card.trade, card.area),
    mm(detailSizeMm),
    maxWidth,
  )

  const metrics = (lineFont: PDFFont, sizeMm: number) => {
    const size = mm(sizeMm)
    const ascentMm = lineFont.heightAtSize(size, { descender: false }) / mm(1)
    const heightMm = lineFont.heightAtSize(size) / mm(1)
    return { ascentMm, descentMm: heightMm - ascentMm }
  }
  const titleMetrics = metrics(bold, titleSizeMm)
  const metaMetrics = metrics(font, detailSizeMm)
  const positionForward = (
    lines: string[],
    lineMetrics: ReturnType<typeof metrics>,
    startDepthMm: number,
  ) =>
    lines.map((text, index) => ({
      text,
      depthMm: startDepthMm + index * (lineMetrics.ascentMm + lineMetrics.descentMm + LINE_GAP_MM),
    }))

  const positionedTitle = positionForward(title, titleMetrics, 0)
  const titleOuterEdge = positionedTitle[0]!.depthMm - titleMetrics.ascentMm
  const titleInnerEdge = positionedTitle.at(-1)!.depthMm + titleMetrics.descentMm

  const metaStepMm = metaMetrics.ascentMm + metaMetrics.descentMm + LINE_GAP_MM
  const metaLastBaselineMm = TEXT_DEPTH_MM - metaMetrics.descentMm
  const metaFirstBaselineMm = metaLastBaselineMm - (meta.length - 1) * metaStepMm
  const positionedMeta = positionForward(meta, metaMetrics, metaFirstBaselineMm)
  const metaOuterEdge = positionedMeta[0]!.depthMm - metaMetrics.ascentMm
  if (titleOuterEdge < TEXT_OUTER_DEPTH_MM || metaOuterEdge - titleInnerEdge < SECTION_GAP_MM) {
    throw new Error("Kartentext passt nicht vollstaendig in die beiden sichtbaren Kartenenden.")
  }
  return {
    title: positionedTitle,
    meta: positionedMeta,
    titleSizeMm,
    detailSizeMm,
  }
}

function fittingVisibleTextLayout(
  font: PDFFont,
  bold: PDFFont,
  card: PilotCardLayoutData,
  withCodes: boolean,
  preferredTitleSizeMm: number,
) {
  const titleSteps = Math.ceil((preferredTitleSizeMm - MIN_TITLE_SIZE_MM) / 0.2)
  const detailSteps = Math.ceil((MAX_DETAIL_SIZE_MM - MIN_DETAIL_SIZE_MM) / 0.05)
  for (let detailStep = 0; detailStep <= detailSteps; detailStep += 1) {
    const detailSizeMm = Math.max(MIN_DETAIL_SIZE_MM, MAX_DETAIL_SIZE_MM - detailStep * 0.05)
    for (let titleStep = 0; titleStep <= titleSteps; titleStep += 1) {
      const titleSizeMm = Math.max(MIN_TITLE_SIZE_MM, preferredTitleSizeMm - titleStep * 0.2)
      try {
        return visibleTextLayout(font, bold, card, withCodes, titleSizeMm, detailSizeMm)
      } catch {
        // Exhaust readable title sizes before reducing the subordinate metadata.
      }
    }
  }
  throw new Error("Kartentext passt nicht vollstaendig in die beiden sichtbaren Kartenenden.")
}

function drawVisibleText(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  card: PilotCardLayoutData,
  completed: boolean,
  withCodes: boolean,
  completedColor: ReturnType<typeof rgb>,
  titleSizeMm: number,
) {
  const layout = fittingVisibleTextLayout(font, bold, card, withCodes, titleSizeMm)
  const color = completed ? completedColor : rgb(0.05, 0.07, 0.12)
  const xMm = completed ? 62 : 4
  const rotation = completed ? degrees(180) : undefined
  const direction = completed ? 1 : -1
  const originMm = completed ? 17 : 103
  const drawLines = (
    lines: Array<{ text: string; depthMm: number }>,
    sizeMm: number,
    lineFont: PDFFont,
  ) => {
    for (const line of lines) {
      page.drawText(line.text, {
        x: mm(xMm),
        y: mm(originMm + direction * line.depthMm),
        size: mm(sizeMm),
        font: lineFont,
        rotate: rotation,
        color,
      })
    }
  }
  drawLines(layout.title, layout.titleSizeMm, bold)
  drawLines(layout.meta, layout.detailSizeMm, font)
  return layout
}

export function planningLabel(date: string) {
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

export function drawPilotCardFace(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  card: PilotCardLayoutData,
  codeMarkers?: { drawActive: () => void; drawDone: () => void },
  tradeColor = DEFAULT_TRADE_COLOR,
  titleSizeMm = MAX_TITLE_SIZE_MM,
) {
  const completedColor = COMPLETED_INK
  const activeInk = codeMarkers ? rgb(0.05, 0.07, 0.12) : tradeColor
  const fittedTitleSizeMm = fittingVisibleTextLayout(
    font,
    bold,
    card,
    Boolean(codeMarkers),
    titleSizeMm,
  ).titleSizeMm
  const statusSizeMm = Math.min(2.1, fittedTitleSizeMm - TITLE_HIERARCHY_GAP_MM)
  const contextSizeMm = Math.min(1.8, fittedTitleSizeMm - TITLE_HIERARCHY_GAP_MM)
  page.drawRectangle({
    x: 0,
    y: 0,
    width: mm(PILOT_CARD_SHORT_MM),
    height: mm(PILOT_CARD_LONG_MM),
    color: rgb(1, 1, 1),
  })
  page.drawRectangle({
    x: 0,
    y: mm(88),
    width: mm(PILOT_CARD_SHORT_MM),
    height: mm(32),
    color: tradeColor,
    opacity: 0.1,
  })
  page.drawRectangle({
    x: 0,
    y: 0,
    width: mm(PILOT_CARD_SHORT_MM),
    height: mm(32),
    color: COMPLETED_BACKGROUND,
  })
  page.drawRectangle({
    x: 0,
    y: mm(114),
    width: mm(PILOT_CARD_SHORT_MM),
    height: mm(6),
    color: tradeColor,
  })
  page.drawRectangle({
    x: 0,
    y: 0,
    width: mm(PILOT_CARD_SHORT_MM),
    height: mm(6),
    color: tradeColor,
  })
  codeMarkers?.drawActive()
  codeMarkers?.drawDone()
  page.drawText("AKTIV", {
    x: mm(4),
    y: mm(111),
    size: mm(statusSizeMm),
    font: bold,
    color: activeInk,
  })
  page.drawText("ERLEDIGT", {
    x: mm(62),
    y: mm(9),
    size: mm(statusSizeMm),
    font: bold,
    rotate: degrees(180),
    color: completedColor,
  })
  const activeLayout = drawVisibleText(
    page,
    font,
    bold,
    card,
    false,
    Boolean(codeMarkers),
    completedColor,
    titleSizeMm,
  )
  const doneLayout = drawVisibleText(
    page,
    font,
    bold,
    card,
    true,
    Boolean(codeMarkers),
    completedColor,
    titleSizeMm,
  )
  if (JSON.stringify(activeLayout) !== JSON.stringify(doneLayout)) {
    throw new Error("Die beiden sichtbaren Kartenenden verwenden nicht dasselbe Textlayout.")
  }
  page.drawText(planningLabel(card.date), {
    x: mm(4),
    y: mm(84),
    size: mm(contextSizeMm),
    font: bold,
    color: rgb(0.15, 0.18, 0.23),
  })
  page.drawText("Kommentar:", {
    x: mm(4),
    y: mm(77),
    size: mm(contextSizeMm),
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
