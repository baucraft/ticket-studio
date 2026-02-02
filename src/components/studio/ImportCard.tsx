import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { FileSpreadsheet, Info, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useStudioStore } from "@/state/studio-store"
import type { ImportSourceKind } from "@/lib/ticket-types"

/** Human-readable format names for display */
function formatSourceKind(kind: ImportSourceKind): string {
  switch (kind) {
    case "processPlan":
      return "Process Plan"
    case "planCards":
      return "Plan Cards"
    default:
      return "Unknown"
  }
}

export function ImportCard() {
  const importXlsxFile = useStudioStore((s) => s.actions.importXlsxFile)
  const importing = useStudioStore((s) => s.importing)
  const importError = useStudioStore((s) => s.importError)
  const importTable = useStudioStore((s) => s.importTable)
  const ticketCount = useStudioStore((s) => s.tickets.length)

  const [infoOpen, setInfoOpen] = useState(false)

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0]
      if (!file) return
      void importXlsxFile(file)
    },
    [importXlsxFile],
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    multiple: false,
    noKeyboard: true,
  })

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div>
            <div className="text-sm font-medium">Import</div>
            <div className="text-xs text-muted-foreground">Drag & drop an Excel export (.xlsx)</div>
          </div>
          <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="mt-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Format information"
              >
                <Info className="size-3.5" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Supported Excel Formats</DialogTitle>
                <DialogDescription>
                  Ticket Studio automatically detects the following export formats:
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="font-semibold">Plan Cards (Plankarten)</h4>
                  <p className="mt-1 text-muted-foreground">
                    Daily task cards with a single date per row. Each row represents one ticket.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium">Key columns:</span> Datum, Aufgabe, Prozess ID,
                    Gewerk, Status
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold">Process Plan (Prozessplan)</h4>
                  <p className="mt-1 text-muted-foreground">
                    Tasks with date ranges (start/end). Each row is expanded into multiple daily
                    tickets based on the duration.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-medium">Key columns:</span> Startdatum, Enddatum, Dauer,
                    Prozessname, Gewerk
                  </p>
                </div>
                <div className="rounded-md border border-border/50 bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Tip:</span> Export these formats from your
                    scheduling software (e.g., Lean Construction tools). The column mapping can be
                    adjusted after import using the &quot;Columns&quot; button.
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={open}
          disabled={importing}
          className="shrink-0"
        >
          <Upload className="size-4" />
          Choose
        </Button>
      </div>

      <div
        {...getRootProps()}
        className={
          "mt-3 rounded-lg border border-dashed p-4 transition-colors " +
          (isDragActive
            ? "border-primary/60 bg-primary/5"
            : "border-border/70 bg-muted/20 hover:bg-muted/30")
        }
      >
        <input {...getInputProps()} />
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-background shadow-sm">
            <FileSpreadsheet className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm">
              {importing
                ? "Importing..."
                : isDragActive
                  ? "Drop to import"
                  : importTable
                    ? `${importTable.fileName}`
                    : "Drop your .xlsx here"}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {importTable
                ? `${ticketCount.toLocaleString()} tickets \u2022 ${formatSourceKind(importTable.sourceKind)}`
                : "We never upload your file"}
            </div>
          </div>
        </div>
      </div>

      {importError ? (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {importError}
        </div>
      ) : null}
    </Card>
  )
}
