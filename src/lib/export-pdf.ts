import { PDFDocument } from "pdf-lib"

import type { SvgTicketTemplate } from "@/lib/template-types"
import type { TicketData } from "@/lib/ticket-types"
import { renderTemplateString } from "@/lib/render-template"
import { mmToPt } from "@/lib/units"

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

  // Page size = exact ticket dimensions
  const pageWidthPt = mmToPt(template.widthMm)
  const pageHeightPt = mmToPt(template.heightMm)

  // Render each ticket on its own page
  for (const ticket of tickets) {
    const pngBytes = await renderSvgToPng(template, ticket)
    const pngImage = await pdfDoc.embedPng(pngBytes)

    // Create a page with exact ticket dimensions
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt])

    // Draw ticket full-page (no margins)
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageWidthPt,
      height: pageHeightPt,
    })
  }

  return pdfDoc.save()
}
