import {
  AlertTriangle,
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleDot,
  LoaderCircle,
  RotateCw,
  Rows3,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  filterTagOnlyActivities,
  TAG_ONLY_FIXTURE,
  type TagOnlyActivity,
  type TagOnlyFilters,
  validateTagOnlyFixture,
} from "@/lib/tag-only-target"

const EMPTY_FILTERS: TagOnlyFilters = { company: "", trade: "", area: "", week: "" }

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-slate-600">
      {label}
      <div className="relative">
        <select
          className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-3 focus:ring-sky-100"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Alle</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-3 right-3 size-4 text-slate-400" />
      </div>
    </label>
  )
}

function TagCard({ activity, done }: { activity: TagOnlyActivity; done: boolean }) {
  const knownVector = activity.activeTagId === 0 && activity.doneTagId === 1
  return (
    <div className="mx-auto w-full max-w-[430px]">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>Schemaansicht 120 x 66 mm</span>
        <span className="font-mono">Massstab Bildschirm: variabel</span>
      </div>
      <div
        className={`tag-only-card ${done ? "rotate-180" : ""}`}
        aria-label={done ? "Karte in Erledigt-Orientierung" : "Karte in Aktiv-Orientierung"}
      >
        <div className="tag-only-card__visible">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-sky-700 uppercase">
              {activity.trade} / {activity.week}
            </div>
            <div className="mt-2 text-lg leading-tight font-semibold text-slate-950">
              {activity.shortTarget}
            </div>
            <div className="mt-2 truncate text-[10px] text-slate-500">
              Firma (Mock): {activity.company}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            {knownVector ? (
              <img
                src={`${import.meta.env.BASE_URL}ana09c4/${done ? "tagCircle49h12_id00001_card_done_18mm.svg" : "tagCircle49h12_id00000_card_active_18mm.svg"}`}
                className="size-[82px]"
                alt={`Offizieller ANA-09C4-Vektor, tagCircle49h12 ID ${done ? 1 : 0}`}
              />
            ) : (
              <div className="flex size-[82px] items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-slate-50 p-2 text-center text-[9px] leading-tight text-slate-500">
                Markerbild nicht Bestandteil dieses Fixtures
              </div>
            )}
            <span className="font-mono text-[10px] font-semibold">
              ID {done ? activity.doneTagId : activity.activeTagId}
            </span>
          </div>
        </div>
        <div className="border-y border-dashed border-slate-300 bg-amber-50 px-5 py-3 text-[11px] font-medium text-slate-700">
          {activity.deviation}
        </div>
        <div className="tag-only-card__drawer">
          <div className="flex items-center justify-between gap-3 text-[9px] tracking-[0.12em] text-slate-400 uppercase">
            <span>Herausziehbereich / volles Soll</span>
            <ArrowDownToLine className="size-3.5" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">{activity.fullTarget}</p>
          <div className="mt-auto flex items-end justify-between gap-3 pt-4 text-[9px] text-slate-400">
            <span className="font-mono">{activity.sourceActivityId}</span>
            <span>Konzept, kein Druckexport</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TagOnlyTargetView() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState("")
  const [projectId, setProjectId] = useState(TAG_ONLY_FIXTURE.projects[0].sourceProjectId)
  const [boardId, setBoardId] = useState(TAG_ONLY_FIXTURE.boards[0].id)
  const [filters, setFilters] = useState<TagOnlyFilters>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewId, setPreviewId] = useState(TAG_ONLY_FIXTURE.activities[0].sourceActivityId)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        validateTagOnlyFixture(TAG_ONLY_FIXTURE)
        setStatus("ready")
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Fixture konnte nicht geprueft werden.")
        setStatus("error")
      }
    }, 120)
    return () => window.clearTimeout(timer)
  }, [])

  const projectBoards = TAG_ONLY_FIXTURE.boards.filter(
    (board) => board.sourceProjectId === projectId,
  )
  const board = projectBoards.find((item) => item.id === boardId) ?? projectBoards[0]
  const boardActivities = TAG_ONLY_FIXTURE.activities.filter(
    (item) => item.sourceProjectId === projectId && item.boardId === board.id,
  )
  const visibleActivities = filterTagOnlyActivities(TAG_ONLY_FIXTURE, projectId, board.id, filters)
  const preview =
    visibleActivities.find((item) => item.sourceActivityId === previewId) ?? visibleActivities[0]
  const options = (key: "company" | "trade" | "area" | "week") =>
    [...new Set(boardActivities.map((item) => item[key]))].sort()

  const changeProject = (nextProjectId: string) => {
    const nextBoard = TAG_ONLY_FIXTURE.boards.find(
      (item) => item.sourceProjectId === nextProjectId,
    )!
    const nextPreview = TAG_ONLY_FIXTURE.activities.find((item) => item.boardId === nextBoard.id)!
    setProjectId(nextProjectId)
    setBoardId(nextBoard.id)
    setPreviewId(nextPreview.sourceActivityId)
    setFilters(EMPTY_FILTERS)
    setSelected(new Set())
    setDone(false)
  }

  const changeBoard = (nextBoardId: string) => {
    const nextPreview = TAG_ONLY_FIXTURE.activities.find((item) => item.boardId === nextBoardId)!
    setBoardId(nextBoardId)
    setPreviewId(nextPreview.sourceActivityId)
    setFilters(EMPTY_FILTERS)
    setSelected(new Set())
    setDone(false)
  }

  const toggle = (sourceActivityId: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(sourceActivityId)) next.delete(sourceActivityId)
      else next.add(sourceActivityId)
      return next
    })
  }

  return (
    <div className="tag-only-shell">
      <div className="tag-only-notices" aria-label="Zielbildkennzeichnung">
        <strong>Demonstrator / Zielbild - keine Produktionsfreigabe</strong>
        <span>Tag-only-Layout und physische Erkennung werden noch in Gate G4 validiert</span>
        <span>Keine LCMD-Liveverbindung</span>
      </div>

      <header className="tag-only-hero">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge className="bg-sky-100 text-sky-800">DEMO-04</Badge>
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
              Synthetisches Fixture
            </Badge>
          </div>
          <p className="tag-only-kicker">Physischer Wochenplan / Zielbild</p>
          <h1>Weniger Code. Mehr lesbare Arbeit.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
            Selektive Karten fuer eine konkrete Tafel. Die Ansicht zeigt einen isolierten
            Tag-only-Messeprototyp und ist nicht mit einem Combined-Analyseergebnis gekoppelt.
          </p>
        </div>
        <div className="tag-only-board-marker">
          {board.boardMarkerId === 63486 ? (
            <img
              src={`${import.meta.env.BASE_URL}ana09c4/tagCircle49h12_id63486_board_36mm.svg`}
              alt="Offizieller ANA-09C4-Vektor, Tafelmarker ID 63486"
            />
          ) : (
            <CircleDot className="size-12 text-slate-300" aria-hidden="true" />
          )}
          <div>
            <span>Grosser Tafelmarker</span>
            <strong>ID {board.boardMarkerId}</strong>
            <small>
              {board.boardMarkerId === 63486
                ? "ANA-09C4-Provenienzvektor"
                : "ID-Zuordnung ohne Markerbild"}
            </small>
          </div>
        </div>
      </header>

      {status === "loading" && (
        <div className="tag-only-state">
          <LoaderCircle className="size-5 animate-spin" /> Synthetisches Fixture wird geprueft ...
        </div>
      )}
      {status === "error" && (
        <div className="tag-only-state border-red-200 bg-red-50 text-red-800" role="alert">
          <AlertTriangle className="size-5" /> Zielbild blockiert: {error}
        </div>
      )}

      {status === "ready" && (
        <>
          <section className="tag-only-controls">
            <div className="tag-only-section-title">
              <span>01</span>
              <div>
                <h2>Projekt und Tafel</h2>
                <p>Nur synthetische Auswahl, keine Liveabfrage</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                Synthetisches Projekt
                <select
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  value={projectId}
                  onChange={(event) => changeProject(event.target.value)}
                >
                  {TAG_ONLY_FIXTURE.projects.map((project) => (
                    <option key={project.sourceProjectId} value={project.sourceProjectId}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                Konkrete Tafel
                <select
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  value={board.id}
                  onChange={(event) => changeBoard(event.target.value)}
                >
                  {projectBoards.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="tag-only-workspace">
            <div className="tag-only-list-panel">
              <div className="tag-only-section-title">
                <span>02</span>
                <div>
                  <h2>Forecast zusammenstellen</h2>
                  <p>
                    {visibleActivities.length} passende Aktivitaeten / {selected.size} gewaehlt
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField
                  label="Firma (Mock-Feld)"
                  value={filters.company}
                  options={options("company")}
                  onChange={(company) => setFilters((current) => ({ ...current, company }))}
                />
                <SelectField
                  label="Gewerk"
                  value={filters.trade}
                  options={options("trade")}
                  onChange={(trade) => setFilters((current) => ({ ...current, trade }))}
                />
                <SelectField
                  label="Bereich"
                  value={filters.area}
                  options={options("area")}
                  onChange={(area) => setFilters((current) => ({ ...current, area }))}
                />
                <SelectField
                  label="Kommende Wochenscheibe"
                  value={filters.week}
                  options={options("week")}
                  onChange={(week) => setFilters((current) => ({ ...current, week }))}
                />
              </div>
              <div className="mt-4 grid gap-2">
                {visibleActivities.map((item) => {
                  const checked = selected.has(item.sourceActivityId)
                  return (
                    <div
                      key={`${item.sourceProjectId}:${item.sourceActivityId}`}
                      className={`tag-only-activity ${preview?.sourceActivityId === item.sourceActivityId ? "is-preview" : ""}`}
                    >
                      <button
                        className={`tag-only-check ${checked ? "is-checked" : ""}`}
                        onClick={() => toggle(item.sourceActivityId)}
                        aria-label={`${item.shortTarget} zum Druck vormerken`}
                        aria-pressed={checked}
                      >
                        {checked && <Check className="size-3.5" />}
                      </button>
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setPreviewId(item.sourceActivityId)
                          setDone(false)
                        }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="truncate text-sm">{item.shortTarget}</strong>
                          <Badge variant="secondary">{item.week}</Badge>
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {item.company} / {item.trade} / {item.area}
                        </div>
                      </button>
                      <div className="hidden text-right font-mono text-[10px] text-slate-500 sm:block">
                        <div>A {item.activeTagId}</div>
                        <div>E {item.doneTagId}</div>
                      </div>
                    </div>
                  )
                })}
                {visibleActivities.length === 0 && (
                  <div className="tag-only-empty">
                    <Rows3 className="size-6" />
                    <strong>Keine Aktivitaet passt zu diesen Filtern.</strong>
                    <span>Filter zuruecksetzen oder eine andere Tafel waehlen.</span>
                    <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                      Filter zuruecksetzen
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <aside className="tag-only-preview-panel">
              <div className="tag-only-section-title">
                <span>03</span>
                <div>
                  <h2>Kartenzielbild</h2>
                  <p>18-mm-tagCircle49h12 als G4-Kandidat</p>
                </div>
              </div>
              {preview ? (
                <>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 p-2">
                    <div className="flex gap-2 text-xs">
                      <Badge className="bg-emerald-100 text-emerald-800">
                        Aktiv ID {preview.activeTagId}
                      </Badge>
                      <Badge className="bg-slate-800 text-white">
                        Erledigt ID {preview.doneTagId}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDone((current) => !current)}
                    >
                      <RotateCw /> 180 Grad drehen
                    </Button>
                  </div>
                  <TagCard activity={preview} done={done} />
                </>
              ) : (
                <div className="tag-only-empty">
                  <Rows3 className="size-6" />
                  <strong>Keine Karte fuer die aktive Filterung.</strong>
                  <span>Die Vorschau zeigt bewusst keine unpassende Aktivitaet.</span>
                  <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Filter zuruecksetzen
                  </Button>
                </div>
              )}
            </aside>
          </section>

          <section className="tag-only-manifest">
            <div className="tag-only-section-title">
              <span>04</span>
              <div>
                <h2>Manifest und Zuordnung</h2>
                <p>Verstaendliche Vorschau, keine Vergabe und keine Persistenz</p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table>
                  <thead>
                    <tr>
                      <th>Fachlicher Quellschluessel</th>
                      <th>Tafel</th>
                      <th>Aktiv / Erledigt</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selected]
                      .map((id) => boardActivities.find((item) => item.sourceActivityId === id))
                      .filter((item): item is TagOnlyActivity => Boolean(item))
                      .map((item) => (
                        <tr key={`${item.sourceProjectId}:${item.sourceActivityId}`}>
                          <td className="font-mono">
                            ({item.sourceProjectId}, {item.sourceActivityId})
                          </td>
                          <td>
                            {board.name} / Marker {board.boardMarkerId}
                          </td>
                          <td className="font-mono">
                            {item.activeTagId} / {item.doneTagId}
                          </td>
                          <td>
                            <Badge variant="outline">nur vorgemerkt</Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {selected.size === 0 && (
                  <div className="p-6 text-center text-sm text-slate-500">
                    Noch keine Aktivitaet vorgemerkt. Die Manifestvorschau bleibt leer.
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950 lg:w-72">
                <strong className="block text-sm">Bewusste Grenzen</strong>
                Keine zentrale Datenbank, Produktpersistenz, produktive ID-Vergabe, LCMD-API,
                PDF-Ausgabe oder Rueckfluss. Firma und Abweichung sind sichtbar als Mock-Felder
                gekennzeichnet. Kartenpool 0..63485, Tafelmarker 63486..64509.
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
