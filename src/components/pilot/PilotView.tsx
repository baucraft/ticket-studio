import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileOutput,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  PilotApi,
  PilotApiError,
  createPilotRequestId,
  type PilotPrintPreparation,
  type PilotPrintRequest,
  type PilotProjectState,
  type PilotRevision,
  type PilotSession,
} from "@/lib/pilot-api"
import {
  createPilotBoardMarkerPdf,
  createPilotCardsPdf,
  downloadPilotPdf,
} from "@/lib/pilot-print-pdf"
import {
  assertPilotPrintPreparation,
  pilotActiveCards,
  pilotCardDisposition,
  pilotCardsInScope,
  pilotCardsToPrint,
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
}

type Notice = { tone: "error" | "info" | "success"; message: string }

const DELTA_LABELS = {
  new: "Neu",
  changed: "Geaendert",
  unchanged: "Unveraendert",
  outside_forecast: "Ausserhalb Forecast",
  removed_or_unclear: "Fehlt / klaeren",
  removed_confirmed: "Entfernung bestaetigt",
  parent_conflict: "Elternbezug widerspruechlich",
} as const

const DISPOSITION_LABELS = {
  new_print: "Neu drucken",
  replacement_print: "Ersatzdruck erforderlich",
  reuse: "Vorhandene Karte wiederverwenden",
  outside: "Ausserhalb Forecast",
  clarify: "Vor Druck klaeren",
} as const

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
  }
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
            ? "Die Anforderungs-ID wurde bereits mit anderem Inhalt verwendet."
            : error.code === "revision_needs_clarification"
              ? "Die Revision enthaelt noch klaerungsbeduerftige Karten."
              : `Konflikt: ${error.code}`
      return { tone: "error", message: conflict }
    }
  }
  return {
    tone: "error",
    message: error instanceof Error ? error.message : "Die Aktion ist fehlgeschlagen.",
  }
}

function Login({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      await onLogin(username, password)
    } catch (reason) {
      setError(errorNotice(reason).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-md place-items-center">
      <form
        onSubmit={submit}
        className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <Badge className="bg-teal-100 text-teal-800">Pilotprodukt</Badge>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Persoenlich anmelden</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Die Anmeldung bleibt in einer geschuetzten Same-Origin-Sitzung. Es wird kein technischer
          Token im Browser gespeichert.
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
        <Button
          type="submit"
          className="mt-6 h-11 w-full bg-teal-700 hover:bg-teal-800"
          disabled={busy}
        >
          {busy ? "Anmeldung wird geprueft..." : "Anmelden"}
        </Button>
      </form>
    </div>
  )
}

export function PilotView() {
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
  const [busy, setBusy] = useState("")
  const [notice, setNotice] = useState<Notice | null>(null)
  const [deltaPage, setDeltaPage] = useState(0)
  const workflowVersion = useRef(0)
  const scopeVersions = useRef<Record<string, number>>({})
  const activePrintRequests = useRef<Record<string, string>>({})

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
      setScopes(latestRevision ? [boardScope(1, latestRevision)] : [])
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
      setProject(nextState)
      setScopes((current) => (current.length ? current : [boardScope(1, nextRevision)]))
      setPreparations({})
      setPrintRequests({})
      setPendingActivation(null)
      setPhysicalPlacementConfirmed(false)
      setPendingSync(null)
      setDeltaPage(0)
      setNotice({
        tone: "success",
        message: `LCMD-Stand als Revision ${nextRevision.revision} synchronisiert.`,
      })
    } catch (error) {
      setNotice(errorNotice(error))
      if (error instanceof PilotApiError && error.status === 401) setAuth("anonymous")
    } finally {
      setBusy("")
    }
  }

  const updateScope = (key: string, changes: Partial<BoardScope>) => {
    setScopes((current) =>
      current.map((scope) => (scope.key === key ? { ...scope, ...changes } : scope)),
    )
    if (["boardId", "start", "end", "cardIds"].some((field) => field in changes)) {
      invalidateScopePreparation(key)
    }
  }

  const removeScope = (key: string) => {
    invalidateScopePreparation(key)
    setScopes((current) => current.filter((scope) => scope.key !== key))
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
        message: `${scope.label || scope.boardId} ist backendgebunden vorbereitet.`,
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
    const ids = pilotCardsToPrint(preparation, revision, project)
    if (ids.length === 0) {
      setNotice({
        tone: "info",
        message:
          "Alle Karten dieser Tafel koennen physisch wiederverwendet werden. Kein Kartendruck erforderlich.",
      })
      return
    }
    setBusy(`pdf-${scope.key}`)
    try {
      const bytes = await createPilotCardsPdf(preparation, ids)
      downloadPilotPdf(
        bytes,
        `pilot-${safeFilename(scope.boardId)}-karten-r${revision.revision}.pdf`,
      )
    } catch (error) {
      setNotice(errorNotice(error))
    } finally {
      setBusy("")
    }
  }

  const downloadMarker = async (scope: BoardScope, preparation: PilotPrintPreparation) => {
    setBusy(`marker-${scope.key}`)
    try {
      const bytes = await createPilotBoardMarkerPdf(preparation)
      downloadPilotPdf(bytes, `pilot-${safeFilename(scope.boardId)}-tafelmarker.pdf`)
    } catch (error) {
      setNotice(errorNotice(error))
    } finally {
      setBusy("")
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
      setNotice({
        tone: "success",
        message: `Revision ${revision.revision} ist nach bestaetigtem physischem Umstecken aktiv.`,
      })
    } catch (error) {
      if (error instanceof PilotApiError && error.status === 409) invalidatePreparedPlacement()
      setNotice(errorNotice(error))
      if (error instanceof PilotApiError && error.status === 401) setAuth("anonymous")
    } finally {
      setBusy("")
    }
  }

  if (auth === "checking") {
    return (
      <div className="grid min-h-[55vh] place-items-center text-sm text-slate-600">
        Sitzung wird geprueft...
      </div>
    )
  }
  if (auth === "anonymous") return <Login onLogin={login} />

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
  const preparedCount = scopes.filter((scope) => preparations[scope.key]).length
  const scopeLocked = busy === "sync" || busy === "activate" || busy.startsWith("prepare-")

  return (
    <div className="space-y-5 pb-10 text-slate-900">
      <header className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-5 text-white shadow-xl sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-teal-200 text-teal-950">Pilotprodukt</Badge>
              {project?.synthetic && (
                <Badge variant="outline" className="border-amber-300 text-amber-200">
                  Synthetischer Speicher
                </Badge>
              )}
            </div>
            <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-teal-300 uppercase">
              LCMD zu physischer Wochenplanung
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Plan verstehen. Tafeln sicher vorbereiten.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-300">
              Quelle bleibt read-only. Kartenidentitaeten, Tagpaare und Tafelmarker kommen
              ausschliesslich aus dem Pilot-Backend.
            </p>
          </div>
          <div className="min-w-64 rounded-xl border border-white/15 bg-white/5 p-4 text-sm">
            <span className="text-xs text-slate-400">Angemeldet als</span>
            <strong className="mt-1 block">{session?.username}</strong>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-slate-600 bg-transparent text-white hover:bg-slate-800"
              onClick={() => void logout()}
              disabled={busy === "logout"}
            >
              <LogOut /> Abmelden
            </Button>
          </div>
        </div>
      </header>

      {notice && (
        <div
          className={`flex items-start gap-2 rounded-xl border p-4 text-sm ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.tone === "error" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{notice.message}</span>
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

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(220px,0.7fr)_minmax(420px,1.5fr)_auto] lg:items-end">
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
                {id}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="forecast-start">Forecast von</Label>
            <Input
              id="forecast-start"
              type="date"
              value={forecastStart}
              disabled={scopeLocked}
              onChange={(event) => {
                setForecastStart(event.target.value)
                setPendingSync(null)
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="forecast-end">Forecast bis</Label>
            <Input
              id="forecast-end"
              type="date"
              value={forecastEnd}
              disabled={scopeLocked}
              onChange={(event) => {
                setForecastEnd(event.target.value)
                setPendingSync(null)
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-10 bg-teal-700 hover:bg-teal-800"
            onClick={() => void runSync()}
            disabled={!project || scopeLocked || forecastEnd < forecastStart}
          >
            <RefreshCw /> {busy === "sync" ? "Synchronisiert..." : "LCMD synchronisieren"}
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
            <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
              01 / Aenderungen
            </p>
            <h2 className="mt-1 text-xl font-semibold">Delta verstehen</h2>
            <p className="mt-1 text-sm text-slate-600">
              Revision {revision?.revision ?? "-"}; aktiver Stand {project?.activeRevision ?? "-"}.
              Technische IDs stehen nur in den Details.
            </p>
          </div>
          {revision?.blocked && (
            <Badge variant="destructive">Druck bis zur Klaerung gesperrt</Badge>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {Object.entries(DELTA_LABELS).map(([kind, label]) => (
            <div key={kind} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <strong className="font-mono text-lg">{deltaCounts[kind]}</strong>
              <span className="mt-1 block text-xs text-slate-600">{label}</span>
            </div>
          ))}
        </div>
        {!revision && (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Noch keine Revision. Forecast waehlen und LCMD manuell synchronisieren.
          </div>
        )}
        {revision && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs text-slate-600">
                  <th className="p-3">Status</th>
                  <th className="p-3">Karte</th>
                  <th className="p-3">Termin</th>
                  <th className="p-3">Druckfolge</th>
                  <th className="p-3">Klaerung</th>
                </tr>
              </thead>
              <tbody>
                {visibleDelta.map((delta) => {
                  const card = cardsById.get(delta.sourcePlanCardId)
                  const disposition = pilotCardDisposition(delta, activeCards)
                  const removable = delta.kind === "removed_or_unclear"
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
                        {delta.changedFields.length > 0 && (
                          <span className="mt-1 block text-xs text-slate-500">
                            {delta.changedFields.join(", ")}
                          </span>
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
                              onChange={() =>
                                setConfirmedRemoved((current) =>
                                  current.includes(delta.sourcePlanCardId)
                                    ? current.filter((id) => id !== delta.sourcePlanCardId)
                                    : [...current, delta.sourcePlanCardId],
                                )
                              }
                            />
                            <span>Fehlen manuell bestaetigen</span>
                          </label>
                        ) : delta.kind === "parent_conflict" ? (
                          <span className="text-red-700">Elternbezug in LCMD klaeren</span>
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
              <div className="mt-4 flex items-center justify-between text-sm">
                <span>
                  {revision.delta.length} Karten, Seite {deltaPage + 1}/{deltaPages}
                </span>
                <div className="flex gap-2">
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
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
              02 / Tafeln
            </p>
            <h2 className="mt-1 text-xl font-semibold">Wochenscopes vorbereiten</h2>
            <p className="mt-1 text-sm text-slate-600">
              Beliebig viele Tafeln; nur bereits von LCMD gelieferte Tageskarten werden gefiltert,
              nie lokal expandiert.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              setScopes((current) => [
                ...current,
                boardScope(current.length + 1, revision ?? undefined),
              ])
            }
            disabled={!revision || scopeLocked}
          >
            <Plus /> Tafel hinzufuegen
          </Button>
        </div>
        <div className="mt-5 grid gap-5">
          {scopes.map((scope, scopeIndex) => {
            const scoped = revision
              ? pilotCardsInScope(revision.source.cards, scope.start, scope.end).filter((card) => {
                  const delta = deltaById.get(card.sourcePlanCardId)
                  return delta && ["new", "changed", "unchanged"].includes(delta.kind)
                })
              : []
            const pages = Math.max(1, Math.ceil(scoped.length / PAGE_SIZE))
            const page = Math.min(scope.page, pages - 1)
            const visible = scoped.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
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
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs text-teal-700">
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
                    <Label>Tafelkennung</Label>
                    <Input
                      value={scope.boardId}
                      maxLength={128}
                      disabled={scopeLocked}
                      onChange={(event) =>
                        updateScope(scope.key, { boardId: event.target.value.trim(), page: 0 })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Anzeigename</Label>
                    <Input
                      value={scope.label}
                      disabled={scopeLocked}
                      onChange={(event) => updateScope(scope.key, { label: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Scope von</Label>
                    <Input
                      type="date"
                      value={scope.start}
                      disabled={scopeLocked}
                      onChange={(event) =>
                        updateScope(scope.key, { start: event.target.value, cardIds: [], page: 0 })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Scope bis</Label>
                    <Input
                      type="date"
                      value={scope.end}
                      disabled={scopeLocked}
                      onChange={(event) =>
                        updateScope(scope.key, { end: event.target.value, cardIds: [], page: 0 })
                      }
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={scopeLocked}
                    onClick={() =>
                      updateScope(scope.key, {
                        cardIds: scoped
                          .filter(
                            (card) =>
                              !allAssigned.has(card.sourcePlanCardId) ||
                              allAssigned.get(card.sourcePlanCardId) === scope.key,
                          )
                          .map((card) => card.sourcePlanCardId),
                      })
                    }
                  >
                    Alle {scoped.length} verfuegbaren auswaehlen
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={scopeLocked}
                    onClick={() => updateScope(scope.key, { cardIds: [] })}
                  >
                    Auswahl leeren
                  </Button>
                  <span className="text-sm text-slate-600">{scope.cardIds.length} ausgewaehlt</span>
                </div>
                <div className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-slate-200 bg-white">
                  <div className="divide-y divide-slate-100">
                    {visible.map((card) => {
                      const assignedElsewhere =
                        allAssigned.has(card.sourcePlanCardId) &&
                        allAssigned.get(card.sourcePlanCardId) !== scope.key
                      const delta = deltaById.get(card.sourcePlanCardId)!
                      const disposition = pilotCardDisposition(delta, activeCards)
                      return (
                        <label
                          key={card.sourcePlanCardId}
                          className={`grid min-h-14 grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 text-sm ${assignedElsewhere ? "bg-slate-50 text-slate-400" : "cursor-pointer hover:bg-teal-50"}`}
                        >
                          <input
                            type="checkbox"
                            checked={scope.cardIds.includes(card.sourcePlanCardId)}
                            disabled={assignedElsewhere || scopeLocked}
                            onChange={() =>
                              updateScope(scope.key, {
                                cardIds: scope.cardIds.includes(card.sourcePlanCardId)
                                  ? scope.cardIds.filter((id) => id !== card.sourcePlanCardId)
                                  : [...scope.cardIds, card.sourcePlanCardId],
                              })
                            }
                          />
                          <span>
                            <strong className="block">{card.activity}</strong>
                            <small>
                              {card.date} · {card.trade || "ohne Gewerk"}
                            </small>
                          </span>
                          <Badge
                            variant="outline"
                            className={
                              disposition === "replacement_print"
                                ? "border-amber-300 bg-amber-50 text-amber-800"
                                : disposition === "reuse"
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                  : ""
                            }
                          >
                            {DISPOSITION_LABELS[disposition]}
                          </Badge>
                        </label>
                      )
                    })}
                    {scoped.length === 0 && (
                      <div className="p-8 text-center text-sm text-slate-500">
                        Keine vom Backend gelieferten Karten in diesem Datumsbereich.
                      </div>
                    )}
                  </div>
                </div>
                {pages > 1 && (
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span>
                      {scoped.length} Karten ohne 100-Karten-Abschneidung, Seite {page + 1}/{pages}
                    </span>
                    <div className="flex gap-2">
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
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                  <Button
                    className="bg-teal-700 hover:bg-teal-800"
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
                      <RotateCcw /> Identisch erneut anfordern
                    </Button>
                  )}
                </div>
                {preparation && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <strong className="text-emerald-900">Backendbindung steht</strong>
                        <p className="mt-1 text-sm text-emerald-800">
                          {paperIds.length} Papierkarten drucken,{" "}
                          {preparation.cards.length - paperIds.length} wiederverwenden. Tafelmarker
                          ID {preparation.boardMarkerId}:{" "}
                          {markerReused ? "wiederverwenden" : "drucken"}.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="bg-white"
                          onClick={() => void downloadCards(scope, preparation)}
                          disabled={busy === `pdf-${scope.key}`}
                        >
                          <Download /> Karten-PDF
                        </Button>
                        <Button
                          variant="outline"
                          className="bg-white"
                          onClick={() => void downloadMarker(scope, preparation)}
                          disabled={busy === `marker-${scope.key}`}
                        >
                          <Download /> Tafelmarker
                        </Button>
                      </div>
                    </div>
                    <details className="mt-3 text-xs text-emerald-900">
                      <summary className="cursor-pointer">Gebundener Druckvertrag</summary>
                      <div className="mt-2 grid gap-1 font-mono">
                        <span>Projekt {preparation.sourceProjectId}</span>
                        <span>
                          Revision {preparation.revision} / {preparation.revisionHash}
                        </span>
                        <span>Anforderung {preparation.requestId}</span>
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
              Eine Tafel hinzufuegen, um Karten aus dem Forecast vorzubereiten.
            </div>
          )}
        </div>
        {preparedCount > 0 && (
          <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 p-5">
            <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
              03 / Platzierung
            </p>
            <h3 className="mt-1 text-lg font-semibold">Vorbereiteten Stand aktivieren</h3>
            <p className="mt-1 text-sm text-teal-900">
              Erst nach dem Drucken und physischen Umstecken aktivieren. Nur dann kann die naechste
              Revision vorhandene Karten und Tafelmarker sicher als Wiederverwendung erkennen.
            </p>
            <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-teal-200 bg-white px-4 text-sm">
              <input
                type="checkbox"
                checked={physicalPlacementConfirmed}
                disabled={scopeLocked}
                onChange={(event) => {
                  setPhysicalPlacementConfirmed(event.target.checked)
                  setPendingActivation(null)
                }}
              />
              Alle vorbereiteten Tafeln wurden entsprechend den Druckvertraegen physisch gesteckt.
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                className="bg-teal-700 hover:bg-teal-800"
                disabled={!physicalPlacementConfirmed || scopeLocked}
                onClick={() => void activatePlacement()}
              >
                <CheckCircle2 /> Revision aktivieren
              </Button>
              {pendingActivation && (
                <Button
                  variant="outline"
                  disabled={scopeLocked}
                  onClick={() => void activatePlacement(true)}
                >
                  <RotateCcw /> Aktivierung identisch wiederholen
                </Button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
