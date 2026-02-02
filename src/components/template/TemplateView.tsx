import { useCallback, useEffect, useRef } from "react"
import { useDropzone } from "react-dropzone"
import DOMPurify from "dompurify"
import svgPanZoom from "svg-pan-zoom"
import {
  AlertTriangle,
  Download,
  FileCode,
  Info,
  RotateCcw,
  Type,
  Upload,
  ZoomIn,
  ZoomOut,
  Maximize,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { DEFAULT_TOKENS } from "@/lib/default-template"
import { useStudioStore } from "@/state/studio-store"

export function TemplateView() {
  const template = useStudioStore((s) => s.template)
  const templateWarnings = useStudioStore((s) => s.templateWarnings)
  const importTemplateSvgFile = useStudioStore((s) => s.actions.importTemplateSvgFile)
  const resetTemplate = useStudioStore((s) => s.actions.resetTemplate)

  const containerRef = useRef<HTMLDivElement>(null)
  const panZoomRef = useRef<ReturnType<typeof svgPanZoom> | null>(null)

  // Handle file drop
  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0]
      if (!file) return
      void importTemplateSvgFile(file)
    },
    [importTemplateSvgFile],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      "image/svg+xml": [".svg"],
    },
    multiple: false,
    noKeyboard: true,
  })

  // Sanitize SVG for display
  const sanitizedSvg = DOMPurify.sanitize(template.svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
    ADD_ATTR: ["xlink:href", "href", "viewBox", "preserveAspectRatio"],
  })

  // Initialize svg-pan-zoom after SVG is rendered
  useEffect(() => {
    // Small delay to ensure SVG is in DOM
    const timer = setTimeout(() => {
      if (containerRef.current) {
        const svgElement = containerRef.current.querySelector("svg")
        if (svgElement) {
          // Clean up previous instance
          if (panZoomRef.current) {
            panZoomRef.current.destroy()
            panZoomRef.current = null
          }

          // Ensure SVG has proper attributes for scaling
          svgElement.setAttribute("width", "100%")
          svgElement.setAttribute("height", "100%")
          svgElement.style.maxWidth = "100%"
          svgElement.style.maxHeight = "100%"

          try {
            panZoomRef.current = svgPanZoom(svgElement, {
              zoomEnabled: true,
              controlIconsEnabled: false, // We'll use our own buttons
              fit: true,
              center: true,
              minZoom: 0.5,
              maxZoom: 10,
              zoomScaleSensitivity: 0.3,
            })
          } catch (e) {
            console.error("Failed to initialize svg-pan-zoom:", e)
          }
        }
      }
    }, 100)

    return () => {
      clearTimeout(timer)
      if (panZoomRef.current) {
        panZoomRef.current.destroy()
        panZoomRef.current = null
      }
    }
  }, [sanitizedSvg])

  const handleZoomIn = () => panZoomRef.current?.zoomIn()
  const handleZoomOut = () => panZoomRef.current?.zoomOut()
  const handleFit = () => {
    panZoomRef.current?.fit()
    panZoomRef.current?.center()
  }

  const handleReset = () => {
    resetTemplate()
  }

  const handleDownload = () => {
    const blob = new Blob([template.svg], { type: "image/svg+xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${template.name || "template"}.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid gap-3 md:h-full md:min-h-0 md:grid-cols-[280px_1fr]">
      {/* Left sidebar */}
      <Card className="p-3 md:flex md:h-full md:min-h-0 md:flex-col">
        <div>
          <div className="text-sm font-medium">Template</div>
          <div className="text-xs text-muted-foreground">
            Upload your SVG template with mustache tags
          </div>
        </div>

        <Separator className="my-3" />

        {/* Upload area */}
        <div className="grid gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-medium">Upload Template</div>
            <Button size="sm" variant="secondary" onClick={open} className="h-7 text-xs">
              <Upload className="size-3" />
              Choose
            </Button>
          </div>

          <div
            {...getRootProps()}
            className={
              "cursor-pointer rounded-lg border border-dashed p-3 transition-colors " +
              (isDragActive
                ? "border-primary/60 bg-primary/5"
                : "border-border/70 bg-muted/20 hover:bg-muted/30")
            }
          >
            <input {...getInputProps()} />
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-md bg-background shadow-sm">
                <FileCode className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">
                  {isDragActive ? "Drop to upload" : template.name || "Drop SVG here"}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {template.widthMm.toFixed(2)} x {template.heightMm.toFixed(2)} mm
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-3" />

        {/* Token reference */}
        <div className="grid gap-2">
          <div className="text-xs font-medium">Available Tokens</div>
          <div className="text-xs text-muted-foreground">
            Use these placeholders in your SVG. They will be replaced with ticket data.
          </div>

          <ScrollArea>
            <div className="grid gap-0.5 pr-3">
              {DEFAULT_TOKENS.map((t) => (
                <div
                  key={t.key}
                  className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/40"
                  title={t.hint}
                >
                  <Type className="mt-0.5 size-3 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{t.label}</span>
                      <code className="ml-auto rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]">
                        {`{{${t.key}}}`}
                      </code>
                    </div>
                    {t.hint && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground/70">{t.hint}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Action buttons */}
        <div className="mt-auto pt-3">
          <Separator className="mb-3" />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={handleDownload} className="flex-1">
              <Download className="size-4" />
              Download
            </Button>
            <Button size="sm" variant="ghost" onClick={handleReset} className="flex-1">
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Preview area */}
      <Card className="flex flex-col overflow-hidden md:h-full md:min-h-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-xs text-muted-foreground">
            Template Preview (pan: drag, zoom: scroll)
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={handleZoomOut} className="h-7 w-7 p-0">
              <ZoomOut className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleZoomIn} className="h-7 w-7 p-0">
              <ZoomIn className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleFit} className="h-7 w-7 p-0">
              <Maximize className="size-4" />
            </Button>
          </div>
        </div>

        {/* SVG Preview */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden bg-[repeating-conic-gradient(#f0f0f0_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px]"
          style={{ minHeight: "400px" }}
          dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
        />

        {/* Warnings */}
        {templateWarnings &&
          (templateWarnings.noMustacheTags || templateWarnings.unreasonableDimensions) && (
            <div className="border-t bg-amber-50 px-3 py-2">
              {templateWarnings.noMustacheTags && (
                <div className="flex items-start gap-2 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  <span>
                    No template tags ({`{{...}}`}) found. The template won't show dynamic ticket
                    data.
                  </span>
                </div>
              )}
              {templateWarnings.unreasonableDimensions && (
                <div className="flex items-start gap-2 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  <span>
                    Unusual dimensions ({template.widthMm.toFixed(1)} x{" "}
                    {template.heightMm.toFixed(1)} mm). Verify your SVG viewBox is in mm units.
                  </span>
                </div>
              )}
            </div>
          )}

        {/* Info */}
        <div className="flex items-center gap-2 border-t bg-muted/30 px-3 py-2">
          <Info className="size-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Create your template in an external SVG editor (e.g., Inkscape, Illustrator). Use
            mustache tags like {`{{taskName}}`} for dynamic content.
          </span>
        </div>
      </Card>
    </div>
  )
}
