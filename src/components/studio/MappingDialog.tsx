import { useMemo, useState } from "react"
import { SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStudioStore, type ProcessPlanDayMode } from "@/state/studio-store"
import type { ColumnMapping } from "@/lib/ticket-types"

function pickableHeaders(headers: string[]) {
  return ["(none)", ...headers]
}

function toKey(v: string) {
  return v === "(none)" ? "" : v
}

export function MappingDialog() {
  const table = useStudioStore((s) => s.importTable)
  const mapping = useStudioStore((s) => s.mapping)
  const processPlanDayMode = useStudioStore((s) => s.processPlanDayMode)
  const setProcessPlanDayMode = useStudioStore((s) => s.actions.setProcessPlanDayMode)
  const updateMapping = useStudioStore((s) => s.actions.updateMapping)

  const headers = useMemo(() => (table ? pickableHeaders(table.headers) : []), [table])

  const [draft, setDraft] = useState<ColumnMapping | null>(null)
  const active = draft ?? mapping

  const [open, setOpen] = useState(false)

  if (!table || !mapping || !active) {
    return (
      <Button variant="secondary" size="sm" disabled>
        <SlidersHorizontal className="size-4" />
        Columns
      </Button>
    )
  }

  const set = (key: keyof ColumnMapping, value: string) => {
    setDraft((prev) => {
      const base = prev ?? { ...mapping }
      const next = { ...base }
      next[key] = toKey(value) || undefined
      return next
    })
  }

  const fields: Array<{ key: keyof ColumnMapping; label: string }> = [
    { key: "company", label: "Company" },
    { key: "trade", label: "Trade" },
    { key: "taskName", label: "Task name" },
    { key: "taskId", label: "Task ID" },
    { key: "date", label: "Date" },
    { key: "status", label: "Status" },
    { key: "description", label: "Description" },
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) setDraft({ ...mapping })
        else setDraft(null)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <SlidersHorizontal className="size-4" />
          Columns
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Column Mapping</DialogTitle>
          <DialogDescription>
            Confirm how columns map to ticket fields. This is per import.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {table.sourceKind === "processPlan" ? (
            <div className="grid gap-2">
              <Label>Process Plan day tickets</Label>
              <Select
                value={processPlanDayMode}
                onValueChange={(v) => setProcessPlanDayMode(v as ProcessPlanDayMode)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (match Duration when possible)</SelectItem>
                  <SelectItem value="weekdays">Weekdays only</SelectItem>
                  <SelectItem value="all-days">All calendar days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-3">
            {fields.map((f) => (
              <div key={String(f.key)} className="grid gap-2">
                <Label>{f.label}</Label>
                <Select
                  value={active[f.key] ? active[f.key] : "(none)"}
                  onValueChange={(v) => set(f.key, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="(none)" />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              updateMapping(active)
              setOpen(false)
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
