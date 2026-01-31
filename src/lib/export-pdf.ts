import { PDFDocument, type PDFPage, type PDFFont, StandardFonts, degrees, rgb } from "pdf-lib"

import type { TicketTemplate, TemplateElement } from "@/lib/template-types"
import type { TicketData } from "@/lib/ticket-types"
import { renderTemplateString } from "@/lib/render-template"
import { A4_SIZE_MM, DEFAULT_A4_2X2_LAYOUT_MM, mmToPt } from "@/lib/units"

function hexToRgbTuple(hex: string) {
  const s = hex.trim().replace(/^#/, "")
  if (s.length !== 6) return null
  const r = Number.parseInt(s.slice(0, 2), 16)
  const g = Number.parseInt(s.slice(2, 4), 16)
  const b = Number.parseInt(s.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return null
  return [r / 255, g / 255, b / 255] as const
}

function safeColor(hex: string | undefined) {
  if (!hex) return null
  const t = hexToRgbTuple(hex)
  return t ? rgb(t[0], t[1], t[2]) : null
}

function renderText(text: string, ticket: TicketData) {
  return renderTemplateString(text, ticket)
}

function drawElement(params: {
  page: PDFPage
  template: TicketTemplate
  element: TemplateElement
  ticket: TicketData
  originXPts: number
  originYPts: number
  font: PDFFont
}) {
  const { page, template, element: el, ticket, originXPts, originYPts, font } = params

  const ticketHeightMm = template.heightMm

  const xTopLeft = (xMm: number) => originXPts + mmToPt(xMm)
  const yTopLeftToPdfBottom = (yMm: number, hMm = 0) =>
    originYPts + mmToPt(ticketHeightMm - yMm - hMm)

  if (el.type === "rect") {
    const wPts = mmToPt(el.wMm)
    const hPts = mmToPt(el.hMm)
    const xPts = xTopLeft(el.xMm)
    const yPts = yTopLeftToPdfBottom(el.yMm, el.hMm)
    const fill = safeColor(el.fill)
    const border = safeColor(el.stroke)

    page.drawRectangle({
      x: xPts,
      y: yPts,
      width: wPts,
      height: hPts,
      color: fill ?? undefined,
      borderColor: border ?? undefined,
      borderWidth: mmToPt(el.strokeWidthMm ?? 0),
    })
    return
  }

  if (el.type === "line") {
    const x1 = xTopLeft(el.x1Mm)
    const x2 = xTopLeft(el.x2Mm)
    const y1 = originYPts + mmToPt(ticketHeightMm - el.y1Mm)
    const y2 = originYPts + mmToPt(ticketHeightMm - el.y2Mm)
    const stroke = safeColor(el.stroke) ?? rgb(0.07, 0.07, 0.07)

    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: mmToPt(el.strokeWidthMm ?? 0.4),
      color: stroke,
    })
    return
  }

  if (el.type === "triangle") {
    const fill = safeColor(el.fill)
    const border = safeColor(el.stroke)

    const xPts = xTopLeft(el.xMm)
    const yPts = yTopLeftToPdfBottom(el.yMm, el.hMm)
    const wPts = mmToPt(el.wMm)
    const hPts = mmToPt(el.hMm)

    let path = ""
    if (el.corner === "br") {
      path = `M ${xPts + wPts} ${yPts + hPts} L ${xPts + wPts} ${yPts} L ${xPts} ${yPts} Z`
    } else if (el.corner === "bl") {
      path = `M ${xPts} ${yPts + hPts} L ${xPts + wPts} ${yPts} L ${xPts} ${yPts} Z`
    } else if (el.corner === "tr") {
      path = `M ${xPts} ${yPts + hPts} L ${xPts + wPts} ${yPts + hPts} L ${xPts + wPts} ${yPts} Z`
    } else {
      // tl
      path = `M ${xPts} ${yPts + hPts} L ${xPts + wPts} ${yPts + hPts} L ${xPts} ${yPts} Z`
    }

    page.drawSvgPath(path, {
      color: fill ?? undefined,
      borderColor: border ?? undefined,
      borderWidth: mmToPt(el.strokeWidthMm ?? 0),
    })
    return
  }

  if (el.type === "text") {
    const text = renderText(el.text, ticket)
    const fontSize = mmToPt(el.fontSizeMm)
    const wPts = mmToPt(el.wMm)
    const hPts = mmToPt(el.hMm)
    const xPts0 = xTopLeft(el.xMm)
    const yPts0 = yTopLeftToPdfBottom(el.yMm, el.hMm)

    const color = safeColor(el.color) ?? rgb(0.07, 0.07, 0.07)
    const rotate = degrees(el.rotateDeg ?? 0)
    const align = el.align ?? "left"
    const valign = el.valign ?? "top"

    const lines = text.split(/\r?\n/)
    const lineHeight = fontSize * 1.15
    const blockHeight = Math.min(hPts, lineHeight * lines.length)

    const startY =
      valign === "top"
        ? yPts0 + hPts - fontSize
        : valign === "middle"
          ? yPts0 + (hPts + blockHeight) / 2 - fontSize
          : yPts0 + blockHeight - fontSize

    lines.forEach((line: string, idx: number) => {
      const y = startY - idx * lineHeight
      const textWidth = font.widthOfTextAtSize(line, fontSize)
      const x =
        align === "left"
          ? xPts0
          : align === "center"
            ? xPts0 + (wPts - textWidth) / 2
            : xPts0 + (wPts - textWidth)

      page.drawText(line, {
        x,
        y,
        size: fontSize,
        font,
        color,
        rotate,
      })
    })
    return
  }

  // image elements are not exported yet.
}

export async function exportTicketsPdfBytes(params: {
  tickets: TicketData[]
  template: TicketTemplate
}) {
  const { tickets, template } = params

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const pageWidthPts = mmToPt(A4_SIZE_MM.width)
  const pageHeightPts = mmToPt(A4_SIZE_MM.height)

  const layout = DEFAULT_A4_2X2_LAYOUT_MM
  const perPage = layout.cols * layout.rows

  let page = pdfDoc.addPage([pageWidthPts, pageHeightPts])
  for (let i = 0; i < tickets.length; i += 1) {
    if (i > 0 && i % perPage === 0) {
      page = pdfDoc.addPage([pageWidthPts, pageHeightPts])
    }

    const idx = i % perPage
    const row = Math.floor(idx / layout.cols)
    const col = idx % layout.cols

    const originXmm = layout.margin.x + col * (layout.ticket.width + layout.gap.x)
    const originYTopMm = layout.margin.y + row * (layout.ticket.height + layout.gap.y)

    const originXPts = mmToPt(originXmm)
    const originYPts = pageHeightPts - mmToPt(originYTopMm + template.heightMm)

    for (const el of template.elements) {
      if (el.hidden) continue
      drawElement({
        page,
        template,
        element: el,
        ticket: tickets[i],
        originXPts,
        originYPts,
        font,
      })
    }
  }

  return pdfDoc.save()
}
