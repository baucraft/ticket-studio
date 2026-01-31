import { Copy, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { TicketCanvas } from "@/components/ticket/TicketCanvas"
import { useSelectedTicket, useStudioStore } from "@/state/studio-store"

function Field(props: { label: string; value?: string; mono?: boolean }) {
  const { label, value, mono } = props

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="max-w-[65%] text-right text-xs font-medium">
        {value ? (
          <span className={mono ? "font-mono" : undefined}>{value}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  )
}

export function TicketPreview() {
  const ticket = useSelectedTicket()
  const template = useStudioStore((s) => s.template)

  const previewFlipped = useStudioStore((s) => s.previewFlipped)
  const setPreviewFlipped = useStudioStore((s) => s.actions.setPreviewFlipped)
  const showTemplateReference = useStudioStore((s) => s.showTemplateReference)
  const setShowTemplateReference = useStudioStore((s) => s.actions.setShowTemplateReference)

  return (
    <div className="flex h-full flex-col gap-3">
      <Card className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Preview</div>
            <div className="text-xs text-muted-foreground">
              {ticket ? ticket.ticketId : "Select a ticket"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!ticket}
              onClick={() => {
                if (!ticket) return
                void navigator.clipboard.writeText(ticket.ticketId)
              }}
            >
              <Copy className="size-4" />
              Copy ID
            </Button>
          </div>
        </div>

        <div className="mt-3 rounded-lg border bg-muted/10 p-3">
          <div className="flex justify-center">
            <TicketCanvas
              template={template}
              ticket={ticket ?? undefined}
              scale={0.9}
              flipped={previewFlipped}
              showReferenceImage={showTemplateReference}
              className="shadow-sm"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="grid gap-2 rounded-md border bg-background px-3 py-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Flip preview</Label>
              <Switch checked={previewFlipped} onCheckedChange={setPreviewFlipped} />
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="justify-start"
              onClick={() => setPreviewFlipped(!previewFlipped)}
            >
              <RotateCcw className="size-4" />
              Rotate 180°
            </Button>
          </div>

          <div className="grid gap-2 rounded-md border bg-background px-3 py-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Show layout ref</Label>
              <Switch checked={showTemplateReference} onCheckedChange={setShowTemplateReference} />
            </div>
            <div className="text-xs text-muted-foreground">
              Overlay the PDF raster for alignment.
            </div>
          </div>
        </div>
      </Card>

      <Card className="flex-1 p-3">
        <div className="text-sm font-medium">Details</div>
        <div className="mt-3 grid gap-2">
          <Field label="Task" value={ticket?.taskName} />
          <Field label="Task ID" value={ticket?.taskId} mono />
          <Field label="Date" value={ticket?.date} />
          <Field label="Status" value={ticket?.status} />
          <Field label="Company" value={ticket?.company} />
          <Field label="Trade" value={ticket?.trade} />
        </div>

        {ticket?.description ? (
          <>
            <Separator className="my-3" />
            <div className="text-xs text-muted-foreground">Description</div>
            <div className="mt-1 whitespace-pre-wrap text-xs">{ticket.description}</div>
          </>
        ) : null}
      </Card>
    </div>
  )
}
