import {
  CalendarCheck,
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCw,
  Search,
  Upload,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { useDropzone } from "react-dropzone"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardPreview } from "@/components/pilot/CardPreview"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { readXlsxToTable } from "@/lib/import-xlsx"
import {
  cardMetaLine,
  cardVisibleMetaLine,
  COMPLETED_BACKGROUND_CSS,
} from "@/lib/pilot-card-layout"
import { createTaglessCardsPdf, downloadTaglessPdf } from "@/lib/tagless-print-pdf"
import {
  createTaglessTickets,
  EMPTY_TAGLESS_FILTERS,
  filterTaglessTickets,
  isoWeek,
  normalizeTaglessFilters,
  taglessFacetOptions,
  ticketArea,
  validateTaglessProcessPlan,
  type TaglessDayMode,
  type TaglessFacet,
  type TaglessFilters,
} from "@/lib/tagless-workflow"
import type { ImportTable, TicketData } from "@/lib/ticket-types"

const DAY_MODES: Array<{ value: TaglessDayMode; label: string; detail: string }> = [
  { value: "weekdays", label: "Mo-Fr", detail: "Samstag und Sonntag auslassen" },
  { value: "monday-saturday", label: "Mo-Sa", detail: "Nur Sonntag auslassen" },
  { value: "all-days", label: "Alle Tage", detail: "Jeden Kalendertag bilden" },
]

function safeFilename(value: string) {
  return value.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "-") || "prozessplan"
}

function TaglessCardPreview({ ticket, done }: { ticket: TicketData; done: boolean }) {
  const color = ticket.tradeColor || "#0f766e"
  const area = ticketArea(ticket) || "Bereich nicht angegeben"
  const meta = cardVisibleMetaLine(ticket.taskId, ticket.trade, area)
  return (
    <div className="mx-auto w-full max-w-[390px]">
      <div className="mb-2 flex justify-between text-xs text-slate-500">
        <span>66 x 120 mm / ohne Codes</span>
        <span>{done ? "Erledigt oben" : "Aktiv oben"}</span>
      </div>
      <CardPreview
        title={ticket.taskName}
        meta={meta}
        color={color}
        completedBackground={COMPLETED_BACKGROUND_CSS}
        activeStatusColor={color}
        completedStatusColor="rgb(13 82 46)"
        completedTitleClassName="text-green-950"
        completedMetaClassName="text-green-900"
        rotated={done}
        ariaLabel={
          done ? "Taglose Karte in Erledigt-Orientierung" : "Taglose Karte in Aktiv-Orientierung"
        }
        middle={
          <div className="flex min-h-0 flex-col bg-white px-4 py-5 text-xs text-slate-700">
            <strong>
              {ticket.date ? `${isoWeek(ticket.date)} / ${ticket.date}` : "Ohne Datum"}
            </strong>
            <span className="mt-4 border-b border-slate-300 pb-1">Kommentar</span>
            <span className="mt-5 border-b border-slate-300" />
            <span className="mt-5 border-b border-slate-300" />
            <span className="mt-auto text-[10px] text-slate-400">
              Lokale Koordinationskarte, keine Produktidentitaet
            </span>
          </div>
        }
      />
    </div>
  )
}

function formatWeek(value: string) {
  const match = value.match(/^(\d{4})-KW(\d{2})$/)
  return match ? `KW ${match[2]} / ${match[1]}` : value
}

function MultiSelectFilter({
  id,
  label,
  value,
  options,
  onChange,
  formatValue = (entry) => entry,
  disabled = false,
}: {
  id: string
  label: string
  value: string[]
  options: string[]
  onChange: (value: string[]) => void
  formatValue?: (value: string) => string
  disabled?: boolean
}) {
  const summary =
    value.length === 0
      ? "Alle verfuegbaren"
      : value.length === 1
        ? formatValue(value[0]!)
        : `${value.length} ausgewaehlt`
  return (
    <div className="grid min-w-0 gap-1.5 text-xs font-medium text-slate-600">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className="flex h-11 min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-normal text-slate-900 disabled:opacity-50"
            aria-label={`${label}: ${summary}`}
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="size-4 shrink-0 text-slate-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 overflow-y-auto"
        >
          <DropdownMenuCheckboxItem
            checked={value.length === 0}
            onCheckedChange={() => onChange([])}
            onSelect={(event) => event.preventDefault()}
          >
            Alle verfuegbaren
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
              {formatValue(option)}
            </DropdownMenuCheckboxItem>
          ))}
          {options.length === 0 && (
            <div className="px-2 py-3 text-xs text-slate-500">Keine passenden Werte</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function TaglessView({
  onWorkflowActiveChange,
  onRequestActiveChange,
}: {
  onWorkflowActiveChange?: (active: boolean) => void
  onRequestActiveChange?: (active: boolean) => void
}) {
  const operationVersion = useRef(0)
  const mounted = useRef(true)
  const [table, setTable] = useState<ImportTable | null>(null)
  const [dayMode, setDayMode] = useState<TaglessDayMode | null>(null)
  const [appliedMode, setAppliedMode] = useState<TaglessDayMode | null>(null)
  const [tickets, setTickets] = useState<TicketData[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewId, setPreviewId] = useState("")
  const [filters, setFilters] = useState<TaglessFilters>(EMPTY_TAGLESS_FILTERS)
  const [previewDone, setPreviewDone] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      operationVersion.current += 1
      onWorkflowActiveChange?.(false)
      onRequestActiveChange?.(false)
    }
  }, [onRequestActiveChange, onWorkflowActiveChange])

  const workflowActive = Boolean(table || importing || exporting)
  const requestActive = importing || exporting
  useEffect(
    () => onWorkflowActiveChange?.(workflowActive),
    [onWorkflowActiveChange, workflowActive],
  )
  useEffect(() => onRequestActiveChange?.(requestActive), [onRequestActiveChange, requestActive])

  const filtered = useMemo(() => filterTaglessTickets(tickets, filters), [tickets, filters])
  const byId = useMemo(() => new Map(tickets.map((ticket) => [ticket.ticketId, ticket])), [tickets])
  const preview = byId.get(previewId) ?? null
  const selectedVisible = filtered.filter((ticket) => selected.has(ticket.ticketId)).length
  const selectedHidden = selected.size - selectedVisible
  const areas = taglessFacetOptions(tickets, filters, "area")
  const trades = taglessFacetOptions(tickets, filters, "trade")
  const dates = taglessFacetOptions(tickets, filters, "date")
  const weeks = taglessFacetOptions(tickets, filters, "week")

  const updateFacet = (facet: TaglessFacet, value: string[]) => {
    setFilters((current) => normalizeTaglessFilters(tickets, { ...current, [facet]: value }, facet))
  }

  const resetImportedData = () => {
    setTable(null)
    setDayMode(null)
    setAppliedMode(null)
    setTickets([])
    setSelected(new Set())
    setPreviewId("")
    setFilters(EMPTY_TAGLESS_FILTERS)
    setPreviewDone(false)
  }

  const importFile = async (file: File) => {
    const version = ++operationVersion.current
    setImporting(true)
    setError("")
    try {
      if (!file.name.toLocaleLowerCase("de").endsWith(".xlsx")) {
        throw new Error("Nur Dateien mit der Endung .xlsx werden akzeptiert.")
      }
      const next = await readXlsxToTable(file)
      if (version !== operationVersion.current || !mounted.current) return
      if (next.sourceKind !== "processPlan") {
        throw new Error("Nur Prozessplan-XLSX mit Startdatum und Enddatum wird akzeptiert.")
      }
      validateTaglessProcessPlan(next)
      resetImportedData()
      setTable(next)
    } catch (reason) {
      if (version !== operationVersion.current || !mounted.current) return
      setError(
        reason instanceof Error ? reason.message : "Die XLSX-Datei konnte nicht gelesen werden.",
      )
    } finally {
      if (version === operationVersion.current && mounted.current) setImporting(false)
    }
  }

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    multiple: false,
    noClick: true,
    disabled: requestActive,
    onDropAccepted: (accepted) => {
      const file = accepted[0]
      if (file) void importFile(file)
    },
    onDropRejected: () => {
      setError("Nur Dateien mit der Endung .xlsx werden akzeptiert.")
    },
  })

  const chooseDayMode = (mode: TaglessDayMode) => {
    setDayMode(mode)
    setAppliedMode(null)
    setTickets([])
    setSelected(new Set())
    setPreviewId("")
    setFilters(EMPTY_TAGLESS_FILTERS)
  }

  const applyCalendar = () => {
    if (!table) return
    setError("")
    try {
      const next = createTaglessTickets(table, dayMode)
      setTickets(next)
      setAppliedMode(dayMode)
      setSelected(new Set())
      setPreviewId(next[0]?.ticketId ?? "")
      setFilters(EMPTY_TAGLESS_FILTERS)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Die Tageskarten konnten nicht gebildet werden.",
      )
    }
  }

  const toggleSelection = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exportPdf = async () => {
    const exportTickets = tickets.filter((ticket) => selected.has(ticket.ticketId))
    if (!table || exportTickets.length === 0) return
    const version = ++operationVersion.current
    setExporting(true)
    setError("")
    try {
      const bytes = await createTaglessCardsPdf(exportTickets)
      if (version !== operationVersion.current || !mounted.current) return
      downloadTaglessPdf(bytes, `${safeFilename(table.fileName)}-ohne-tags.pdf`)
    } catch (reason) {
      if (version !== operationVersion.current || !mounted.current) return
      setError(reason instanceof Error ? reason.message : "Das PDF konnte nicht erzeugt werden.")
    } finally {
      if (version === operationVersion.current && mounted.current) setExporting(false)
    }
  }

  return (
    <div
      className="pilot-workflow space-y-4 pb-10 text-slate-900"
      aria-busy={importing || exporting}
    >
      <header className="overflow-hidden border border-slate-800 bg-slate-950 p-5 text-white shadow-xl sm:p-7">
        <Badge className="brand-badge">Lokal / taglos</Badge>
        <p className="brand-kicker-dark mt-4 text-xs font-semibold tracking-[0.2em] uppercase">
          Prozessplan zu Koordinationskarten
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          Auswaehlen, pruefen, gezielt drucken.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
          Die XLSX-Datei bleibt im Browser. Dieser Weg vergibt keine Tags, erzeugt kein Manifest und
          veraendert keine Analyzer-Erwartungsmenge.
        </p>
      </header>

      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      )}

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]">
        <div>
          <p className="brand-kicker text-xs font-semibold tracking-wider uppercase">01 / Import</p>
          <h3 className="mt-1 text-xl font-semibold">Prozessplan-XLSX waehlen</h3>
          <p className="mt-1 text-sm text-slate-600">
            Plankartenexporte und unbekannte Tabellen werden abgewiesen. Ein erfolgreicher neuer
            Import ersetzt Karten, Filter und Auswahl des vorherigen Imports atomar.
          </p>
        </div>
        <div
          {...getRootProps({
            className: `flex flex-col justify-center rounded-xl border border-dashed p-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
              isDragActive ? "brand-dropzone-active" : "border-slate-300 bg-slate-50"
            }`,
            "aria-label": "Prozessplan-XLSX hier ablegen oder auswaehlen",
          })}
        >
          <div className="flex min-w-0 items-center gap-3">
            <FileSpreadsheet className="brand-kicker size-8 shrink-0" />
            <div className="min-w-0">
              <strong className="block truncate text-sm">
                {table?.fileName || "Noch keine Datei"}
              </strong>
              <span className="text-xs text-slate-500">
                {isDragActive
                  ? "XLSX jetzt ablegen"
                  : table
                    ? `${table.rows.length} Prozesszeilen erkannt / neue XLSX hier ablegen`
                    : "XLSX hier ablegen oder ueber den Button auswaehlen"}
              </span>
            </div>
          </div>
          <input {...getInputProps()} />
          <Button
            type="button"
            className="mt-3 sm:mt-0"
            disabled={importing || exporting}
            onClick={open}
          >
            {importing ? <Loader2 className="animate-spin" /> : <Upload />}
            {table ? "Neu importieren" : "XLSX waehlen"}
          </Button>
        </div>
      </section>

      {table && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <CalendarCheck className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-xs font-semibold tracking-wider text-amber-800 uppercase">
                02 / Kalender bestaetigen
              </p>
              <h3 className="mt-1 text-xl font-semibold">Welche Tage sind Arbeitstage?</h3>
              <p className="mt-1 text-sm leading-relaxed text-amber-950">
                Fuer dieses Exportschema ist keine ausdrueckliche Kalender- oder Feiertagsregel
                belegt. Deshalb entscheidet nicht die Dauer-Spalte: Arbeitswoche sichtbar waehlen.
                Feiertage und Ausnahmen werden nicht erfunden.
              </p>
            </div>
          </div>
          <fieldset className="mt-4 grid gap-2 md:grid-cols-3" disabled={requestActive}>
            <legend className="sr-only">Arbeitswoche</legend>
            {DAY_MODES.map((mode) => (
              <label
                key={mode.value}
                className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 ${dayMode === mode.value ? "border-amber-600 ring-2 ring-amber-100" : "border-amber-200"}`}
              >
                <input
                  type="radio"
                  name="tagless-day-mode"
                  value={mode.value}
                  checked={dayMode === mode.value}
                  onChange={() => chooseDayMode(mode.value)}
                />
                <span>
                  <strong className="block">{mode.label}</strong>
                  <span className="mt-1 block text-xs text-slate-600">{mode.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              className="semantic-action bg-amber-700 hover:bg-amber-800"
              disabled={!dayMode || requestActive}
              onClick={applyCalendar}
            >
              <Check /> Arbeitswoche bestaetigen
            </Button>
            {appliedMode && (
              <span className="text-sm text-amber-950">
                Bestaetigt: {DAY_MODES.find((mode) => mode.value === appliedMode)?.label} /{" "}
                {tickets.length} Karten
              </span>
            )}
          </div>
        </section>
      )}

      {appliedMode && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="brand-kicker text-xs font-semibold tracking-wider uppercase">
              03 / Auswahl
            </p>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">Karten filtern und markieren</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {filtered.length} sichtbar / {selected.size} ausgewaehlt
                  {selectedHidden > 0 ? ` / davon ${selectedHidden} durch Filter ausgeblendet` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={filtered.length === 0 || requestActive}
                  onClick={() =>
                    setSelected(
                      (current) =>
                        new Set([...current, ...filtered.map((ticket) => ticket.ticketId)]),
                    )
                  }
                >
                  Alle {filtered.length} gefilterten auswaehlen
                </Button>
                <Button
                  variant="ghost"
                  disabled={selected.size === 0 || requestActive}
                  onClick={() => setSelected(new Set())}
                >
                  Auswahl leeren
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <MultiSelectFilter
                id="tagless-area"
                label="Bereich"
                value={filters.area}
                options={areas}
                disabled={requestActive}
                onChange={(area) => updateFacet("area", area)}
              />
              <MultiSelectFilter
                id="tagless-trade"
                label="Gewerk"
                value={filters.trade}
                options={trades}
                disabled={requestActive}
                onChange={(trade) => updateFacet("trade", trade)}
              />
              <MultiSelectFilter
                id="tagless-date"
                label="Datum"
                value={filters.date}
                options={dates}
                disabled={requestActive}
                onChange={(date) => updateFacet("date", date)}
              />
              <MultiSelectFilter
                id="tagless-week"
                label="ISO-Woche"
                value={filters.week}
                options={weeks}
                formatValue={formatWeek}
                disabled={requestActive}
                onChange={(week) => updateFacet("week", week)}
              />
            </div>
            <Label htmlFor="tagless-search" className="mt-3 block text-xs text-slate-600">
              Freitext
            </Label>
            <div className="relative mt-1.5">
              <Search className="absolute top-3.5 left-3 size-4 text-slate-500" />
              <Input
                id="tagless-search"
                type="search"
                className="h-11 pl-9"
                value={filters.query}
                placeholder="Vorgang, Gewerk, Bereich oder Datum"
                onChange={(event) =>
                  setFilters((current) =>
                    normalizeTaglessFilters(tickets, {
                      ...current,
                      query: event.target.value,
                    }),
                  )
                }
              />
            </div>

            <div className="mt-4 max-h-[42rem] overflow-auto rounded-xl border border-slate-200">
              <div className="divide-y divide-slate-100">
                {filtered.map((ticket) => {
                  const checked = selected.has(ticket.ticketId)
                  return (
                    <div
                      key={ticket.ticketId}
                      className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 p-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${previewId === ticket.ticketId ? "brand-selection" : "bg-white"}`}
                      style={{ "--trade-color": ticket.tradeColor || "#0f766e" } as CSSProperties}
                    >
                      <button
                        type="button"
                        className={`brand-select-button flex size-11 items-center justify-center rounded-lg border ${checked ? "is-selected" : "border-slate-300 bg-white"}`}
                        aria-label={`${ticket.taskName} fuer Druck ${checked ? "abwaehlen" : "auswaehlen"}`}
                        aria-pressed={checked}
                        disabled={requestActive}
                        onClick={() => toggleSelection(ticket.ticketId)}
                      >
                        {checked && <Check />}
                      </button>
                      <button
                        type="button"
                        className="brand-interactive min-w-0 border-l-4 px-3 py-1 text-left"
                        style={{ borderColor: ticket.tradeColor || "#0f766e" }}
                        onClick={() => {
                          setPreviewId(ticket.ticketId)
                          setPreviewDone(false)
                        }}
                      >
                        <strong className="block text-sm break-words">{ticket.taskName}</strong>
                        <span className="mt-1 block text-xs break-words whitespace-normal text-slate-500">
                          {ticket.date
                            ? cardMetaLine(
                                ticket.taskId,
                                ticket.date,
                                ticket.trade,
                                ticketArea(ticket),
                              )
                            : `ID ${ticket.taskId} | Ohne Datum | ${ticket.trade || "Gewerk nicht angegeben"} | ${ticketArea(ticket) || "Bereich nicht angegeben"}`}
                        </span>
                      </button>
                      <Badge variant="secondary" className="hidden sm:inline-flex">
                        {ticket.date ? isoWeek(ticket.date) : "Ohne Datum"}
                      </Badge>
                    </div>
                  )
                })}
                {filtered.length === 0 && (
                  <div className="p-8 text-center text-sm text-slate-500">
                    Keine Karte passt zu den Filtern.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="brand-kicker text-xs font-semibold tracking-wider uppercase">
              04 / Vorschau
            </p>
            <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">Physisches Kartenlayout</h3>
                <p className="mt-1 text-sm text-slate-600">Vorschau ist keine Druckauswahl.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!preview}
                onClick={() => setPreviewDone((value) => !value)}
              >
                <RotateCw /> 180 Grad
              </Button>
            </div>
            <div className="mt-5">
              {preview ? (
                <TaglessCardPreview ticket={preview} done={previewDone} />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  Eine Karte aus der Liste fuer die Vorschau oeffnen.
                </div>
              )}
            </div>
            <div className="brand-callout mt-5 rounded-xl border p-4">
              <strong className="text-slate-950">Druckauswahl: {selected.size} Karten</strong>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">
                {selectedHidden > 0
                  ? `${selectedHidden} ausgewaehlte Karten sind durch die aktuellen Filter ausgeblendet und bleiben im Drucksatz.`
                  : "Alle ausgewaehlten Karten sind mit den aktuellen Filtern sichtbar."}
              </p>
              <Button
                className="mt-3 w-full"
                disabled={selected.size === 0 || requestActive}
                onClick={() => void exportPdf()}
              >
                {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                {exporting ? "PDF wird erzeugt..." : `${selected.size} ausgewaehlte Karten als PDF`}
              </Button>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-700">
                Kein Manifest, keine Tagvergabe, keine Codes und keine Uebertragung an das Backend.
              </p>
            </div>
          </aside>
        </section>
      )}
    </div>
  )
}
