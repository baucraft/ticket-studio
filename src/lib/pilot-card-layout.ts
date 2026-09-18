import { degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib"

export const PILOT_CARD_SHORT_MM = 66
export const PILOT_CARD_LONG_MM = 120
export const PILOT_CARD_INNER_SHORT_MM = 62.5
export const PILOT_CARD_INNER_LONG_MM = 117

const TITLE_SIZE_MM = 2.5
const DETAIL_SIZE_MM = 1.35
const TRADE_COLOR = rgb(0.04, 0.38, 0.42)
const COMPLETED_BACKGROUND = rgb(0.86, 0.96, 0.9)
const COMPLETED_INK = rgb(0.05, 0.32, 0.18)

export type PilotCardLayoutData = {
  activity: string
  task?: string | null
  trade?: string | null
  area?: string | null
  date: string
}

export function mm(value: number) {
  return (value * 72) / 25.4
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
) {
  const maxWidth = mm(withCodes ? 35 : 54)
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
  card: PilotCardLayoutData,
  completed: boolean,
  withCodes: boolean,
) {
  const layout = visibleTextLayout(font, bold, card, withCodes)
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
) {
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
    color: TRADE_COLOR,
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
    color: TRADE_COLOR,
  })
  page.drawRectangle({
    x: 0,
    y: 0,
    width: mm(PILOT_CARD_SHORT_MM),
    height: mm(6),
    color: TRADE_COLOR,
  })
  codeMarkers?.drawActive()
  codeMarkers?.drawDone()
  page.drawText("AKTIV", { x: mm(4), y: mm(111), size: mm(2.1), font: bold, color: TRADE_COLOR })
  page.drawText("ERLEDIGT", {
    x: mm(62),
    y: mm(9),
    size: mm(2.1),
    font: bold,
    rotate: degrees(180),
    color: COMPLETED_INK,
  })
  const activeLayout = drawVisibleText(page, font, bold, card, false, Boolean(codeMarkers))
  const doneLayout = drawVisibleText(page, font, bold, card, true, Boolean(codeMarkers))
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
