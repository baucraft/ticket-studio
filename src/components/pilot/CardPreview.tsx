import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"

type PreviewFitMetrics = {
  clientHeight: number
  clientWidth: number
  scrollHeight: number
  scrollWidth: number
}

export const PREVIEW_FIT_STEPS = [
  { titlePx: 18, metaPx: 9, statusPx: 10, paddingX: 16, paddingY: 12, gapPx: 8 },
  { titlePx: 16, metaPx: 9, statusPx: 10, paddingX: 14, paddingY: 10, gapPx: 7 },
  { titlePx: 14, metaPx: 8.5, statusPx: 9, paddingX: 12, paddingY: 9, gapPx: 6 },
  { titlePx: 12, metaPx: 8, statusPx: 9, paddingX: 10, paddingY: 8, gapPx: 5 },
] as const

export function previewTextOverflows(metrics: PreviewFitMetrics) {
  return (
    metrics.scrollHeight > metrics.clientHeight + 1 || metrics.scrollWidth > metrics.clientWidth + 1
  )
}

export function nextPreviewFitStep(current: number, metrics: PreviewFitMetrics) {
  return previewTextOverflows(metrics)
    ? Math.min(current + 1, PREVIEW_FIT_STEPS.length - 1)
    : current
}

type CardPreviewProps = {
  title: string
  meta: string
  color: string
  completedBackground: string
  activeStatusColor?: string
  completedStatusColor?: string
  completedTitleClassName?: string
  completedMetaClassName?: string
  middle: ReactNode
  rotated: boolean
  ariaLabel: string
}

function MeasuredCardPreview({
  title,
  meta,
  color,
  completedBackground,
  activeStatusColor,
  completedStatusColor = "rgb(54 83 20)",
  completedTitleClassName = "text-slate-950",
  completedMetaClassName = "text-slate-700",
  middle,
  rotated,
  ariaLabel,
}: CardPreviewProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const observedWidth = useRef(0)
  const [fit, setFit] = useState({ step: 0, revision: 0, expanded: false, minHeight: 0 })
  const sizes = PREVIEW_FIT_STEPS[fit.step]!

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const next = nextPreviewFitStep(fit.step, card)
    const expand =
      next === fit.step &&
      fit.step === PREVIEW_FIT_STEPS.length - 1 &&
      !fit.expanded &&
      previewTextOverflows(card)
    if (next === fit.step && !expand) return
    const frame = requestAnimationFrame(() => {
      setFit((current) => ({
        ...current,
        step: next,
        expanded: current.expanded || expand,
        minHeight: expand ? card.clientHeight : current.minHeight,
      }))
    })
    return () => cancelAnimationFrame(frame)
  }, [fit])

  useEffect(() => {
    const card = cardRef.current
    if (!card || typeof ResizeObserver === "undefined") return
    let frame = 0
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? card.clientWidth
      if (Math.abs(width - observedWidth.current) < 0.5) return
      observedWidth.current = width
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setFit((current) => ({
          step: 0,
          revision: current.revision + 1,
          expanded: false,
          minHeight: 0,
        }))
      })
    })
    observer.observe(card)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  const end = (completed: boolean) => (
    <div
      className="grid min-h-0 border-t-8"
      data-card-status={completed ? "done" : "active"}
      style={{
        borderColor: color,
        background: completed ? completedBackground : `color-mix(in srgb, ${color} 10%, white)`,
        padding: `${sizes.paddingY}px ${sizes.paddingX}px`,
        transform: completed ? "rotate(180deg)" : undefined,
      }}
    >
      <span
        className="font-bold tracking-[0.14em] uppercase"
        style={{
          color: completed ? completedStatusColor : activeStatusColor,
          fontSize: `${sizes.statusPx}px`,
          lineHeight: 1.2,
        }}
      >
        {completed ? "Erledigt" : "Aktiv"}
      </span>
      <strong
        className={`break-words [overflow-wrap:anywhere] ${completed ? completedTitleClassName : "text-slate-950"}`}
        style={{
          fontSize: `${sizes.titlePx}px`,
          lineHeight: 1.2,
          marginTop: `${sizes.gapPx}px`,
        }}
      >
        {title}
      </strong>
      <span
        className={`mt-auto break-words [overflow-wrap:anywhere] ${completed ? completedMetaClassName : "text-slate-700"}`}
        style={{
          fontSize: `${sizes.metaPx}px`,
          lineHeight: 1.35,
          paddingTop: `${sizes.gapPx}px`,
        }}
      >
        {meta}
      </span>
    </div>
  )

  return (
    <div
      ref={cardRef}
      className={`grid overflow-hidden rounded-sm border border-slate-400 bg-white shadow-xl transition-transform duration-500 ${fit.expanded ? "" : "aspect-[66/120]"} ${rotated ? "rotate-180" : ""}`}
      style={{
        gridTemplateRows: fit.expanded
          ? "auto minmax(180px, 1fr) auto"
          : "minmax(27%, auto) minmax(0, 1fr) minmax(27%, auto)",
        minHeight: fit.expanded ? `${fit.minHeight}px` : undefined,
      }}
      aria-label={ariaLabel}
      data-preview-fit-step={fit.step}
      data-preview-expanded={fit.expanded ? "true" : "false"}
    >
      {end(false)}
      {middle}
      {end(true)}
    </div>
  )
}

export function CardPreview(props: CardPreviewProps) {
  return <MeasuredCardPreview key={`${props.title}\u0000${props.meta}`} {...props} />
}
