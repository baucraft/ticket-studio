import { useState } from "react"
import { Download, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { exportTicketsPdfBytes, type ExportProgress } from "@/lib/export-pdf"
import { useStudioStore } from "@/state/studio-store"

function downloadBytes(bytes: Uint8Array, fileName: string) {
  // Ensure the Blob is backed by a non-shared ArrayBuffer.
  const safeBytes = new Uint8Array(bytes)
  const blob = new Blob([safeBytes], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function ExportButton() {
  const template = useStudioStore((s) => s.template)
  const tickets = useStudioStore((s) => s.tickets)
  const importTable = useStudioStore((s) => s.importTable)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<ExportProgress | null>(null)

  const handleExport = async () => {
    setExporting(true)
    setProgress({ current: 0, total: tickets.length, percent: 0 })
    try {
      const bytes = await exportTicketsPdfBytes({
        tickets,
        template,
        onProgress: setProgress,
      })
      const base = importTable?.fileName ? importTable.fileName.replace(/\.[^.]+$/, "") : "tickets"
      downloadBytes(bytes, `${base}.pdf`)
    } finally {
      setExporting(false)
      setProgress(null)
    }
  }

  if (exporting && progress) {
    return (
      <Button variant="default" size="sm" disabled className="min-w-[140px]">
        <Loader2 className="size-4 animate-spin" />
        <span className="tabular-nums">{progress.percent}%</span>
        <span className="text-xs opacity-70">
          ({progress.current}/{progress.total})
        </span>
      </Button>
    )
  }

  return (
    <Button variant="default" size="sm" disabled={tickets.length === 0} onClick={handleExport}>
      <Download className="size-4" />
      Export PDF
    </Button>
  )
}
