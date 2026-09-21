import { Database, FileSpreadsheet } from "lucide-react"
import { useCallback, useState } from "react"

import { PilotView } from "@/components/pilot/PilotView"
import { TaglessView } from "@/components/pilot/TaglessView"

type StudioSource = "lcmd" | "process-plan"

export function PilotStudioView({
  onWorkflowActiveChange,
  onRequestActiveChange,
}: {
  onWorkflowActiveChange?: (active: boolean) => void
  onRequestActiveChange?: (active: boolean) => void
}) {
  const [source, setSource] = useState<StudioSource>("lcmd")
  const [workflowActive, setWorkflowActive] = useState(false)
  const [requestActive, setRequestActive] = useState(true)

  const changeSource = (next: StudioSource) => {
    if (next === source) return
    if (requestActive) return
    if (
      workflowActive &&
      !window.confirm(
        "In diesem Quellweg gibt es noch einen laufenden oder vorbereiteten Stand. Quelle trotzdem wechseln und diesen Stand verwerfen?",
      )
    ) {
      return
    }
    setWorkflowActive(false)
    onWorkflowActiveChange?.(false)
    const nextRequestActive = next === "lcmd"
    setRequestActive(nextRequestActive)
    onRequestActiveChange?.(nextRequestActive)
    setSource(next)
  }

  const updateActive = useCallback(
    (active: boolean) => {
      setWorkflowActive(active)
      onWorkflowActiveChange?.(active)
    },
    [onWorkflowActiveChange],
  )

  const updateRequestActive = useCallback(
    (active: boolean) => {
      setRequestActive(active)
      onRequestActiveChange?.(active)
    },
    [onRequestActiveChange],
  )

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="brand-kicker text-xs font-semibold tracking-[0.18em] uppercase">Quelle</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Woher kommen die Karten?</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Waehlen Sie LCMD oder eine Excel-Datei. Eine begonnene Auswahl bleibt beim Wechsel nicht
          erhalten.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <button
            type="button"
            aria-pressed={source === "lcmd"}
            disabled={requestActive && source !== "lcmd"}
            className={`brand-source-card flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition ${source === "lcmd" ? "is-selected" : "border-slate-200 hover:bg-slate-50"}`}
            onClick={() => changeSource("lcmd")}
          >
            <Database className="brand-kicker mt-0.5 size-5 shrink-0" />
            <span>
              <strong className="block">LCMD mit Tags</strong>
              <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                Karten aus LCMD mit Tags fuer die gemeinsame Auswertung.
              </span>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={source === "process-plan"}
            disabled={requestActive && source !== "process-plan"}
            className={`brand-source-card flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition ${source === "process-plan" ? "is-selected" : "border-slate-200 hover:bg-slate-50"}`}
            onClick={() => changeSource("process-plan")}
          >
            <FileSpreadsheet className="brand-kicker mt-0.5 size-5 shrink-0" />
            <span>
              <strong className="block">Excel-Datei (XLSX) ohne Tags</strong>
              <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                Karten aus einer Excel-Datei, nur fuer den lokalen Ausdruck.
              </span>
            </span>
          </button>
        </div>
        {requestActive && (
          <p className="mt-3 text-xs font-medium text-amber-800" role="status">
            Quellenwechsel ist gesperrt, bis die laufende Aktion abgeschlossen ist.
          </p>
        )}
      </section>

      {source === "lcmd" ? (
        <PilotView
          key="lcmd"
          onWorkflowActiveChange={updateActive}
          onRequestActiveChange={updateRequestActive}
        />
      ) : (
        <TaglessView
          key="process-plan"
          onWorkflowActiveChange={updateActive}
          onRequestActiveChange={updateRequestActive}
        />
      )}
    </div>
  )
}
