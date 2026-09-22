import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Download,
  FileOutput,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"

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
import {
  PilotApi,
  PilotApiError,
  createPilotRequestId,
  type PilotPrintPreparation,
  type PilotPrintRequest,
  type PilotPlanCard,
  type PilotProjectState,
  type PilotRevision,
  type PilotSession,
} from "@/lib/pilot-api"
import {
  cardMetaLine,
  cardVisibleMetaLine,
  COMPLETED_BACKGROUND_CSS,
} from "@/lib/pilot-card-layout"
import {
  createPilotBoardMarkerPdf,
  createPilotCardsPdf,
  downloadPilotPdf,
} from "@/lib/pilot-print-pdf"
import {
  assertPilotPrintPreparation,
  EMPTY_PILOT_CARD_FILTERS,
  filterPilotCards,
  mergePilotCardSelection,
  normalizePilotFilters,
  PILOT_BOARD_CAPACITY,
  pilotActiveCards,
  pilotCardIdsForPdf,
  pilotCardDisposition,
  pilotCardsInScope,
  pilotCardsToPrint,
  pilotFacetOptions,
  type PilotCardFacet,
  type PilotCardFilters,
} from "@/lib/pilot-workflow"

const api = new PilotApi()
const PAGE_SIZE = 100

type BoardScope = {
  key: string
  boardId: string
  label: string
  start: string
  end: string
  cardIds: string[]
  page: number
  filters: PilotCardFilters
  previewId: string | null
  previewDone: boolean
}

type Notice = { tone: "error" | "info" | "success"; message: string; details?: string }

const DELTA_LABELS = {
  new: "Neu",
  changed: "Geaendert",
  unchanged: "Unveraendert",
  outside_forecast: "Ausserhalb des Zeitraums",
  removed_or_unclear: "Fehlt / klaeren",
  removed_confirmed: "Entfernung bestaetigt",
  parent_conflict: "Zuordnung widerspruechlich",
} as const

const DISPOSITION_LABELS = {
  new_print: "Neu drucken",
  replacement_print: "Ersatzdruck erforderlich",
  reuse: "Vorhandene Karte wiederverwenden",
  outside: "Ausserhalb des Zeitraums",
  clarify: "Vor Druck klaeren",
} as const

const FIELD_LABELS: Record<string, string> = {
  activity: "Vorgang",
  area: "Bereich",
  company: "Firma",
  date: "Termin",
  sourceStatus: "Status",
  task: "Aufgabe",
  trade: "Gewerk",
}

const FILTER_LABELS: Record<PilotCardFacet, string> = {
  area: "Bereich",
  trade: "Gewerk",
  process: "Vorgang",
  week: "ISO-Woche",
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function initialForecast() {
  const start = new Date()
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 13)
  return { start: isoDate(start), end: isoDate(end) }
}

function boardScope(index: number, revision?: PilotRevision): BoardScope {
  const fallback = initialForecast()
  return {
    key: crypto.randomUUID(),
    boardId: `tafel-${index}`,
    label: `Tafel ${index}`,
    start: revision?.source.forecastStart ?? fallback.start,
    end: revision?.source.forecastEnd ?? fallback.end,
    cardIds: [],
    page: 0,
    filters: { ...EMPTY_PILOT_CARD_FILTERS },
    previewId: revision?.source.cards[0]?.sourcePlanCardId ?? null,
    previewDone: false,
  }
}

function MultiSelectFilter({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string[]
  options: Array<{ value: string; label: string }>
  disabled: boolean
  onChange: (value: string[]) => void
}) {
  const selectedLabels = options.filter((option) => value.includes(option.value))
  const summary =
    value.length === 0
      ? "Alle"
      : value.length === 1
        ? (selectedLabels[0]?.label ?? "1 ausgewaehlt")
        : `${value.length} ausgewaehlt`
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm disabled:opacity-50"
            aria-label={`${label}: ${summary}`}
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="size-4 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] min-w-64 overflow-y-auto"
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
              key={option.value}
              checked={value.includes(option.value)}
              onCheckedChange={() =>
                onChange(
                  value.includes(option.value)
                    ? value.filter((entry) => entry !== option.value)
                    : [...value, option.value],
                )
              }
              onSelect={(event) => event.preventDefault()}
            >
              {option.label}
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

function PilotCardPreview({ card, done }: { card: PilotPlanCard; done: boolean }) {
  const color = card.tradeColor ?? "#737980"
  const meta = cardVisibleMetaLine(card.sourceActivityId, card.trade, card.area)
  return (
    <div className="mx-auto w-full max-w-[390px]">
      <CardPreview
        title={card.task || card.activity}
        meta={meta}
        color={color}
        completedBackground={COMPLETED_BACKGROUND_CSS}
        rotated={done}
        ariaLabel={
          done ? "LCMD-Karte in Erledigt-Orientierung" : "LCMD-Karte in Aktiv-Orientierung"
        }
        middle={
          <div className="flex min-h-0 flex-col px-4 py-5 text-xs text-slate-700">
            <strong>{card.date}</strong>
            <span className="mt-4 border-b border-slate-300 pb-1">Kommentar</span>
            <span className="mt-5 border-b border-slate-300" />
            <span className="mt-5 border-b border-slate-300" />
          </div>
        }
      />
      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer">Technische Details</summary>
        <div className="mt-1 grid gap-1 font-mono">
          <span>Plankarte {card.sourcePlanCardId}</span>
          <span>Aktivitaet {card.sourceActivityId}</span>
        </div>
      </details>
    </div>
  )
}

function safeFilename(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "tafel"
}

function errorNotice(error: unknown): Notice {
  if (error instanceof PilotApiError) {
    if (error.status === 401)
      return { tone: "error", message: "Die Sitzung ist abgelaufen. Bitte erneut anmelden." }
    if (error.status === 403)
      return { tone: "error", message: "Fuer dieses Projekt fehlt die Berechtigung." }
    if (error.status === 409) {
      const conflict =
        error.code === "revision_conflict"
          ? "Der Projektstand hat sich geaendert. Projekt neu laden und die Auswahl pruefen."
          : error.code === "idempotency_conflict"
            ? "Diese Anfrage wurde bereits mit einer anderen Auswahl gesendet. Bitte neu laden."
            : error.code === "revision_needs_clarification"
              ? "Einige Karten muessen vor dem Druck geklaert werden."
              : "Der aktuelle Stand laesst diese Aktion nicht zu. Bitte neu laden und erneut versuchen."
      return { tone: "error", message: conflict, details: `Fehlercode: ${error.code}` }
    }
    return {
      tone: "error",
      message: "Die Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen.",
      details: `Fehlercode: ${error.code}; Status: ${error.status || "keine Antwort"}`,
    }
  }
  return {
    tone: "error",
    message: "Die Aktion konnte nicht abgeschlossen werden. Bitte erneut versuchen.",
    details: error instanceof Error ? `Technischer Fehler: ${error.name}` : undefined,
  }
}

function Login({
  onLogin,
  onBusyChange,
}: {
  onLogin: (username: string, password: string) => Promise<void>
  onBusyChange: (busy: boolean) => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    onBusyChange(true)
    setError("")
    try {
      await onLogin(username, password)
    } catch (reason) {
      setError(errorNotice(reason).message)
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center">
      <form
        onSubmit={submit}
        className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <Badge className="brand-badge">Studio</Badge>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Persoenlich anmelden</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Ihre Anmeldung wird nur fuer diese geschuetzte Sitzung verwendet.
        </p>
        <div className="mt-6 grid gap-2">
          <Label htmlFor="pilot-username">Benutzername</Label>
          <Input
            id="pilot-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </div>
        <div className="mt-4 grid gap-2">
          <Label htmlFor="pilot-password">Passwort</Label>
          <Input
            id="pilot-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="mt-6 h-11 w-full" disabled={busy}>
          {busy ? "Anmeldung wird geprueft..." : "Anmelden"}
        </Button>
      </form>
    </div>
  )
}

export function PilotView({
  onWorkflowActiveChange,
  onRequestActiveChange,
}: {
  onWorkflowActiveChange?: (active: boolean) => void
  onRequestActiveChange?: (active: boolean) => void
}) {
  const forecast = initialForecast()
  const [auth, setAuth] = useState<"checking" | "anonymous" | "authenticated">("checking")
  const [session, setSession] = useState<PilotSession | null>(null)
  const [projectId, setProjectId] = useState("")
  const [project, setProject] = useState<PilotProjectState | null>(null)
  const [revision, setRevision] = useState<PilotRevision | null>(null)
  const [forecastStart, setForecastStart] = useState(forecast.start)
  const [forecastEnd, setForecastEnd] = useState(forecast.end)
  const [confirmedRemoved, setConfirmedRemoved] = useState<string[]>([])
  const [scopes, setScopes] = useState<BoardScope[]>([])
  const [preparations, setPreparations] = useState<Record<string, PilotPrintPreparation>>({})
  const [printRequests, setPrintRequests] = useState<Record<string, PilotPrintRequest>>({})
  const [pendingSync, setPendingSync] = useState<Parameters<PilotApi["sync"]>[1] | null>(null)
  const [pendingActivation, setPendingActivation] = useState<
    Parameters<PilotApi["activate"]>[1] | null
  >(null)
  const [physicalPlacementConfirmed, setPhysicalPlacementConfirmed] = useState(false)
  const [scopeTouched, setScopeTouched] = useState(false)
  const [busy, setBusy] = useState("")
  const [loginBusy, setLoginBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [deltaPage, setDeltaPage] = useState(0)
  const [deltaExpanded, setDeltaExpanded] = useState(false)
  const workflowVersion = useRef(0)
  const scopeVersions = useRef<Record<string, number>>({})
  const activePrintRequests = useRef<Record<string, string>>({})
  const noticeRef = useRef<HTMLDivElement>(null)

  const invalidatePreparedPlacement = () => {
    workflowVersion.current += 1
    scopeVersions.current = {}
    activePrintRequests.current = {}
    setPreparations({})
    setPrintRequests({})
    setPendingActivation(null)
    setPhysicalPlacementConfirmed(false)
    return workflowVersion.current
  }

  const invalidateScopePreparation = (key: string) => {
    scopeVersions.current[key] = (scopeVersions.current[key] ?? 0) + 1
    delete activePrintRequests.current[key]
    setPreparations((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setPrintRequests((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setPendingActivation(null)
    setPhysicalPlacementConfirmed(false)
  }

  const resetProjectWorkflow = () => {
    invalidatePreparedPlacement()
    setProject(null)
    setRevision(null)
    setScopes([])
    setPendingSync(null)
    setConfirmedRemoved([])
    setDeltaPage(0)
    setDeltaExpanded(false)
    setScopeTouched(false)
  }

  const loadProject = async (nextProjectId = projectId) => {
    if (!nextProjectId) return
    const version = invalidatePreparedPlacement()
    setBusy("project")
    setNotice(null)
    setDeltaPage(0)
    try {
      const state = await api.project(nextProjectId)
      const latest = state.revisions.at(-1)
      const latestRevision = latest ? await api.revision(nextProjectId, latest.revision) : null
      if (version !== workflowVersion.current) return
      setProject(state)
      setRevision(latestRevision)
      setDeltaExpanded(
        Boolean(
          latestRevision?.blocked ||
          latestRevision?.delta.some((item) =>
            ["removed_or_unclear", "parent_conflict"].includes(item.kind),
          ),
        ),
      )
      setScopes(latestRevision ? [boardScope(1, latestRevision)] : [])
      setScopeTouched(false)
      if (latestRevision) {
        setForecastStart(latestRevision.source.forecastStart)
        setForecastEnd(latestRevision.source.forecastEnd)
      }
    } catch (error) {
      if (version !== workflowVersion.current) return
      const nextNotice = errorNotice(error)
      setNotice(nextNotice)
      if (error instanceof PilotApiError && error.status === 401) {
        setAuth("anonymous")
        setSession(null)
      }
    } finally {
      if (version === workflowVersion.current) setBusy("")
    }
  }

  useEffect(() => {
    let current = true
    void api
      .session()
      .then((value) => {
        if (!current) return
        setSession(value)
        setProjectId(value.sourceProjectIds[0] ?? "")
        setAuth("authenticated")
      })
      .catch((error) => {
        if (!current) return
        if (!(error instanceof PilotApiError && error.status === 401)) setNotice(errorNotice(error))
        setAuth("anonymous")
      })
    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    if (auth === "authenticated" && projectId) void loadProject(projectId)
    // Project changes intentionally reload all server-bound workflow state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, projectId])

  useEffect(() => {
    if (notice?.tone === "error") noticeRef.current?.focus()
  }, [notice])

  const login = async (username: string, password: string) => {
    await api.login(username, password)
    const value = await api.session()
    setSession(value)
    setProjectId(value.sourceProjectIds[0] ?? "")
    setAuth("authenticated")
  }

  const logout = async () => {
    setBusy("logout")
    try {
      await api.logout()
    } finally {
      resetProjectWorkflow()
      setSession(null)
      setProjectId("")
      setAuth("anonymous")
      setBusy("")
    }
  }

  const runSync = async (retry = false) => {
    if (!project) return
    invalidatePreparedPlacement()
    const request =
      retry && pendingSync
        ? pendingSync
        : {
            requestId: createPilotRequestId("sync"),
            expectedRevision: project.activeRevision,
            forecastStart,
            forecastEnd,
            confirmedRemovedCardIds: confirmedRemoved,
          }
    setPendingSync(request)
    setBusy("sync")
    setNotice(null)
    try {
      const nextRevision = await api.sync(projectId, request)
      const nextState = await api.project(projectId)
      setRevision(nextRevision)
      setDeltaExpanded(
        nextRevision.blocked ||
          nextRevision.delta.some((item) =>
            ["removed_or_unclear", "parent_conflict"].includes(item.kind),
          ),
      )
      setProject(nextState)
      setScopes((current) => (current.length ? current : [boardScope(1, nextRevision)]))
      setPreparations({})
      setPrintRequests({})
      setPendingActivation(null)
      setPhysicalPlacementConfirmed(false)
      setPendingSync(null)
      setConfirmedRemoved([])
      setDeltaPage(0)
      setNotice({
        tone: "success",
        message: "Die Karten aus LCMD sind auf dem neuesten Stand.",
      })
    } catch (error) {
      setNotice(errorNotice(error))
      if (error instanceof PilotApiError && error.status === 401) setAuth("anonymous")
    } finally {
      setBusy("")
    }
  }

  const updateScope = (key: string, changes: Partial<BoardScope>) => {
    if (Object.keys(changes).some((field) => field !== "page")) setScopeTouched(true)
    setScopes((current) =>
      current.map((scope) => (scope.key === key ? { ...scope, ...changes } : scope)),
    )
    if (["boardId", "start", "end", "cardIds"].some((field) => field in changes)) {
      invalidateScopePreparation(key)
    }
  }

  const removeScope = (key: string) => {
    setScopeTouched(true)
    invalidateScopePreparation(key)
    setScopes((current) => current.filter((scope) => scope.key !== key))
  }

  const reportResetFilters = (before: PilotCardFilters, after: PilotCardFilters) => {
    const reset = (Object.keys(FILTER_LABELS) as PilotCardFacet[]).filter(
      (facet) => before[facet].length > after[facet].length,
    )
    if (reset.length) {
      setNotice({
        tone: "info",
        message: `Nicht mehr passende Filter wurden zurueckgesetzt: ${reset.map((facet) => FILTER_LABELS[facet]).join(", ")}. Ihre Kartenauswahl bleibt erhalten.`,
      })
    }
  }

  const updateScopeFilters = (
    scope: BoardScope,
    cards: readonly PilotPlanCard[],
    changes: Partial<PilotCardFilters>,
    lockedFacet?: PilotCardFacet,
  ) => {
    const requested = { ...scope.filters, ...changes }
    const filters = normalizePilotFilters(cards, requested, lockedFacet)
    reportResetFilters(requested, filters)
    setScopes((current) =>
      current.map((item) => (item.key === scope.key ? { ...item, filters, page: 0 } : item)),
    )
  }

  const updateScopeDates = (
    scope: BoardScope,
    changes: Partial<Pick<BoardScope, "start" | "end">>,
  ) => {
    const next = { ...scope, ...changes }
    const printableIds = new Set(
      revision?.delta
        .filter((item) => ["new", "changed", "unchanged"].includes(item.kind))
        .map((item) => item.sourcePlanCardId) ?? [],
    )
    const cards = revision
      ? pilotCardsInScope(revision.source.cards, next.start, next.end).filter((card) =>
          printableIds.has(card.sourcePlanCardId),
        )
      : []
    const filters = normalizePilotFilters(cards, scope.filters)
    reportResetFilters(scope.filters, filters)
    updateScope(scope.key, { ...changes, filters, page: 0 })
  }

  const addScopeCards = (scope: BoardScope, ids: readonly string[]) => {
    const cardIds = mergePilotCardSelection(scope.cardIds, ids)
    if (!cardIds) {
      setNotice({
        tone: "error",
        message: `Eine Tafel kann hoechstens ${PILOT_BOARD_CAPACITY} Karten enthalten. Auswahl bitte eingrenzen.`,
      })
      return
    }
    updateScope(scope.key, { cardIds })
  }

  const resetScopeFiltering = (scope: BoardScope) => {
    updateScope(scope.key, {
      start: revision?.source.forecastStart ?? scope.start,
      end: revision?.source.forecastEnd ?? scope.end,
      filters: { ...EMPTY_PILOT_CARD_FILTERS },
      page: 0,
    })
  }

  const prepare = async (scope: BoardScope, retry = false) => {
    if (!revision || !project || revision.blocked) return
    if (!scope.boardId.trim() || scope.cardIds.length === 0) {
      setNotice({
        tone: "error",
        message: "Tafelkennung und mindestens eine Karte sind erforderlich.",
      })
      return
    }
    if (scope.cardIds.length > PILOT_BOARD_CAPACITY) {
      setNotice({
        tone: "error",
        message: `Die Tafelauswahl ueberschreitet die Kapazitaet von ${PILOT_BOARD_CAPACITY} Karten.`,
      })
      return
    }
    if (scopes.some((item) => item.key !== scope.key && item.boardId === scope.boardId)) {
      setNotice({
        tone: "error",
        message: "Jede vorbereitete Tafel braucht eine eindeutige Tafelkennung.",
      })
      return
    }
    const request =
      retry && printRequests[scope.key]
        ? printRequests[scope.key]
        : {
            requestId: createPilotRequestId("print"),
            revision: revision.revision,
            boardId: scope.boardId,
            cardIds: scope.cardIds,
          }
    const version = workflowVersion.current
    const scopeVersion = scopeVersions.current[scope.key] ?? 0
    activePrintRequests.current[scope.key] = request.requestId
    if (!retry) {
      setPreparations((current) => {
        const next = { ...current }
        delete next[scope.key]
        return next
      })
      setPendingActivation(null)
      setPhysicalPlacementConfirmed(false)
    }
    setPrintRequests((current) => ({ ...current, [scope.key]: request }))
    setBusy(`prepare-${scope.key}`)
    setNotice(null)
    try {
      const result = await api.preparePrint(projectId, request)
      assertPilotPrintPreparation(result, request, projectId)
      if (
        version !== workflowVersion.current ||
        scopeVersion !== (scopeVersions.current[scope.key] ?? 0) ||
        activePrintRequests.current[scope.key] !== request.requestId
      ) {
        return
      }
      setPreparations((current) => ({ ...current, [scope.key]: result }))
      setNotice({
        tone: "success",
        message: `${scope.label || scope.boardId} ist fuer den Druck bereit.`,
      })
    } catch (error) {
      if (
        version !== workflowVersion.current ||
        scopeVersion !== (scopeVersions.current[scope.key] ?? 0) ||
        activePrintRequests.current[scope.key] !== request.requestId
      ) {
        return
      }
      if (error instanceof PilotApiError && error.status === 409) invalidatePreparedPlacement()
      setNotice(errorNotice(error))
      if (error instanceof PilotApiError && error.status === 401) setAuth("anonymous")
    } finally {
      setBusy("")
    }
  }

  const downloadCards = async (scope: BoardScope, preparation: PilotPrintPreparation) => {
    if (!revision || !project) return
    const ids = pilotCardIdsForPdf(preparation, revision, project)
    const version = workflowVersion.current
    setBusy(`pdf-${scope.key}`)
    try {
      const bytes = await createPilotCardsPdf(preparation, ids)
      if (version !== workflowVersion.current) return
      downloadPilotPdf(
        bytes,
        `pilot-${safeFilename(scope.boardId)}-karten-r${revision.revision}.pdf`,
      )
    } catch (error) {
      if (version !== workflowVersion.current) return
      setNotice(errorNotice(error))
    } finally {
      if (version === workflowVersion.current) setBusy("")
    }
  }

  const downloadMarker = async (scope: BoardScope, preparation: PilotPrintPreparation) => {
    const version = workflowVersion.current
    setBusy(`marker-${scope.key}`)
    try {
      const bytes = await createPilotBoardMarkerPdf(preparation)
      if (version !== workflowVersion.current) return
      downloadPilotPdf(bytes, `pilot-${safeFilename(scope.boardId)}-tafelmarker.pdf`)
    } catch (error) {
      if (version !== workflowVersion.current) return
      setNotice(errorNotice(error))
    } finally {
      if (version === workflowVersion.current) setBusy("")
    }
  }

  const activatePlacement = async (retry = false) => {
    if (!revision || !project) return
    const prepared = scopes
      .map((scope) => preparations[scope.key])
      .filter((value): value is PilotPrintPreparation => Boolean(value))
    if (prepared.length === 0 || !physicalPlacementConfirmed) return
    const request =
      retry && pendingActivation
        ? pendingActivation
        : {
            requestId: createPilotRequestId("activate"),
            revision: revision.revision,
            expectedRevision: project.activeRevision,
            printRequestIds: prepared.map((item) => item.requestId),
            physicalPlacementConfirmed: true as const,
          }
    setPendingActivation(request)
    setBusy("activate")
    setNotice(null)
    try {
      await api.activate(projectId, request)
      const nextState = await api.project(projectId)
      if (nextState.activeRevision !== revision.revision) {
        throw new Error(
          "Die aktivierte Platzierung wurde nicht als aktiver Projektstand bestaetigt.",
        )
      }
      setProject(nextState)
      setScopes((current) => current.map((scope) => ({ ...scope, cardIds: [] })))
      setPreparations({})
      setPrintRequests({})
      setPendingActivation(null)
      setPhysicalPlacementConfirmed(false)
      setScopeTouched(false)
      setNotice({
        tone: "success",
        message: "Der bestaetigte Stand ist jetzt aktiv.",
      })
    } catch (error) {
      if (error instanceof PilotApiError && error.status === 409) invalidatePreparedPlacement()
      setNotice(errorNotice(error))
      if (error instanceof PilotApiError && error.status === 401) setAuth("anonymous")
    } finally {
      setBusy("")
    }
  }

  const preparedCount = scopes.filter((scope) => preparations[scope.key]).length
  const scopeLocked = Boolean(busy)
  const forecastTouched = Boolean(
    revision &&
    (forecastStart !== revision.source.forecastStart ||
      forecastEnd !== revision.source.forecastEnd),
  )
  const workflowActive = Boolean(
    busy ||
    pendingSync ||
    pendingActivation ||
    physicalPlacementConfirmed ||
    scopeTouched ||
    forecastTouched ||
    confirmedRemoved.length ||
    preparedCount ||
    scopes.some((scope) => scope.cardIds.length > 0),
  )

  useEffect(() => {
    onWorkflowActiveChange?.(workflowActive)
  }, [onWorkflowActiveChange, workflowActive])

  useEffect(() => {
    onRequestActiveChange?.(auth === "checking" || loginBusy || Boolean(busy))
  }, [auth, busy, loginBusy, onRequestActiveChange])

  useEffect(
    () => () => {
      workflowVersion.current += 1
      onWorkflowActiveChange?.(false)
      onRequestActiveChange?.(false)
    },
    [onRequestActiveChange, onWorkflowActiveChange],
  )

  if (auth === "checking") {
    return (
      <div
        className="grid min-h-[55vh] place-items-center text-sm text-slate-600"
        role="status"
        aria-live="polite"
      >
        Sitzung wird geprueft...
      </div>
    )
  }
  if (auth === "anonymous") return <Login onLogin={login} onBusyChange={setLoginBusy} />

  const deltaById = new Map(revision?.delta.map((item) => [item.sourcePlanCardId, item]))
  const cardsById = new Map(revision?.source.cards.map((card) => [card.sourcePlanCardId, card]))
  const activeCards = project ? pilotActiveCards(project) : new Map()
  const allAssigned = new Map<string, string>()
  for (const scope of scopes) for (const id of scope.cardIds) allAssigned.set(id, scope.key)
  const deltaCounts = Object.fromEntries(
    Object.keys(DELTA_LABELS).map((kind) => [
      kind,
      revision?.delta.filter((item) => item.kind === kind).length ?? 0,
    ]),
  )
  const deltaPages = Math.max(1, Math.ceil((revision?.delta.length ?? 0) / PAGE_SIZE))
  const visibleDelta =
    revision?.delta.slice(deltaPage * PAGE_SIZE, (deltaPage + 1) * PAGE_SIZE) ?? []
  return (
    <div className="pilot-workflow space-y-5 pb-10 text-slate-900" aria-busy={Boolean(busy)}>
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge className="brand-badge">Studio</Badge>
              {project?.synthetic && (
                <Badge variant="outline" className="border-amber-300 text-amber-800">
                  Testdaten
                </Badge>
              )}
            </div>
            <p className="brand-kicker mt-4 text-xs font-semibold tracking-[0.2em] uppercase">
              LCMD-Karten vorbereiten
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Zeitraum waehlen, Karten drucken, Tafeln bestaetigen.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
              Die Daten in LCMD werden dabei nicht veraendert.
            </p>
          </div>
          <div className="min-w-64 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <span className="text-xs text-slate-500">Angemeldet als</span>
            <strong className="mt-1 block">{session?.username}</strong>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              onClick={() => void logout()}
              disabled={Boolean(busy)}
            >
              <LogOut /> Abmelden
            </Button>
          </div>
        </div>
      </header>

      {notice && (
        <div
          ref={noticeRef}
          className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live={notice.tone === "error" ? "assertive" : "polite"}
          tabIndex={notice.tone === "error" ? -1 : undefined}
        >
          {notice.tone === "error" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          )}
          <div className="min-w-0">
            <span>{notice.message}</span>
            {notice.details && (
              <details className="mt-1 text-xs opacity-80">
                <summary className="cursor-pointer">Technische Details</summary>
                <span className="font-mono">{notice.details}</span>
              </details>
            )}
          </div>
          {notice.tone === "error" && projectId && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={scopeLocked}
              onClick={() => void loadProject()}
            >
              <RefreshCw /> Neu laden
            </Button>
          )}
        </div>
      )}

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(220px,0.7fr)_minmax(420px,1.5fr)_auto] lg:items-start">
        <div className="grid gap-2">
          <Label htmlFor="pilot-project">Projekt</Label>
          <select
            id="pilot-project"
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={projectId}
            disabled={scopeLocked}
            onChange={(event) => {
              resetProjectWorkflow()
              setProjectId(event.target.value)
            }}
          >
            {session?.sourceProjectIds.map((id) => (
              <option key={id} value={id}>
                {session.projectNames?.[id] ||
                  (project?.sourceProjectId === id ? project.sourceProjectName : null) ||
                  "Projektname fehlt"}
              </option>
            ))}
          </select>
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer">Technische Details</summary>
            <span className="font-mono">Projekt {projectId}</span>
          </details>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="forecast-start">Zeitraum von</Label>
            <Input
              id="forecast-start"
              type="date"
              className="h-10"
              value={forecastStart}
              disabled={scopeLocked}
              onChange={(event) => {
                setForecastStart(event.target.value)
                setPendingSync(null)
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="forecast-end">Zeitraum bis</Label>
            <Input
              id="forecast-end"
              type="date"
              className="h-10"
              value={forecastEnd}
              disabled={scopeLocked}
              onChange={(event) => {
                setForecastEnd(event.target.value)
                setPendingSync(null)
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:pt-7">
          <Button
            className="h-10"
            onClick={() => void runSync()}
            disabled={!project || scopeLocked || forecastEnd < forecastStart}
          >
            <RefreshCw /> {busy === "sync" ? "Karten werden geladen..." : "Karten aus LCMD laden"}
          </Button>
          {pendingSync && (
            <Button
              variant="outline"
              className="h-10"
              onClick={() => void runSync(true)}
              disabled={scopeLocked}
            >
              <RotateCcw /> Gleich wiederholen
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="brand-kicker text-xs font-semibold tracking-wider uppercase">
              01 / Pruefen
            </p>
            <h2 className="mt-1 text-xl font-semibold">Aenderungen</h2>
            <p className="mt-1 text-sm text-slate-600">
              {revision
                ? "Pruefen Sie nur bei Bedarf die Unterschiede zum letzten Stand."
                : "Laden Sie zuerst Karten aus LCMD."}
            </p>
          </div>
          {revision?.blocked && (
            <Badge variant="destructive">Druck bis zur Klaerung gesperrt</Badge>
          )}
        </div>
        {!revision && (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Zeitraum waehlen und Karten aus LCMD laden.
          </div>
        )}
        {revision && (
          <details
            key={revision.revision}
            className="mt-4"
            open={deltaExpanded}
            onToggle={(event) => setDeltaExpanded(event.currentTarget.open)}
          >
            <summary className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium">
              {revision.blocked ? "Klaerung erforderlich" : "Zusammenfassung anzeigen"} (
              {revision.delta.length})
            </summary>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
              {Object.entries(DELTA_LABELS).map(([kind, label]) => (
                <div key={kind} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <strong className="font-mono text-lg">{deltaCounts[kind]}</strong>
                  <span className="mt-1 block text-xs text-slate-600">{label}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs text-slate-600">
                    <th scope="col" className="p-3">
                      Status
                    </th>
                    <th scope="col" className="p-3">
                      Karte
                    </th>
                    <th scope="col" className="p-3">
                      Termin
                    </th>
                    <th scope="col" className="p-3">
                      Druckfolge
                    </th>
                    <th scope="col" className="p-3">
                      Klaerung
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleDelta.map((delta) => {
                    const card = cardsById.get(delta.sourcePlanCardId)
                    const disposition = pilotCardDisposition(delta, activeCards, revision.revision)
                    const removable = delta.kind === "removed_or_unclear"
                    const changedLabels = delta.changedFields.flatMap((field) =>
                      FIELD_LABELS[field] ? [FIELD_LABELS[field]] : [],
                    )
                    const technicalFields = delta.changedFields.filter(
                      (field) => !FIELD_LABELS[field],
                    )
                    return (
                      <tr
                        key={delta.sourcePlanCardId}
                        className="border-b border-slate-100 align-top"
                      >
                        <td className="p-3">
                          <Badge
                            variant="secondary"
                            className={
                              delta.kind === "new"
                                ? "bg-emerald-100 text-emerald-800"
                                : delta.kind === "changed"
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-slate-100 text-slate-700"
                            }
                          >
                            {DELTA_LABELS[delta.kind]}
                          </Badge>
                          {changedLabels.length > 0 && (
                            <span className="mt-1 block text-xs text-slate-500">
                              Geaendert: {changedLabels.join(", ")}
                            </span>
                          )}
                          {technicalFields.length > 0 && (
                            <details className="mt-1 text-xs text-slate-500">
                              <summary className="cursor-pointer">Weitere Aenderungen</summary>
                              <span className="font-mono">{technicalFields.join(", ")}</span>
                            </details>
                          )}
                        </td>
                        <td className="p-3">
                          <strong>{card?.activity ?? "Nicht mehr im Export"}</strong>
                          <details className="mt-1 text-xs text-slate-500">
                            <summary className="cursor-pointer">Technische Bindung</summary>
                            <span className="font-mono">
                              {projectId} / {delta.sourcePlanCardId}
                            </span>
                          </details>
                        </td>
                        <td className="p-3">{card?.date ?? "-"}</td>
                        <td className="p-3">
                          <span
                            className={
                              disposition === "replacement_print"
                                ? "font-semibold text-amber-800"
                                : disposition === "reuse"
                                  ? "font-semibold text-emerald-700"
                                  : "text-slate-700"
                            }
                          >
                            {DISPOSITION_LABELS[disposition]}
                          </span>
                          {activeCards.get(delta.sourcePlanCardId) && (
                            <span className="mt-1 block text-xs text-slate-500">
                              Bisher: {activeCards.get(delta.sourcePlanCardId)?.boardId}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {removable ? (
                            <label className="flex min-h-10 cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={confirmedRemoved.includes(delta.sourcePlanCardId)}
                                onChange={() => {
                                  setConfirmedRemoved((current) =>
                                    current.includes(delta.sourcePlanCardId)
                                      ? current.filter((id) => id !== delta.sourcePlanCardId)
                                      : [...current, delta.sourcePlanCardId],
                                  )
                                }}
                              />
                              <span>Fehlen manuell bestaetigen</span>
                            </label>
                          ) : delta.kind === "parent_conflict" ? (
                            <span className="text-red-700">Zuordnung in LCMD klaeren</span>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {deltaPages > 1 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {revision.delta.length} Karten, Seite {deltaPage + 1}/{deltaPages}
                  </span>
                  <div className="flex gap-2 [&>button]:!w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deltaPage === 0}
                      onClick={() => setDeltaPage((page) => page - 1)}
                    >
                      Zurueck
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deltaPage + 1 >= deltaPages}
                      onClick={() => setDeltaPage((page) => page + 1)}
                    >
                      Weiter
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </details>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="brand-kicker text-xs font-semibold tracking-wider uppercase">
              02 / Tafeln
            </p>
            <h2 className="mt-1 text-xl font-semibold">Tafeln vorbereiten</h2>
            <p className="mt-1 text-sm text-slate-600">
              Zeitraum eingrenzen, passende Karten filtern und fuer den Druck auswaehlen.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setScopeTouched(true)
              setScopes((current) => [
                ...current,
                boardScope(current.length + 1, revision ?? undefined),
              ])
            }}
            disabled={!revision || scopeLocked}
          >
            <Plus /> Tafel hinzufuegen
          </Button>
        </div>
        <div className="mt-5 grid gap-5">
          {scopes.map((scope, scopeIndex) => {
            const fieldPrefix = `pilot-board-${scopeIndex}`
            const scoped = revision
              ? pilotCardsInScope(revision.source.cards, scope.start, scope.end).filter((card) => {
                  const delta = deltaById.get(card.sourcePlanCardId)
                  return delta && ["new", "changed", "unchanged"].includes(delta.kind)
                })
              : []
            const filtered = filterPilotCards(scoped, scope.filters)
            const areas = pilotFacetOptions(scoped, scope.filters, "area")
            const trades = pilotFacetOptions(scoped, scope.filters, "trade")
            const processes = pilotFacetOptions(scoped, scope.filters, "process")
            const weeks = pilotFacetOptions(scoped, scope.filters, "week")
            const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
            const page = Math.min(scope.page, pages - 1)
            const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
            const preview =
              revision?.source.cards.find((card) => card.sourcePlanCardId === scope.previewId) ??
              filtered[0] ??
              null
            const selectedIds = new Set(scope.cardIds)
            const filteredIds = new Set(filtered.map((card) => card.sourcePlanCardId))
            const selectedVisible = filtered.filter((card) =>
              selectedIds.has(card.sourcePlanCardId),
            ).length
            const selectedHidden = scope.cardIds.filter((id) => !filteredIds.has(id)).length
            const preparation = preparations[scope.key]
            const paperIds =
              preparation && revision && project
                ? pilotCardsToPrint(preparation, revision, project)
                : []
            const markerReused =
              preparation &&
              project &&
              "boards" in project.activePlacement &&
              project.activePlacement.boards[scope.boardId]?.boardMarkerId ===
                preparation.boardMarkerId
            return (
              <article
                key={scope.key}
                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5"
                data-testid="pilot-board"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="brand-kicker font-mono text-xs">
                      TAFEL {String(scopeIndex + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-1 font-semibold">{scope.label || scope.boardId}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={scopeLocked}
                    onClick={() => removeScope(scope.key)}
                  >
                    <Trash2 /> Entfernen
                  </Button>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-4">
                  <div className="grid gap-2">
                    <Label htmlFor={`${fieldPrefix}-id`}>Tafelkennung</Label>
                    <Input
                      id={`${fieldPrefix}-id`}
                      value={scope.boardId}
                      maxLength={128}
                      disabled={scopeLocked}
                      onChange={(event) =>
                        updateScope(scope.key, { boardId: event.target.value.trim(), page: 0 })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${fieldPrefix}-label`}>Anzeigename</Label>
                    <Input
                      id={`${fieldPrefix}-label`}
                      value={scope.label}
                      disabled={scopeLocked}
                      onChange={(event) => updateScope(scope.key, { label: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${fieldPrefix}-start`}>Karten von</Label>
                    <Input
                      id={`${fieldPrefix}-start`}
                      type="date"
                      value={scope.start}
                      disabled={scopeLocked}
                      onChange={(event) => updateScopeDates(scope, { start: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`${fieldPrefix}-end`}>Karten bis</Label>
                    <Input
                      id={`${fieldPrefix}-end`}
                      type="date"
                      value={scope.end}
                      disabled={scopeLocked}
                      onChange={(event) => updateScopeDates(scope, { end: event.target.value })}
                    />
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <MultiSelectFilter
                    id={`${fieldPrefix}-area`}
                    label="Bereich"
                    value={scope.filters.area}
                    options={areas}
                    disabled={scopeLocked}
                    onChange={(area) => updateScopeFilters(scope, scoped, { area }, "area")}
                  />
                  <MultiSelectFilter
                    id={`${fieldPrefix}-trade`}
                    label="Gewerk"
                    value={scope.filters.trade}
                    options={trades}
                    disabled={scopeLocked}
                    onChange={(trade) => updateScopeFilters(scope, scoped, { trade }, "trade")}
                  />
                  <MultiSelectFilter
                    id={`${fieldPrefix}-process`}
                    label="Vorgang"
                    value={scope.filters.process}
                    options={processes}
                    disabled={scopeLocked}
                    onChange={(process) =>
                      updateScopeFilters(scope, scoped, { process }, "process")
                    }
                  />
                  <MultiSelectFilter
                    id={`${fieldPrefix}-week`}
                    label="ISO-Woche"
                    value={scope.filters.week}
                    options={weeks}
                    disabled={scopeLocked}
                    onChange={(week) => updateScopeFilters(scope, scoped, { week }, "week")}
                  />
                  <div className="grid min-w-0 gap-1.5">
                    <Label htmlFor={`${fieldPrefix}-search`} className="text-xs">
                      Freitext
                    </Label>
                    <div className="relative">
                      <Search className="absolute top-3 left-3 size-4 text-slate-500" />
                      <Input
                        id={`${fieldPrefix}-search`}
                        type="search"
                        className="pl-9"
                        value={scope.filters.query}
                        placeholder="Vorgang, Gewerk, Bereich"
                        disabled={scopeLocked}
                        onChange={(event) =>
                          updateScopeFilters(scope, scoped, { query: event.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={scopeLocked || filtered.length === 0}
                    onClick={() =>
                      addScopeCards(
                        scope,
                        filtered
                          .filter(
                            (card) =>
                              !allAssigned.has(card.sourcePlanCardId) ||
                              allAssigned.get(card.sourcePlanCardId) === scope.key,
                          )
                          .map((card) => card.sourcePlanCardId),
                      )
                    }
                  >
                    Alle {filtered.length} gefilterten hinzufuegen
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={scopeLocked}
                    onClick={() => updateScope(scope.key, { cardIds: [] })}
                  >
                    Auswahl leeren
                  </Button>
                  <span className="text-sm text-slate-600">
                    {filtered.length} sichtbar / {scope.cardIds.length} ausgewaehlt
                    {selectedHidden > 0 ? `, ${selectedHidden} durch Filter ausgeblendet` : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="pilot-filters-reset"
                    disabled={
                      scopeLocked ||
                      (!scope.filters.query &&
                        (Object.keys(FILTER_LABELS) as PilotCardFacet[]).every(
                          (facet) => scope.filters[facet].length === 0,
                        ))
                    }
                    onClick={() =>
                      updateScopeFilters(scope, scoped, { ...EMPTY_PILOT_CARD_FILTERS })
                    }
                  >
                    Filter zuruecksetzen
                  </Button>
                </div>
                <p
                  className={`mt-3 rounded-lg border px-3 py-2 text-sm ${scope.cardIds.length >= PILOT_BOARD_CAPACITY ? "border-amber-300 bg-amber-50 font-medium text-amber-950" : "border-slate-200 bg-white text-slate-600"}`}
                  role={scope.cardIds.length >= PILOT_BOARD_CAPACITY ? "alert" : "status"}
                  data-testid="pilot-capacity"
                >
                  {scope.cardIds.length} von maximal {PILOT_BOARD_CAPACITY} Karten ausgewaehlt.
                </p>
                <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                  <div className="min-w-0">
                    <div className="max-h-[42rem] overflow-auto rounded-xl border border-slate-200 bg-white">
                      <div className="divide-y divide-slate-100">
                        {visible.map((card) => {
                          const assignedElsewhere =
                            allAssigned.has(card.sourcePlanCardId) &&
                            allAssigned.get(card.sourcePlanCardId) !== scope.key
                          const delta = deltaById.get(card.sourcePlanCardId)!
                          const disposition = pilotCardDisposition(
                            delta,
                            activeCards,
                            revision?.revision,
                          )
                          const checked = selectedIds.has(card.sourcePlanCardId)
                          return (
                            <div
                              key={card.sourcePlanCardId}
                              data-testid="pilot-card-row"
                              className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 p-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${scope.previewId === card.sourcePlanCardId ? "brand-selection" : "bg-white"} ${assignedElsewhere ? "text-slate-500" : ""}`}
                            >
                              <input
                                type="checkbox"
                                data-testid="pilot-card-select"
                                className="brand-checkbox size-5 cursor-pointer disabled:cursor-not-allowed"
                                aria-label={`${card.task || card.activity}, ${cardMetaLine(card.sourceActivityId, card.date, card.trade, card.area)} ${checked ? "abwaehlen" : "auswaehlen"}`}
                                checked={checked}
                                disabled={assignedElsewhere || scopeLocked}
                                onChange={() => {
                                  if (checked) {
                                    updateScope(scope.key, {
                                      cardIds: scope.cardIds.filter(
                                        (id) => id !== card.sourcePlanCardId,
                                      ),
                                    })
                                  } else {
                                    addScopeCards(scope, [card.sourcePlanCardId])
                                  }
                                }}
                              />
                              <button
                                type="button"
                                data-testid="pilot-card-preview"
                                className="brand-interactive grid min-w-0 grid-cols-[4px_minmax(0,1fr)] items-center gap-3 rounded-md px-2 py-1 text-left"
                                onClick={() =>
                                  setScopes((current) =>
                                    current.map((item) =>
                                      item.key === scope.key
                                        ? {
                                            ...item,
                                            previewId: card.sourcePlanCardId,
                                            previewDone: false,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                <span
                                  className="h-8 w-1 rounded-full"
                                  style={{ backgroundColor: card.tradeColor ?? "#737980" }}
                                  aria-hidden="true"
                                />
                                <span className="min-w-0">
                                  <strong className="block text-sm break-words">
                                    {card.task || card.activity}
                                  </strong>
                                  <span className="mt-1 block text-xs break-words whitespace-normal text-slate-500">
                                    {cardMetaLine(
                                      card.sourceActivityId,
                                      card.date,
                                      card.trade,
                                      card.area,
                                    )}
                                  </span>
                                </span>
                              </button>
                              <Badge
                                variant="outline"
                                className={`hidden max-w-32 whitespace-normal text-center sm:inline-flex ${
                                  disposition === "replacement_print"
                                    ? "border-amber-300 bg-amber-50 text-amber-800"
                                    : disposition === "reuse"
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                      : ""
                                }`}
                              >
                                {DISPOSITION_LABELS[disposition]}
                              </Badge>
                            </div>
                          )
                        })}
                        {filtered.length === 0 && (
                          <div className="p-8 text-center text-sm text-slate-600">
                            <p>Keine Karte passt zu Zeitraum und Filtern.</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              data-testid="pilot-empty-reset"
                              onClick={() => resetScopeFiltering(scope)}
                            >
                              Filter und Zeitraum zuruecksetzen
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    {pages > 1 && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          {filtered.length} von {scoped.length} Karten, Seite {page + 1}/{pages}
                        </span>
                        <div className="flex gap-2 [&>button]:!w-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 0 || scopeLocked}
                            onClick={() => updateScope(scope.key, { page: page - 1 })}
                          >
                            Zurueck
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page + 1 >= pages || scopeLocked}
                            onClick={() => updateScope(scope.key, { page: page + 1 })}
                          >
                            Weiter
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                  <aside
                    className="min-w-0 self-start rounded-xl border border-slate-200 bg-white p-4 xl:sticky xl:top-4"
                    data-testid="pilot-card-preview-panel"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <strong className="block">Kartenvorschau</strong>
                        <span className="text-xs text-slate-500">
                          Vorschau ist keine Druckauswahl.
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="pilot-card-preview-rotate"
                        disabled={!preview}
                        onClick={() =>
                          setScopes((current) =>
                            current.map((item) =>
                              item.key === scope.key
                                ? { ...item, previewDone: !item.previewDone }
                                : item,
                            ),
                          )
                        }
                      >
                        <RotateCw /> 180 Grad
                      </Button>
                    </div>
                    <div className="mt-4">
                      {preview ? (
                        <PilotCardPreview card={preview} done={scope.previewDone} />
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                          Eine Karte aus der Liste fuer die Vorschau oeffnen.
                        </div>
                      )}
                    </div>
                    <p
                      className="mt-4 text-xs text-slate-600"
                      data-testid="pilot-selection-summary"
                    >
                      {selectedVisible} sichtbar ausgewaehlt / {scope.cardIds.length} insgesamt /{" "}
                      maximal {PILOT_BOARD_CAPACITY}
                    </p>
                  </aside>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                  <Button
                    disabled={revision?.blocked || scope.cardIds.length === 0 || scopeLocked}
                    onClick={() => void prepare(scope)}
                  >
                    <FileOutput /> Druck vorbereiten
                  </Button>
                  {printRequests[scope.key] && (
                    <Button
                      variant="outline"
                      disabled={scopeLocked}
                      onClick={() => void prepare(scope, true)}
                    >
                      <RotateCcw /> Druck erneut vorbereiten
                    </Button>
                  )}
                </div>
                {preparation && (
                  <div
                    className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <strong className="text-emerald-900">Fuer den Druck bereit</strong>
                        <p className="mt-1 text-sm text-emerald-800">
                          {paperIds.length} Papierkarten drucken,{" "}
                          {preparation.cards.length - paperIds.length} wiederverwenden. Tafelmarker{" "}
                          {markerReused ? "wiederverwenden" : "drucken"}.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="bg-white"
                          onClick={() => void downloadCards(scope, preparation)}
                          disabled={Boolean(busy)}
                        >
                          <Download /> {paperIds.length === 0 ? "Karten-PDF erneut" : "Karten-PDF"}
                        </Button>
                        <Button
                          variant="outline"
                          className="bg-white"
                          onClick={() => void downloadMarker(scope, preparation)}
                          disabled={Boolean(busy)}
                        >
                          <Download /> Tafelmarker
                        </Button>
                      </div>
                    </div>
                    <details className="mt-3 text-xs text-emerald-900">
                      <summary className="cursor-pointer">Technische Details</summary>
                      <div className="mt-2 grid gap-1 font-mono">
                        <span>Projekt {preparation.sourceProjectId}</span>
                        <span>
                          Revision {preparation.revision} / {preparation.revisionHash}
                        </span>
                        <span>Anforderung {preparation.requestId}</span>
                        <span>Tafelmarker {preparation.boardMarkerId}</span>
                        <span>
                          Familie {preparation.family} / {preparation.layoutVersion}
                        </span>
                      </div>
                    </details>
                  </div>
                )}
              </article>
            )
          })}
          {revision && scopes.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Eine Tafel hinzufuegen, um Karten aus dem gewaehlten Zeitraum vorzubereiten.
            </div>
          )}
        </div>
        {preparedCount > 0 && (
          <div className="brand-callout mt-5 rounded-2xl border p-5">
            <p className="brand-kicker text-xs font-semibold tracking-wider uppercase">
              03 / Abschluss
            </p>
            <h3 className="mt-1 text-lg font-semibold">Tafeln bestaetigen</h3>
            <p className="mt-1 text-sm text-slate-700">
              Erst nach dem Drucken und physischen Umstecken bestaetigen. Nur dann kann der naechste
              Stand vorhandene Karten und Tafelmarker sicher wiederverwenden.
            </p>
            <label className="brand-callout__control mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-white px-4 text-sm">
              <input
                className="brand-checkbox"
                type="checkbox"
                checked={physicalPlacementConfirmed}
                disabled={scopeLocked}
                onChange={(event) => {
                  setPhysicalPlacementConfirmed(event.target.checked)
                  setPendingActivation(null)
                }}
              />
              Alle vorbereiteten Tafeln wurden entsprechend den Ausdrucken physisch gesteckt.
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={!physicalPlacementConfirmed || scopeLocked}
                onClick={() => void activatePlacement()}
              >
                <CheckCircle2 /> Stand bestaetigen
              </Button>
              {pendingActivation && (
                <Button
                  variant="outline"
                  disabled={scopeLocked}
                  onClick={() => void activatePlacement(true)}
                >
                  <RotateCcw /> Bestaetigung wiederholen
                </Button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
