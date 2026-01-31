import type { TicketTemplate, TemplateElement } from "@/lib/template-types"
import type { TicketData } from "@/lib/ticket-types"
import { renderTemplateString } from "@/lib/render-template"
import { mmToPx } from "@/lib/units"

type Props = {
  template: TicketTemplate
  ticket?: TicketData
  scale?: number
  className?: string
  flipped?: boolean
  showReferenceImage?: boolean
}

const CLIP_BY_CORNER: Record<string, string> = {
  br: "polygon(100% 0%, 100% 100%, 0% 100%)",
  bl: "polygon(0% 0%, 100% 100%, 0% 100%)",
  tr: "polygon(0% 0%, 100% 0%, 100% 100%)",
  tl: "polygon(0% 0%, 100% 0%, 0% 100%)",
}

function renderElementText(text: string, ticket: TicketData | undefined) {
  return renderTemplateString(text, ticket ?? {})
}

function elementStyle(el: TemplateElement, scale: number): React.CSSProperties {
  if (el.type === "rect" || el.type === "text" || el.type === "image" || el.type === "triangle") {
    return {
      position: "absolute",
      left: mmToPx(el.xMm, scale),
      top: mmToPx(el.yMm, scale),
      width: mmToPx(el.wMm, scale),
      height: mmToPx(el.hMm, scale),
    }
  }

  return {
    position: "absolute",
  }
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

      {template.elements
        .filter((el) => !el.hidden)
        .map((el) => {
          if (el.type === "rect") {
            const borderWidth = mmToPx(el.strokeWidthMm ?? 0, scale)
            return (
              <div
                key={el.id}
                style={{
                  ...elementStyle(el, scale),
                  background: el.fill ?? "transparent",
                  border:
                    el.stroke && (el.strokeWidthMm ?? 0) > 0
                      ? `${borderWidth}px solid ${el.stroke}`
                      : undefined,
                  boxSizing: "border-box",
                }}
              />
            )
          }

          if (el.type === "line") {
            const strokeWidth = mmToPx(el.strokeWidthMm ?? 0.4, scale)
            const x1 = mmToPx(el.x1Mm, scale)
            const y1 = mmToPx(el.y1Mm, scale)
            const x2 = mmToPx(el.x2Mm, scale)
            const y2 = mmToPx(el.y2Mm, scale)

            const isHorizontal = Math.abs(y2 - y1) < 0.01
            const isVertical = Math.abs(x2 - x1) < 0.01

            if (isHorizontal) {
              const left = Math.min(x1, x2)
              const width = Math.abs(x2 - x1)
              return (
                <div
                  key={el.id}
                  style={{
                    position: "absolute",
                    left,
                    top: y1 - strokeWidth / 2,
                    width,
                    height: strokeWidth,
                    background: el.stroke ?? "#111",
                  }}
                />
              )
            }

            if (isVertical) {
              const top = Math.min(y1, y2)
              const height = Math.abs(y2 - y1)
              return (
                <div
                  key={el.id}
                  style={{
                    position: "absolute",
                    left: x1 - strokeWidth / 2,
                    top,
                    width: strokeWidth,
                    height,
                    background: el.stroke ?? "#111",
                  }}
                />
              )
            }

            // Fallback: treat as a 1px line.
            return null
          }

          if (el.type === "triangle") {
            const borderWidth = mmToPx(el.strokeWidthMm ?? 0, scale)
            return (
              <div
                key={el.id}
                style={{
                  ...elementStyle(el, scale),
                  background: el.fill ?? "transparent",
                  clipPath: CLIP_BY_CORNER[el.corner],
                  border:
                    el.stroke && (el.strokeWidthMm ?? 0) > 0
                      ? `${borderWidth}px solid ${el.stroke}`
                      : undefined,
                  boxSizing: "border-box",
                }}
              />
            )
          }

          if (el.type === "image") {
            return (
              <img
                key={el.id}
                alt={el.name}
                src={el.src}
                style={{
                  ...elementStyle(el, scale),
                  objectFit: el.fit ?? "cover",
                  transform: el.rotateDeg ? `rotate(${el.rotateDeg}deg)` : undefined,
                  transformOrigin: "top left",
                }}
              />
            )
          }

          if (el.type === "text") {
            const fontSizePx = mmToPx(el.fontSizeMm, scale)
            const letterSpacingPx = mmToPx(el.letterSpacingMm ?? 0, scale)
            const align = el.align ?? "left"
            const valign = el.valign ?? "top"
            const content = renderElementText(el.text, ticket)

            const justifyContent =
              valign === "top" ? "flex-start" : valign === "middle" ? "center" : "flex-end"

            return (
              <div
                key={el.id}
                style={{
                  ...elementStyle(el, scale),
                  color: el.color ?? "#111",
                  fontSize: fontSizePx,
                  fontWeight: el.fontWeight ?? 500,
                  letterSpacing: letterSpacingPx,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.15,
                  textAlign: align,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent,
                  alignItems: "stretch",
                  writingMode: el.writingMode === "vertical-rl" ? "vertical-rl" : undefined,
                  transform: el.rotateDeg ? `rotate(${el.rotateDeg}deg)` : undefined,
                  transformOrigin: "top left",
                  padding: 0,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                <div style={{ width: "100%" }}>{content}</div>
              </div>
            )
          }

          return null
        })}
    </div>
  )
}
