import { jsPDF } from "jspdf"
import "svg2pdf.js"

import type { SvgTicketTemplate } from "@/lib/template-types"
import type { TicketData } from "@/lib/ticket-types"
import { renderTemplateString } from "@/lib/render-template"

/**
 * Parse SVG string to SVG element for svg2pdf.js
 * Normalizes font-family to use helvetica (jsPDF's built-in sans-serif)
 */
function parseSvgString(svgString: string): SVGElement {
  // Normalize font-family to helvetica (jsPDF's built-in sans-serif)
  // svg2pdf.js maps "helvetica" to jsPDF's built-in Helvetica font
  const normalizedSvg = svgString
    .replace(/font-family="[^"]*"/g, 'font-family="helvetica"')
    .replace(/font-family='[^']*'/g, "font-family='helvetica'")

  const parser = new DOMParser()
  const doc = parser.parseFromString(normalizedSvg, "image/svg+xml")
  const svgElement = doc.documentElement as unknown as SVGElement
  return svgElement
}

/**
 * Yield control to the browser to keep UI responsive
 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export type ExportProgress = {
  current: number
  total: number
  percent: number
}

export async function exportTicketsPdfBytes(params: {
  tickets: TicketData[]
  template: SvgTicketTemplate
  onProgress?: (progress: ExportProgress) => void
}): Promise<Uint8Array> {
  const { tickets, template, onProgress } = params

  // Create PDF with first page dimensions in mm
  const pdf = new jsPDF({
    orientation: template.widthMm > template.heightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [template.widthMm, template.heightMm],
  })

  // Set helvetica as the default font (jsPDF's built-in sans-serif)
  pdf.setFont("helvetica", "normal")

  const total = tickets.length

  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]

    // Add new page for tickets after the first
    if (i > 0) {
      pdf.addPage([template.widthMm, template.heightMm])
    }

    // Render mustache template with ticket data
    const renderedSvg = renderTemplateString(template.svg, ticket)

    // Parse SVG string to element
    const svgElement = parseSvgString(renderedSvg)

    // Render SVG directly to PDF (vector, no rasterization)
    await pdf.svg(svgElement, {
      x: 0,
      y: 0,
      width: template.widthMm,
      height: template.heightMm,
    })

    // Report progress and yield to keep UI responsive
    const current = i + 1
    onProgress?.({ current, total, percent: Math.round((current / total) * 100) })

    // Yield every 10 tickets to keep UI responsive
    if (i % 10 === 0) {
      await yieldToMain()
    }
  }

  // Return as Uint8Array
  const arrayBuffer = pdf.output("arraybuffer")
  return new Uint8Array(arrayBuffer)
}
