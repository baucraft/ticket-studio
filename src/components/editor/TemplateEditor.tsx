import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw, Save, Type } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { DEFAULT_TOKENS } from "@/lib/default-template"
import { useStudioStore } from "@/state/studio-store"

export function TemplateEditor() {
  const template = useStudioStore((s) => s.template)
  const resetTemplate = useStudioStore((s) => s.actions.resetTemplate)
  const updateTemplateSvg = useStudioStore((s) => s.actions.updateTemplateSvg)

  const showReference = useStudioStore((s) => s.showTemplateReference)
  const setShowReference = useStudioStore((s) => s.actions.setShowTemplateReference)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [editorReady, setEditorReady] = useState(false)
  const [svgLoaded, setSvgLoaded] = useState(false)
  const initialLoadRef = useRef(false)

  // Handle messages from the iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const { type, payload } = event.data || {}

      if (type === "editorReady") {
        setEditorReady(true)
      }

      if (type === "svgLoaded") {
        setSvgLoaded(true)
      }

      if (type === "svgChanged" && payload?.svg) {
        // Auto-save on change
        updateTemplateSvg(payload.svg)
      }

      if (type === "svgData" && payload?.svg) {
        updateTemplateSvg(payload.svg)
      }
    },
    [updateTemplateSvg],
  )

  useEffect(() => {
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [handleMessage])

  // Load SVG into the editor when ready
  useEffect(() => {
    if (editorReady && !initialLoadRef.current && template.svg) {
      initialLoadRef.current = true
      iframeRef.current?.contentWindow?.postMessage(
        { type: "loadSvg", payload: { svg: template.svg } },
        "*",
      )
    }
  }, [editorReady, template.svg])

  const handleSave = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: "getSvg" }, "*")
  }

  const handleReset = () => {
    resetTemplate()
    // Reload the editor with the default template
    initialLoadRef.current = false
    setSvgLoaded(false)
    setEditorReady(false)
    // Force iframe reload
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src
    }
  }

  const handleInsertToken = (token: string) => {
    // For now, show a helper message. In the future, we could use
    // postMessage to insert text at cursor position.
    alert(`To insert "${token}", add {{${token}}} to a text element in the editor.`)
  }

  return (
    <div className="grid gap-3 md:h-full md:min-h-0 md:grid-cols-[280px_1fr]">
      {/* Left sidebar */}
      <Card className="p-3 md:flex md:h-full md:min-h-0 md:flex-col">
        <div>
          <div className="text-sm font-medium">Template Editor</div>
          <div className="text-xs text-muted-foreground">
            {editorReady ? (svgLoaded ? "Ready" : "Loading SVG...") : "Initializing editor..."}
          </div>
        </div>

        <Separator className="my-3" />

        <div className="grid gap-3">
          <div className="text-xs font-medium">Template Tokens</div>
          <div className="text-xs text-muted-foreground">
            Use these placeholders in text elements. They will be replaced with ticket data.
          </div>

          <ScrollArea className="max-h-[40vh]">
            <div className="grid gap-1">
              {DEFAULT_TOKENS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/40"
                  onClick={() => handleInsertToken(t.key)}
                >
                  <Type className="size-3 text-muted-foreground" />
                  <span className="font-medium">{t.label}</span>
                  <span className="ml-auto font-mono text-muted-foreground">{`{{${t.key}}}`}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <Separator className="my-3" />

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Show layout reference</Label>
            <Switch checked={showReference} onCheckedChange={setShowReference} />
          </div>
          <div className="text-xs text-muted-foreground">
            Overlay reference image in preview (does not affect export).
          </div>
        </div>

        <div className="mt-auto pt-3">
          <Separator className="mb-3" />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={handleSave} disabled={!editorReady}>
              <Save className="size-4" />
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={handleReset}>
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* SVG-Edit iframe */}
      <Card className="overflow-hidden md:h-full md:min-h-0">
        <iframe
          ref={iframeRef}
          src="/svgedit/ticket-editor.html"
          title="SVG Template Editor"
          className="h-full w-full border-0"
          style={{ minHeight: "600px" }}
        />
      </Card>
    </div>
  )
}
