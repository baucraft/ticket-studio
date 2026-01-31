import { useMemo, useRef, useState } from "react"
import Moveable from "react-moveable"
import { BoxSelect, EyeOff, Image, MousePointer2, Plus, RotateCcw, Type } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DEFAULT_TOKENS } from "@/lib/default-template"
import type { TemplateElement } from "@/lib/template-types"
import { mmToPx, pxToMm } from "@/lib/units"
import { useStudioStore } from "@/state/studio-store"

const CLIP_BY_CORNER: Record<string, string> = {
  br: "polygon(100% 0%, 100% 100%, 0% 100%)",
  bl: "polygon(0% 0%, 100% 100%, 0% 100%)",
  tr: "polygon(0% 0%, 100% 0%, 100% 100%)",
  tl: "polygon(0% 0%, 100% 0%, 0% 100%)",
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function TemplateEditor() {
  const template = useStudioStore((s) => s.template)
  const resetTemplate = useStudioStore((s) => s.actions.resetTemplate)
  const updateTemplateElement = useStudioStore((s) => s.actions.updateTemplateElement)
  const addTemplateElement = useStudioStore((s) => s.actions.addTemplateElement)
  const removeTemplateElement = useStudioStore((s) => s.actions.removeTemplateElement)

  const showReference = useStudioStore((s) => s.showTemplateReference)
  const setShowReference = useStudioStore((s) => s.actions.setShowTemplateReference)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const imagePickerRef = useRef<HTMLInputElement | null>(null)
  const moveableRef = useRef<InstanceType<typeof Moveable> | null>(null)
  const rafRef = useRef<number | null>(null)

  const selected = useMemo(
    () => (selectedId ? (template.elements.find((e) => e.id === selectedId) ?? null) : null),
    [template.elements, selectedId],
  )

  const scale = 2.0 // editor scale for comfortable editing
  const stageWidth = mmToPx(template.widthMm, scale)
  const stageHeight = mmToPx(template.heightMm, scale)

  const locked = selected ? Boolean(selected.locked) : false

  const scheduleMoveableUpdate = () => {
    if (!moveableRef.current) return
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      moveableRef.current?.updateRect()
    })
  }

  return (
    <div className="grid gap-3 md:h-full md:min-h-0 md:grid-cols-[280px_1fr_320px]">
      <Card className="p-3 md:flex md:h-full md:min-h-0 md:flex-col">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Layers</div>
            <div className="text-xs text-muted-foreground">{template.elements.length} elements</div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary">
                <Plus className="size-4" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  addTemplateElement({
                    id: newId("text"),
                    name: "Text",
                    type: "text",
                    xMm: 15,
                    yMm: 15,
                    wMm: 35,
                    hMm: 8,
                    text: "New text",
                    fontSizeMm: 4,
                    fontWeight: 600,
                    color: "#111111",
                    align: "left",
                    valign: "top",
                  })
                }}
              >
                <Type className="mr-2 size-4" />
                Text
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  addTemplateElement({
                    id: newId("rect"),
                    name: "Rectangle",
                    type: "rect",
                    xMm: 15,
                    yMm: 40,
                    wMm: 20,
                    hMm: 10,
                    fill: "transparent",
                    stroke: "#111111",
                    strokeWidthMm: 0.4,
                  })
                }}
              >
                <BoxSelect className="mr-2 size-4" />
                Rectangle
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  imagePickerRef.current?.click()
                }}
              >
                <Image className="mr-2 size-4" />
                Image…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <input
          ref={imagePickerRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              const src = typeof reader.result === "string" ? reader.result : null
              if (!src) return
              addTemplateElement({
                id: newId("image"),
                name: "Image",
                type: "image",
                xMm: 6,
                yMm: 6,
                wMm: 10,
                hMm: 10,
                src,
                fit: "contain",
              })
            }
            reader.readAsDataURL(file)
            e.target.value = ""
          }}
        />

        <Separator className="my-3" />

        <ScrollArea className="max-h-[55svh] md:max-h-none md:min-h-0 md:flex-1">
          <div className="grid gap-1">
            {template.elements.map((el) => {
              const active = el.id === selectedId
              return (
                <button
                  key={el.id}
                  type="button"
                  className={
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors " +
                    (active ? "bg-primary/10 text-primary" : "hover:bg-muted/40")
                  }
                  onClick={() => setSelectedId(el.id)}
                >
                  <div className="min-w-0 truncate">
                    {el.type === "text" ? <Type className="mr-2 inline size-4" /> : null}
                    {el.type !== "text" ? <BoxSelect className="mr-2 inline size-4" /> : null}
                    {el.name}
                  </div>
                  <div className="flex items-center gap-1">
                    {el.hidden ? <EyeOff className="size-4 text-muted-foreground" /> : null}
                    {el.locked ? <MousePointer2 className="size-4 text-muted-foreground" /> : null}
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>

        <Separator className="my-3" />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Show layout ref</Label>
            <Switch checked={showReference} onCheckedChange={setShowReference} />
          </div>
          <Button size="sm" variant="ghost" onClick={resetTemplate}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
        </div>
      </Card>

      <Card className="p-3 md:flex md:h-full md:min-h-0 md:flex-col">
        <div className="text-sm font-medium">Canvas</div>
        <div className="text-xs text-muted-foreground">
          Drag to position, resize handles to adjust.
        </div>

        <div className="mt-3 flex min-h-0 flex-1 justify-center overflow-auto rounded-md bg-muted/20 p-4">
          <div
            ref={stageRef}
            className="relative rounded-md bg-white shadow-sm"
            style={{ width: stageWidth, height: stageHeight }}
            onMouseDown={(e) => {
              if (e.target === stageRef.current) setSelectedId(null)
            }}
          >
            {showReference ? (
              <img
                alt="ticket reference"
                src={new URL("../../assets/ticket-blank.png", import.meta.url).toString()}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  opacity: 0.35,
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              />
            ) : null}

            {template.elements
              .filter((el) => !el.hidden)
              .map((el) => (
                <EditorElement
                  key={el.id}
                  el={el}
                  scale={scale}
                  selected={el.id === selectedId}
                  onSelect={() => {
                    setSelectedId(el.id)
                    scheduleMoveableUpdate()
                  }}
                />
              ))}

            {selected && selected.type !== "line" ? (
              <Moveable
                ref={moveableRef}
                target={`[data-el-id="${selected.id}"]`}
                origin={false}
                draggable={!locked}
                resizable={!locked}
                snappable
                snapThreshold={5}
                bounds={{
                  left: 0,
                  top: 0,
                  right: stageWidth,
                  bottom: stageHeight,
                }}
                onDrag={({ left, top }) => {
                  updateTemplateElement(selected.id, {
                    xMm: pxToMm(left, scale),
                    yMm: pxToMm(top, scale),
                  })
                }}
                onResize={({ width, height, drag }) => {
                  updateTemplateElement(selected.id, {
                    wMm: pxToMm(width, scale),
                    hMm: pxToMm(height, scale),
                    xMm: pxToMm(drag.left, scale),
                    yMm: pxToMm(drag.top, scale),
                  })
                }}
                onDragEnd={scheduleMoveableUpdate}
                onResizeEnd={scheduleMoveableUpdate}
              />
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-3 md:flex md:h-full md:min-h-0 md:flex-col">
        <div className="text-sm font-medium">Inspector</div>
        <div className="text-xs text-muted-foreground">
          {selected ? `${selected.name} • ${selected.type}` : "Select an element"}
        </div>

        <Separator className="my-3" />

        <ScrollArea className="max-h-[55svh] md:max-h-none md:min-h-0 md:flex-1">
          <div className="pr-3">
            {!selected ? (
              <div className="text-xs text-muted-foreground">
                Click an element to edit its properties.
              </div>
            ) : selected.type === "line" ? (
              <div className="text-xs text-muted-foreground">
                Line elements are currently locked in the editor.
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="X (mm)"
                    value={"xMm" in selected ? selected.xMm : 0}
                    onChange={(v) => updateTemplateElement(selected.id, { xMm: v })}
                  />
                  <Field
                    label="Y (mm)"
                    value={"yMm" in selected ? selected.yMm : 0}
                    onChange={(v) => updateTemplateElement(selected.id, { yMm: v })}
                  />
                  {"wMm" in selected ? (
                    <Field
                      label="W (mm)"
                      value={selected.wMm}
                      onChange={(v) => updateTemplateElement(selected.id, { wMm: v })}
                    />
                  ) : null}
                  {"hMm" in selected ? (
                    <Field
                      label="H (mm)"
                      value={selected.hMm}
                      onChange={(v) => updateTemplateElement(selected.id, { hMm: v })}
                    />
                  ) : null}
                </div>

                {selected.type === "text" ? (
                  <>
                    <div className="grid gap-2">
                      <Label>Text</Label>
                      <Textarea
                        value={selected.text}
                        rows={4}
                        onChange={(e) =>
                          updateTemplateElement(selected.id, { text: e.target.value })
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        {DEFAULT_TOKENS.map((t) => (
                          <Button
                            key={t.key}
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              updateTemplateElement(selected.id, {
                                text: `${selected.text} {{${t.key}}}`,
                              })
                            }
                          >
                            {t.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field
                        label="Font (mm)"
                        value={selected.fontSizeMm}
                        onChange={(v) => updateTemplateElement(selected.id, { fontSizeMm: v })}
                      />
                      <TextField
                        label="Color"
                        value={selected.color ?? "#111111"}
                        onChange={(v) => updateTemplateElement(selected.id, { color: v })}
                      />
                    </div>
                  </>
                ) : null}

                {selected.type === "rect" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <TextField
                      label="Fill"
                      value={selected.fill ?? "transparent"}
                      onChange={(v) => updateTemplateElement(selected.id, { fill: v })}
                    />
                    <TextField
                      label="Stroke"
                      value={selected.stroke ?? "transparent"}
                      onChange={(v) => updateTemplateElement(selected.id, { stroke: v })}
                    />
                  </div>
                ) : null}

                {selected.type === "triangle" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <TextField
                      label="Fill"
                      value={selected.fill ?? "transparent"}
                      onChange={(v) => updateTemplateElement(selected.id, { fill: v })}
                    />
                    <TextField
                      label="Corner"
                      value={selected.corner}
                      onChange={(v) => {
                        if (v === "br" || v === "bl" || v === "tr" || v === "tl") {
                          updateTemplateElement(selected.id, { corner: v })
                        }
                      }}
                    />
                  </div>
                ) : null}

                {selected.type === "image" ? (
                  <div className="grid gap-2">
                    <Label>Source</Label>
                    <Input
                      value={selected.src}
                      onChange={(e) => updateTemplateElement(selected.id, { src: e.target.value })}
                    />
                    <div className="text-xs text-muted-foreground">
                      Tip: use a small logo (or paste a URL). Data URLs are stored in local storage.
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Hidden</Label>
                    <Switch
                      checked={Boolean(selected.hidden)}
                      onCheckedChange={(v) => updateTemplateElement(selected.id, { hidden: v })}
                    />
                  </div>

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      removeTemplateElement(selected.id)
                      setSelectedId(null)
                    }}
                    disabled={Boolean(selected.locked)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  )
}

function Field(props: { label: string; value: number; onChange: (next: number) => void }) {
  const { label, value, onChange } = props

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        inputMode="decimal"
        value={Number.isFinite(value) ? String(Math.round(value * 100) / 100) : ""}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isFinite(n)) return
          onChange(n)
        }}
      />
    </div>
  )
}

function TextField(props: { label: string; value: string; onChange: (next: string) => void }) {
  const { label, value, onChange } = props
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function EditorElement(props: {
  el: TemplateElement
  scale: number
  selected: boolean
  onSelect: () => void
}) {
  const { el, scale, selected, onSelect } = props
  const baseStyle: React.CSSProperties = isBoxElement(el)
    ? {
        position: "absolute",
        left: mmToPx(el.xMm, scale),
        top: mmToPx(el.yMm, scale),
        width: mmToPx(el.wMm, scale),
        height: mmToPx(el.hMm, scale),
      }
    : { position: "absolute" }

  if (el.type === "rect") {
    const strokeW = mmToPx(el.strokeWidthMm ?? 0, scale)
    return (
      <div
        data-el-id={el.id}
        role="button"
        tabIndex={0}
        onMouseDown={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        style={{
          ...baseStyle,
          background: el.fill ?? "transparent",
          border:
            el.stroke && (el.strokeWidthMm ?? 0) > 0
              ? `${strokeW}px solid ${el.stroke}`
              : undefined,
          boxSizing: "border-box",
          outline: selected ? undefined : "1px dashed rgba(17,17,17,0.25)",
          outlineOffset: 1,
          cursor: el.locked ? "default" : "move",
        }}
      />
    )
  }

  if (el.type === "triangle") {
    return (
      <div
        data-el-id={el.id}
        role="button"
        tabIndex={0}
        onMouseDown={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        style={{
          ...baseStyle,
          background: el.fill ?? "transparent",
          clipPath: CLIP_BY_CORNER[el.corner],
          outline: selected ? undefined : "1px dashed rgba(17,17,17,0.25)",
          outlineOffset: 1,
          cursor: el.locked ? "default" : "move",
        }}
      />
    )
  }

  if (el.type === "text") {
    const fontSizePx = mmToPx(el.fontSizeMm, scale)
    return (
      <div
        data-el-id={el.id}
        role="button"
        tabIndex={0}
        onMouseDown={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        style={{
          ...baseStyle,
          color: el.color ?? "#111111",
          fontSize: fontSizePx,
          fontWeight: el.fontWeight ?? 500,
          whiteSpace: "pre-wrap",
          lineHeight: 1.15,
          textAlign: el.align ?? "left",
          writingMode: el.writingMode === "vertical-rl" ? "vertical-rl" : undefined,
          outline: selected ? undefined : "1px dashed rgba(17,17,17,0.25)",
          outlineOffset: 1,
          cursor: el.locked ? "default" : "move",
          padding: 0,
        }}
      >
        {el.text}
      </div>
    )
  }

  if (el.type === "image") {
    return (
      <img
        data-el-id={el.id}
        alt={el.name}
        src={el.src}
        onMouseDown={(e) => {
          e.stopPropagation()
          onSelect()
        }}
        style={{
          ...baseStyle,
          objectFit: el.fit ?? "cover",
          outline: selected ? undefined : "1px dashed rgba(17,17,17,0.25)",
          outlineOffset: 1,
          cursor: el.locked ? "default" : "move",
        }}
      />
    )
  }

  // line is not editable here.
  return null
}

function isBoxElement(el: TemplateElement): el is Exclude<TemplateElement, { type: "line" }> {
  return el.type === "rect" || el.type === "text" || el.type === "triangle" || el.type === "image"
}
