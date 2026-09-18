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
        <p className="text-xs font-semibold tracking-[0.18em] text-teal-700 uppercase">
          Kartenquelle
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Ein Studio, zwei getrennte Wege
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Die Quelle bestimmt Identitaet, Druckvertrag und Folgeschritte. Beim Wechsel werden lokale
          Auswahl und vorbereitete Druckauftraege nicht uebernommen.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <button
            type="button"
            aria-pressed={source === "lcmd"}
            disabled={requestActive && source !== "lcmd"}
            className={`flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition ${source === "lcmd" ? "border-teal-600 bg-teal-50 ring-2 ring-teal-100" : "border-slate-200 hover:bg-slate-50"}`}
            onClick={() => changeSource("lcmd")}
          >
            <Database className="mt-0.5 size-5 shrink-0 text-teal-700" />
            <span>
              <strong className="block">LCMD mit Tags</strong>
              <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                Pilot-Login, Backend-IDs, Manifestbindung, Tagvergabe und Analyzer-Erwartungsmenge.
              </span>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={source === "process-plan"}
            disabled={requestActive && source !== "process-plan"}
            className={`flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition ${source === "process-plan" ? "border-sky-600 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 hover:bg-slate-50"}`}
            onClick={() => changeSource("process-plan")}
          >
            <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-sky-700" />
            <span>
              <strong className="block">Prozessplan-XLSX ohne Tags</strong>
              <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                Rein lokale Koordinationskarten ohne Codes, Tag-IDs, Manifest oder Analyzerbindung.
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
