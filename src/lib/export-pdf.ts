import { PDFDocument } from "pdf-lib"

import type { SvgTicketTemplate } from "@/lib/template-types"
import type { TicketData } from "@/lib/ticket-types"
import { renderTemplateString } from "@/lib/render-template"
import { A4_SIZE_MM, DEFAULT_A4_2X2_LAYOUT_MM, mmToPt } from "@/lib/units"

/**
 * Renders an SVG template with ticket data to a PNG data URL.
 * Uses canvas to rasterize the SVG at print quality (600 DPI).
 */
async function renderSvgToPng(
  template: SvgTicketTemplate,
  ticket: TicketData,
  dpi: number = 600,
): Promise<Uint8Array> {
  const renderedSvg = renderTemplateString(template.svg, ticket)

  // Calculate pixel dimensions at the target DPI
  // 1 inch = 25.4 mm
  const widthPx = Math.round((template.widthMm / 25.4) * dpi)
  const heightPx = Math.round((template.heightMm / 25.4) * dpi)

  // Create a blob from the SVG
  const svgBlob = new Blob([renderedSvg], { type: "image/svg+xml;charset=utf-8" })
  const svgUrl = URL.createObjectURL(svgBlob)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Create a canvas and draw the SVG
      const canvas = document.createElement("canvas")
      canvas.width = widthPx
      canvas.height = heightPx

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        URL.revokeObjectURL(svgUrl)
        reject(new Error("Could not get canvas context"))
        return
      }

      // Fill with white background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, widthPx, heightPx)

      // Draw the SVG
      ctx.drawImage(img, 0, 0, widthPx, heightPx)

      URL.revokeObjectURL(svgUrl)

      // Convert canvas to PNG bytes
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create PNG blob"))
            return
          }
          blob.arrayBuffer().then((buffer) => {
            resolve(new Uint8Array(buffer))
          })
        },
        "image/png",
        1.0,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      reject(new Error("Failed to load SVG for rendering"))
    }
    img.src = svgUrl
  })
}

export async function exportTicketsPdfBytes(params: {
  tickets: TicketData[]
  template: SvgTicketTemplate
}) {
  const { tickets, template } = params

  const pdfDoc = await PDFDocument.create()

  const pageWidthPts = mmToPt(A4_SIZE_MM.width)
  const pageHeightPts = mmToPt(A4_SIZE_MM.height)

  const layout = DEFAULT_A4_2X2_LAYOUT_MM
  const perPage = layout.cols * layout.rows

  // Pre-render all tickets to PNG
  const ticketImages: Uint8Array[] = []
  for (const ticket of tickets) {
    const pngBytes = await renderSvgToPng(template, ticket)
    ticketImages.push(pngBytes)
  }

  // Embed images and create pages
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

    // Convert to PDF coordinates (origin at bottom-left)
    const x = mmToPt(originXmm)
    const y = pageHeightPts - mmToPt(originYTopMm + template.heightMm)
    const width = mmToPt(template.widthMm)
    const height = mmToPt(template.heightMm)

    // Embed and draw the image
    const pngImage = await pdfDoc.embedPng(ticketImages[i])
    page.drawImage(pngImage, {
      x,
      y,
      width,
      height,
    })
  }

  return pdfDoc.save()
}
