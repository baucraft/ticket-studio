import { useState } from "react"
import { Download, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { HausmesseDemoPackage } from "@/lib/hausmesse-demo-package"

type PackageKey = keyof HausmesseDemoPackage

const EXPORTS: Array<{ key: PackageKey; label: string; mime: string; fileName: string }> = [
  {
    key: "plan",
    label: "Demo Plan",
    mime: "application/json",
    fileName: "hausmesse-demo-v1-plan.json",
  },
  {
    key: "pdf",
    label: "Card pages",
    mime: "application/pdf",
    fileName: "hausmesse-demo-v1-cards.pdf",
  },
  {
    key: "printPdf",
    label: "Print A4",
    mime: "application/pdf",
    fileName: "hausmesse-demo-v1-print-a4.pdf",
  },
  {
    key: "manifest",
    label: "Manifest JSON",
    mime: "application/json",
    fileName: "hausmesse-demo-v1-manifest.json",
  },
  {
    key: "csv",
    label: "Manifest CSV",
    mime: "text/csv",
    fileName: "hausmesse-demo-v1-manifest.csv",
  },
  {
    key: "checksums",
    label: "Checksums",
    mime: "text/plain",
    fileName: "SHA256SUMS",
  },
]

function downloadBytes(bytes: Uint8Array, fileName: string, mime: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export function DemoExportButtons() {
  const [exporting, setExporting] = useState<PackageKey | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const exportFile = async (item: (typeof EXPORTS)[number]) => {
    setExporting(item.key)
    setExportError(null)
    try {
      const { createHausmesseDemoPackage } = await import("@/lib/hausmesse-demo-package")
      const demoPackage = await createHausmesseDemoPackage()
      downloadBytes(demoPackage[item.key], item.fileName, item.mime)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Demo export failed")
    } finally {
      setExporting(null)
    }
  }

  return (
    <>
      {EXPORTS.map((item) => (
        <Button
          key={item.key}
          variant={item.key === "printPdf" ? "default" : "secondary"}
          size="sm"
          disabled={exporting !== null}
          onClick={() => void exportFile(item)}
        >
          {exporting === item.key ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {item.label}
        </Button>
      ))}
      {exportError ? (
        <p role="alert" className="w-full text-xs text-destructive">
          Export failed: {exportError}. Please retry.
        </p>
      ) : null}
    </>
  )
}
