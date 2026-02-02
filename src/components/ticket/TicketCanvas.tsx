import type { SvgTicketTemplate } from "@/lib/template-types"
import type { TicketData } from "@/lib/ticket-types"
import { renderTemplateString } from "@/lib/render-template"
import { wrapSvgText } from "@/lib/svg-text-wrap"
import { mmToPx } from "@/lib/units"

type Props = {
  template: SvgTicketTemplate
  ticket?: TicketData
  scale?: number
  className?: string
  flipped?: boolean
  showReferenceImage?: boolean
}

export function TicketCanvas({
  template,
  ticket,
  scale = 1,
  className,
  flipped,
  showReferenceImage,
}: Props) {
  const widthPx = mmToPx(template.widthMm, scale)
  const heightPx = mmToPx(template.heightMm, scale)

  // Render the SVG with Mustache to fill in ticket data
  // Ensure SVG has correct viewBox and fills container (SVG-Edit may strip viewBox)
  const rawSvg = renderTemplateString(template.svg, ticket ?? {})
  // Apply text wrapping for elements with data-wrap-width attribute
  const wrappedSvg = wrapSvgText(rawSvg)
  const viewBox = `0 0 ${template.widthMm} ${template.heightMm}`

  let renderedSvg = wrappedSvg
  // Add viewBox if missing
  if (!rawSvg.includes("viewBox")) {
    renderedSvg = rawSvg.replace(/<svg/, `<svg viewBox="${viewBox}"`)
  }
  // Replace width/height with 100% to fill container
  renderedSvg = renderedSvg
    .replace(/width="[^"]*mm"/, 'width="100%"')
    .replace(/height="[^"]*mm"/, 'height="100%"')

  return (
    <div
      className={className}
      style={{
        width: widthPx,
        height: heightPx,
        position: "relative",
        overflow: "hidden",
        background: "#fff",
        transform: flipped ? "rotate(180deg)" : undefined,
      }}
    >
      {showReferenceImage ? (
        <img
          alt="ticket reference"
          src={new URL("../../assets/ticket-blank.png", import.meta.url).toString()}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0.3,
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      ) : null}

      {/* Render the SVG */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
        dangerouslySetInnerHTML={{ __html: renderedSvg }}
      />
    </div>
  )
}

/**
 * Renders an SVG template with ticket data to a data URL for export.
 * Uses a canvas to rasterize the SVG at the specified DPI.
 */
export async function renderSvgToDataUrl(
  template: SvgTicketTemplate,
  ticket: TicketData,
  dpi: number = 300,
): Promise<string> {
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

      // Convert to data URL
      resolve(canvas.toDataURL("image/png"))
    }
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl)
      reject(new Error("Failed to load SVG for rendering"))
    }
    img.src = svgUrl
  })
}

/**
 * Renders an SVG template with ticket data to a PNG Uint8Array for PDF embedding.
 */
export async function renderSvgToPngBytes(
  template: SvgTicketTemplate,
  ticket: TicketData,
  dpi: number = 300,
): Promise<Uint8Array> {
  const dataUrl = await renderSvgToDataUrl(template, ticket, dpi)

  // Convert data URL to Uint8Array
  const base64 = dataUrl.split(",")[1]
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}
