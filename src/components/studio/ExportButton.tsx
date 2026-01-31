import { useState } from "react"
import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { exportTicketsPdfBytes } from "@/lib/export-pdf"
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

  return (
    <Button
      variant="default"
      size="sm"
      disabled={exporting || tickets.length === 0}
      onClick={async () => {
        setExporting(true)
        try {
          const bytes = await exportTicketsPdfBytes({ tickets, template })
          const base = importTable?.fileName
            ? importTable.fileName.replace(/\.[^.]+$/, "")
            : "tickets"
          downloadBytes(bytes, `${base}.pdf`)
        } finally {
          setExporting(false)
        }
      }}
    >
      <Download className="size-4" />
      {exporting ? "Exporting…" : "Export PDF"}
    </Button>
  )
}
