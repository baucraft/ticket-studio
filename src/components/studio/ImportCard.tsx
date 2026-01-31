import { useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { FileSpreadsheet, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useStudioStore } from "@/state/studio-store"

export function ImportCard() {
  const importXlsxFile = useStudioStore((s) => s.actions.importXlsxFile)
  const importing = useStudioStore((s) => s.importing)
  const importError = useStudioStore((s) => s.importError)
  const importTable = useStudioStore((s) => s.importTable)
  const ticketCount = useStudioStore((s) => s.tickets.length)

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
        <div>
          <div className="text-sm font-medium">Import</div>
          <div className="text-xs text-muted-foreground">Drag & drop an Excel export (.xlsx)</div>
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
                ? "Importing…"
                : isDragActive
                  ? "Drop to import"
                  : importTable
                    ? `${importTable.fileName}`
                    : "Drop your .xlsx here"}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {importTable
                ? `${ticketCount.toLocaleString()} tickets • detected ${importTable.sourceKind}`
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
