import { AlertTriangle, ArrowDownToLine, Check, ChevronDown, RotateCw, Rows3 } from "lucide-react"
import { useState, type CSSProperties } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  filterTagOnlyActivities,
  TAG_ONLY_FIXTURE,
  tagOnlyBoardMarkerFilename,
  tagOnlyActivityKey,
  tagOnlyCardMarkerFilename,
  type TagOnlyActivity,
  type TagOnlyFilters,
  validateTagOnlyFixture,
} from "@/lib/tag-only-target"

const EMPTY_FILTERS: TagOnlyFilters = {
  company: [],
  trade: [],
  area: [],
  week: [],
  query: "",
}

function MultiSelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string[]
  options: string[]
  onChange: (value: string[]) => void
}) {
  const summary = value.length === 0 ? "Alle" : value.join(", ")
  return (
    <div className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-600">
      <span>{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-normal text-slate-900 outline-none transition hover:bg-slate-50 focus:border-sky-500 focus:ring-3 focus:ring-sky-100"
            aria-label={`${label}: ${summary}`}
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="size-4 shrink-0 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-52"
        >
          <DropdownMenuCheckboxItem
            checked={value.length === 0}
            onCheckedChange={() => onChange([])}
            onSelect={(event) => event.preventDefault()}
          >
            Alle
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option}
              checked={value.includes(option)}
              onCheckedChange={() =>
                onChange(
                  value.includes(option)
                    ? value.filter((entry) => entry !== option)
                    : [...value, option],
                )
              }
              onSelect={(event) => event.preventDefault()}
            >
              {option}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function TagCard({
  activity,
  done,
  onAssetError,
}: {
  activity: TagOnlyActivity
  done: boolean
  onAssetError?: () => void
}) {
  const cardStyle = { "--trade-color": activity.tradeColor } as CSSProperties
  const marker = (status: "active" | "done", tagId: number) => {
    const filename = tagOnlyCardMarkerFilename(tagId, status)
    return (
      <div className="tag-only-marker">
        <img
          src={`${import.meta.env.BASE_URL}ana09c4/${filename}`}
          alt={`Offizieller ANA-09C4-Provenienzvektor, tagCircle49h12 ID ${tagId}`}
          data-marker-status={status}
          data-marker-id={tagId}
          onError={onAssetError}
        />
        <strong className="font-mono">ID {tagId}</strong>
        <span>18 mm / G4-Kandidat</span>
      </div>
    )
  }
  return (
    <div className="mx-auto w-full max-w-[430px]" style={cardStyle}>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>Schemaansicht 120 x 66 mm</span>
        <span className="font-mono">Oben sichtbar: {done ? "Erledigt" : "Aktiv"}</span>
      </div>
      <div
        className={`tag-only-card ${done ? "rotate-180" : ""}`}
        aria-label={done ? "Karte in Erledigt-Orientierung" : "Karte in Aktiv-Orientierung"}
        data-card-orientation={done ? "done" : "active"}
      >
        <div className="tag-only-card__end tag-only-card__end--active" data-card-end="active">
          <div className="min-w-0">
            <div className="tag-only-card__statusline">
              <strong>Aktiv</strong>
              <span>
                {activity.trade} / {activity.week}
              </span>
            </div>
            <div className="mt-2 text-base leading-tight font-semibold text-slate-950 sm:text-lg">
              {activity.shortTarget}
            </div>
            <div className="mt-2 truncate text-[10px] text-slate-500">
              Firma (Mock): {activity.company}
            </div>
          </div>
          {marker("active", activity.activeTagId)}
        </div>
        <div className="tag-only-card__board-line" aria-hidden="true">
          <span>Stecktafel-Sichtkante</span>
        </div>
        <div className="tag-only-card__middle">
          <div className="tag-only-card__deviation">{activity.deviation}</div>
          <div className="tag-only-card__drawer">
            <div className="flex items-center justify-between gap-3 text-[9px] tracking-[0.12em] text-slate-400 uppercase">
              <span>Herausziehbereich / volles Soll</span>
              <ArrowDownToLine className="size-3.5" />
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">{activity.fullTarget}</p>
            <div className="mt-auto flex items-end justify-between gap-3 pt-4 text-[9px] text-slate-400">
              <span className="font-mono">{activity.demoActivityKey}</span>
              <span>Konzept, kein Druckexport</span>
            </div>
          </div>
        </div>
        <div className="tag-only-card__end tag-only-card__end--done" data-card-end="done">
          <div className="min-w-0">
            <div className="tag-only-card__statusline">
              <strong>Erledigt</strong>
              <span>
                {activity.trade} / {activity.week}
              </span>
            </div>
            <div className="mt-2 text-base leading-tight font-semibold text-slate-950 sm:text-lg">
              {activity.shortTarget}
            </div>
            <div className="mt-2 truncate text-[10px] text-slate-500">
              Gewerksfarbe: synthetisches Mock-Attribut
            </div>
          </div>
          {marker("done", activity.doneTagId)}
        </div>
      </div>
      <div className="tag-only-insertion-note">
        <strong>Eingesteckte Tafelansicht</strong>
        <span>
          Nur das obere Kartenende bleibt sichtbar. Herausziehbereich und gegenueberliegendes
          Statusende liegen hinter der Tafel.
        </span>
        <span className="mt-1 flex items-center gap-1.5">
          <span className="tag-only-trade-dot" aria-hidden="true" />
          Gewerksfarbe {activity.trade}: synthetisches Mock-Attribut
        </span>
      </div>
    </div>
  )
}

function initialAssetState(): { status: "ready" | "error"; error: string } {
  try {
    const fixture = validateTagOnlyFixture(TAG_ONLY_FIXTURE)
    for (const board of fixture.boards) tagOnlyBoardMarkerFilename(board.boardMarkerId)
    for (const activity of fixture.activities) {
      tagOnlyCardMarkerFilename(activity.activeTagId, "active")
      tagOnlyCardMarkerFilename(activity.doneTagId, "done")
    }
    return { status: "ready", error: "" }
  } catch (reason) {
    return {
      status: "error",
      error: reason instanceof Error ? reason.message : "Fixture konnte nicht geprueft werden.",
    }
  }
}

export function TagOnlyTargetView() {
  const [assetState, setAssetState] = useState(initialAssetState)
  const { status, error } = assetState
  const [boardId, setBoardId] = useState("")
  const [filters, setFilters] = useState<TagOnlyFilters>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewId, setPreviewId] = useState(tagOnlyActivityKey(TAG_ONLY_FIXTURE.activities[0]))
  const [featuredOnly, setFeaturedOnly] = useState(true)
  const [done, setDone] = useState(false)

  const failAssetRendering = () => {
    setAssetState({
      status: "error",
      error: "Ein gebundenes Markerasset konnte nicht dargestellt werden.",
    })
  }

  const board = TAG_ONLY_FIXTURE.boards.find((item) => item.id === boardId)
  const scopedActivities = TAG_ONLY_FIXTURE.activities.filter(
    (item) => !boardId || item.boardId === boardId,
  )
  const filteredActivities = filterTagOnlyActivities(TAG_ONLY_FIXTURE, "DEMO-04", boardId, filters)
  const visibleActivities = featuredOnly
    ? filteredActivities.filter((item) => item.featured)
    : filteredActivities
  const preview =
    visibleActivities.find((item) => tagOnlyActivityKey(item) === previewId) ?? visibleActivities[0]
  const options = (key: "company" | "trade" | "area" | "week") =>
    [...new Set(scopedActivities.map((item) => item[key]))].sort()

  const changeBoard = (nextBoardId: string) => {
    const nextPreview = TAG_ONLY_FIXTURE.activities.find(
      (item) => !nextBoardId || item.boardId === nextBoardId,
    )!
    setBoardId(nextBoardId)
    setPreviewId(tagOnlyActivityKey(nextPreview))
    setFilters(EMPTY_FILTERS)
    setDone(false)
  }

  const toggle = (item: TagOnlyActivity) => {
    const key = tagOnlyActivityKey(item)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="tag-only-shell">
      <div className="tag-only-notices" aria-label="Zielbildkennzeichnung">
        <strong>DEMO-04 / synthetischer, nichtproduktiver Testlauf</strong>
        <span>Noch nicht an einen LCMD-Export gebunden</span>
        <span>Demo-Tag-IDs vorab reserviert, nicht produktiv vergeben</span>
        <span>Keine LCMD-Liveverbindung</span>
        <span>Kein Writeback</span>
        <span>Keine validierte laufende Synchronisierung</span>
        <span>Tag-only-Layout und physische Erkennung nicht durch Gate G4 freigegeben</span>
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
            50 kanonische synthetische Vorgaenge fuer drei logische Tafeln. Die Ansicht zeigt einen
            isolierten Tag-only-Messeprototyp und ist nicht mit einem Combined-Analyseergebnis
            gekoppelt.
          </p>
        </div>
        <div className="tag-only-board-marker">
          {status === "ready" ? (
            <div className="tag-only-board-marker__images">
              {(board ? [board] : TAG_ONLY_FIXTURE.boards).map((item) => (
                <img
                  key={item.id}
                  src={`${import.meta.env.BASE_URL}ana09c4/${tagOnlyBoardMarkerFilename(item.boardMarkerId)}`}
                  alt={`Offizieller ANA-09C4-Provenienzvektor, Tafelmarker ID ${item.boardMarkerId}`}
                  data-board-marker-id={item.boardMarkerId}
                  onError={failAssetRendering}
                />
              ))}
            </div>
          ) : (
            <AlertTriangle className="size-10 text-amber-300" aria-hidden="true" />
          )}
          <div>
            <span>Grosser Tafelmarker</span>
            <strong>{board ? `ID ${board.boardMarkerId}` : "IDs 63486-63488"}</strong>
            <small>
              {status === "ready"
                ? board
                  ? "Gebundener ANA-09C4-Provenienzvektor"
                  : "Eine physische Tafel, drei sequenzielle Belegungen"
                : "Asset nicht dargestellt"}
            </small>
          </div>
        </div>
      </header>

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
                <h2>Demo-Kontext und Tafel</h2>
                <p>Ein Demo-Projektkontext, keine behauptete LCMD-Projekt-ID</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5 text-xs font-medium text-slate-600">
                Demo-Projektkontext
                <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900">
                  <span className="truncate">{TAG_ONLY_FIXTURE.demoProjects[0].name}</span>
                </div>
              </div>
              <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                Konkrete Tafel
                <select
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  value={boardId}
                  onChange={(event) => changeBoard(event.target.value)}
                >
                  <option value="">Alle Tafeln</option>
                  {TAG_ONLY_FIXTURE.boards.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="tag-only-contract-counts" aria-label="Kanonischer Umfang">
              <strong>50</strong>
              <span>synthetische Vorgaenge</span>
              <strong>8</strong>
              <span>gefuehrte Messeauswahl</span>
              <strong>100</strong>
              <span>eindeutige Kartenmarker</span>
            </div>
          </section>

          <section className="tag-only-workspace">
            <div className="tag-only-list-panel">
              <div className="tag-only-section-title">
                <span>02</span>
                <div>
                  <h2>Forecast zusammenstellen</h2>
                  <p>
                    {visibleActivities.length} von 50 synthetischen Vorgaengen sichtbar /{" "}
                    {selected.size} fuer Manifestvorschau markiert
                  </p>
                </div>
              </div>
              <div className="mb-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950">
                Filter-Scope: 50 synthetische Demo-Vorgaenge im gewaehlten Tafel-Scope. Mehrere
                Werte innerhalb eines Filters werden mit ODER, verschiedene Filter mit UND
                kombiniert. Keine Analyse- oder LCMD-Ergebnisse.
              </div>
              <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="grid gap-1.5 text-xs font-medium text-slate-600">
                  Suche im kanonischen 50er-Demo-Vertrag
                  <input
                    type="search"
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-3 focus:ring-sky-100"
                    value={filters.query}
                    placeholder="SOLL, Firma, Demo-Schluessel oder Marker-ID"
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, query: event.target.value }))
                    }
                  />
                </label>
                <div className="grid gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-2">
                  <Button
                    variant={featuredOnly ? "default" : "ghost"}
                    onClick={() => setFeaturedOnly(true)}
                    aria-pressed={featuredOnly}
                  >
                    Nur Messeauswahl (8)
                  </Button>
                  <Button
                    variant={!featuredOnly ? "default" : "ghost"}
                    onClick={() => setFeaturedOnly(false)}
                    aria-pressed={!featuredOnly}
                  >
                    Alle 50 anzeigen
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <MultiSelectField
                  label="Firma (Mock-Feld)"
                  value={filters.company}
                  options={options("company")}
                  onChange={(company) => setFilters((current) => ({ ...current, company }))}
                />
                <MultiSelectField
                  label="Gewerk"
                  value={filters.trade}
                  options={options("trade")}
                  onChange={(trade) => setFilters((current) => ({ ...current, trade }))}
                />
                <MultiSelectField
                  label="Bereich"
                  value={filters.area}
                  options={options("area")}
                  onChange={(area) => setFilters((current) => ({ ...current, area }))}
                />
                <MultiSelectField
                  label="Kommende Wochenscheibe"
                  value={filters.week}
                  options={options("week")}
                  onChange={(week) => setFilters((current) => ({ ...current, week }))}
                />
              </div>
              <div className="mt-4 grid max-h-[48rem] gap-2 overflow-y-auto pr-1">
                {visibleActivities.map((item) => {
                  const itemKey = tagOnlyActivityKey(item)
                  const checked = selected.has(itemKey)
                  return (
                    <div
                      key={item.demoActivityKey}
                      className={`tag-only-activity ${preview && tagOnlyActivityKey(preview) === itemKey ? "is-preview" : ""}`}
                      style={{ "--trade-color": item.tradeColor } as CSSProperties}
                    >
                      <button
                        className={`tag-only-check ${checked ? "is-checked" : ""}`}
                        onClick={() => toggle(item)}
                        aria-label={`${item.shortTarget} fuer Manifestvorschau markieren`}
                        aria-pressed={checked}
                      >
                        <span className="tag-only-check__box">
                          {checked && <Check className="size-3.5" />}
                        </span>
                      </button>
                      <button
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          setPreviewId(itemKey)
                          setDone(false)
                        }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="truncate text-sm">{item.shortTarget}</strong>
                          <Badge variant="secondary">{item.week}</Badge>
                          {item.featured && (
                            <Badge className="bg-amber-100 text-amber-900">Messeauswahl</Badge>
                          )}
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                          <span className="tag-only-trade-dot" aria-hidden="true" />
                          <span className="truncate">
                            {item.company} / {item.trade} / {item.area}
                          </span>
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
                    <span>Filter oder Messeauswahl zuruecksetzen.</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFilters(EMPTY_FILTERS)
                        setFeaturedOnly(false)
                      }}
                    >
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
                      <RotateCw /> Ganze Karte 180 Grad drehen
                    </Button>
                  </div>
                  <TagCard activity={preview} done={done} onAssetError={failAssetRendering} />
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
                      <th>Demo-Bootstrapschluessel</th>
                      <th>Tafel</th>
                      <th>Aktiv / Erledigt</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selected]
                      .map((id) =>
                        TAG_ONLY_FIXTURE.activities.find((item) => tagOnlyActivityKey(item) === id),
                      )
                      .filter((item): item is TagOnlyActivity => Boolean(item))
                      .map((item) => (
                        <tr key={item.demoActivityKey}>
                          <td>
                            <span className="block font-mono">{item.demoActivityKey}</span>
                            <span className="text-[10px] text-slate-500">
                              LCMD-Quellidentitaet: unbound
                            </span>
                          </td>
                          <td>
                            {
                              TAG_ONLY_FIXTURE.boards.find((entry) => entry.id === item.boardId)!
                                .name
                            }{" "}
                            / Marker{" "}
                            {
                              TAG_ONLY_FIXTURE.boards.find((entry) => entry.id === item.boardId)!
                                .boardMarkerId
                            }
                          </td>
                          <td className="font-mono">
                            {item.activeTagId} / {item.doneTagId}
                          </td>
                          <td>
                            <Badge variant="outline">synthetischer Preflight</Badge>
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
                produktiver PDF-Export oder Rueckfluss. Kein Writeback und keine validierte laufende
                Synchronisierung. D04-001..D04-050 sind ausschliesslich stabile
                Demo-Bootstrapschluessel, keine LCMD-Prozess-IDs. Der technische Testdruck stammt
                aus dem kanonischen 50-Vorgaenge-Vertrag.
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
