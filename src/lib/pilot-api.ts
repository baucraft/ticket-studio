export const PILOT_API_BASE = "/api/pilot/v1"

export type PilotSession = {
  username: string
  sourceProjectIds: string[]
  projectNames?: Record<string, string>
}

export type PilotPlanCard = {
  sourcePlanCardId: string
  sourceActivityId: string
  date: string
  activity: string
  task: string | null
  trade: string | null
  company: string | null
  area: string | null
  sourceStatus: string | null
  tradeColor?: string | null
  cardNumber?: number | null
  cardCount?: number | null
}

export type PilotDeltaKind =
  | "new"
  | "changed"
  | "unchanged"
  | "outside_forecast"
  | "removed_or_unclear"
  | "removed_confirmed"
  | "parent_conflict"

export type PilotDelta = {
  sourcePlanCardId: string
  kind: PilotDeltaKind
  changedFields: string[]
  replacementPrintRequired: boolean
}

export type PilotRevision = {
  revision: number
  predecessor: number
  source: {
    sourceProjectId: string
    sourceProjectName?: string | null
    cards: PilotPlanCard[]
    processSha256: string
    cardSha256: string
    processFetchedAt: string
    cardFetchedAt: string
    atomicSnapshot: false
    forecastStart: string
    forecastEnd: string
  }
  delta: PilotDelta[]
  blocked: boolean
}

export type PilotPrintCard = PilotPlanCard & {
  activeTagId: number
  doneTagId: number
}

export type PilotPrintPreparation = {
  schema: "pilot-print-v1"
  requestId: string
  requestHash: string
  sourceProjectId: string
  sourceProjectName?: string | null
  authority: string
  synthetic: boolean
  revision: number
  revisionHash: string
  boardId: string
  boardMarkerId: number
  family: "tagCircle49h12"
  layoutVersion: "tag-only-card-v1-18mm"
  cards: PilotPrintCard[]
}

export type PilotProjectState = {
  profile: "pilot-product-v1"
  sourceProjectId: string
  sourceProjectName?: string | null
  activeRevision: number
  synthetic: boolean
  activePlacement:
    | Record<string, never>
    | { activeRevision: number; boards: Record<string, PilotPrintPreparation> }
  revisions: Array<{ revision: number; predecessor: number; blocked: boolean }>
}

export type PilotSyncRequest = {
  requestId: string
  expectedRevision: number
  forecastStart: string
  forecastEnd: string
  confirmedRemovedCardIds: string[]
}

export type PilotPrintRequest = {
  requestId: string
  revision: number
  boardId: string
  cardIds: string[]
}

export type PilotActivateRequest = {
  requestId: string
  revision: number
  expectedRevision: number
  printRequestIds: string[]
  physicalPlacementConfirmed: true
}

export type PilotActivation = {
  activeRevision: number
  boards: Record<string, PilotPrintPreparation>
}

export class PilotApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

type Fetcher = typeof fetch

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PilotApiError(0, "invalid_api_response")
  }
  return value as Record<string, unknown>
}

function string(value: unknown): string {
  if (typeof value !== "string" || !value) throw new PilotApiError(0, "invalid_api_response")
  return value
}

function integer(value: unknown): number {
  if (!Number.isInteger(value)) throw new PilotApiError(0, "invalid_api_response")
  return value as number
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new PilotApiError(0, "invalid_api_response")
  return value
}

function nullableString(value: unknown): string | null {
  return value === null ? null : string(value)
}

function optionalNullableString(value: unknown): string | null {
  return value === undefined || value === null ? null : string(value)
}

function optionalPositiveInteger(value: unknown): number | null {
  if (value === undefined || value === null) return null
  const parsed = integer(value)
  if (parsed <= 0) throw new PilotApiError(0, "invalid_api_response")
  return parsed
}

function optionalTradeColor(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const parsed = string(value)
  if (!/^#[0-9a-f]{6}$/.test(parsed)) throw new PilotApiError(0, "invalid_api_response")
  return parsed
}

function planCard(value: unknown): PilotPlanCard {
  const source = object(value)
  const cardNumber = optionalPositiveInteger(source.cardNumber)
  const cardCount = optionalPositiveInteger(source.cardCount)
  if (
    (cardNumber === null) !== (cardCount === null) ||
    (cardNumber !== null && cardCount !== null && cardNumber > cardCount)
  ) {
    throw new PilotApiError(0, "invalid_api_response")
  }
  return {
    sourcePlanCardId: string(source.sourcePlanCardId),
    sourceActivityId: string(source.sourceActivityId),
    date: string(source.date),
    activity: string(source.activity),
    task: nullableString(source.task),
    trade: nullableString(source.trade),
    company: nullableString(source.company),
    area: nullableString(source.area),
    sourceStatus: nullableString(source.sourceStatus),
    tradeColor: optionalTradeColor(source.tradeColor),
    cardNumber,
    cardCount,
  }
}

const DELTA_KINDS = new Set<PilotDeltaKind>([
  "new",
  "changed",
  "unchanged",
  "outside_forecast",
  "removed_or_unclear",
  "removed_confirmed",
  "parent_conflict",
])

export function parsePilotRevision(value: unknown): PilotRevision {
  const source = object(value)
  const sourceState = object(source.source)
  if (
    !Array.isArray(sourceState.cards) ||
    !Array.isArray(source.delta) ||
    sourceState.atomicSnapshot !== false
  ) {
    throw new PilotApiError(0, "invalid_api_response")
  }
  const delta = source.delta.map((entry) => {
    const item = object(entry)
    const kind = string(item.kind) as PilotDeltaKind
    if (!DELTA_KINDS.has(kind) || !Array.isArray(item.changedFields)) {
      throw new PilotApiError(0, "invalid_api_response")
    }
    return {
      sourcePlanCardId: string(item.sourcePlanCardId),
      kind,
      changedFields: item.changedFields.map(string),
      replacementPrintRequired: boolean(item.replacementPrintRequired),
    }
  })
  return {
    revision: integer(source.revision),
    predecessor: integer(source.predecessor),
    source: {
      sourceProjectId: string(sourceState.sourceProjectId),
      sourceProjectName: optionalNullableString(sourceState.sourceProjectName),
      cards: sourceState.cards.map(planCard),
      processSha256: string(sourceState.processSha256),
      cardSha256: string(sourceState.cardSha256),
      processFetchedAt: string(sourceState.processFetchedAt),
      cardFetchedAt: string(sourceState.cardFetchedAt),
      atomicSnapshot: false,
      forecastStart: string(sourceState.forecastStart),
      forecastEnd: string(sourceState.forecastEnd),
    },
    delta,
    blocked: boolean(source.blocked),
  }
}

export function parsePilotPrintPreparation(value: unknown): PilotPrintPreparation {
  const source = object(value)
  if (
    source.schema !== "pilot-print-v1" ||
    source.family !== "tagCircle49h12" ||
    source.layoutVersion !== "tag-only-card-v1-18mm" ||
    !Array.isArray(source.cards)
  ) {
    throw new PilotApiError(0, "invalid_api_response")
  }
  const cards = source.cards.map((value) => {
    const item = object(value)
    return {
      ...planCard(item),
      activeTagId: integer(item.activeTagId),
      doneTagId: integer(item.doneTagId),
    }
  })
  if (new Set(cards.map((card) => card.sourcePlanCardId)).size !== cards.length) {
    throw new PilotApiError(0, "invalid_api_response")
  }
  return {
    schema: "pilot-print-v1",
    requestId: string(source.requestId),
    requestHash: string(source.requestHash),
    sourceProjectId: string(source.sourceProjectId),
    sourceProjectName: optionalNullableString(source.sourceProjectName),
    authority: string(source.authority),
    synthetic: boolean(source.synthetic),
    revision: integer(source.revision),
    revisionHash: string(source.revisionHash),
    boardId: string(source.boardId),
    boardMarkerId: integer(source.boardMarkerId),
    family: "tagCircle49h12",
    layoutVersion: "tag-only-card-v1-18mm",
    cards,
  }
}

function parseProjectState(value: unknown): PilotProjectState {
  const source = object(value)
  if (source.profile !== "pilot-product-v1" || !Array.isArray(source.revisions)) {
    throw new PilotApiError(0, "invalid_api_response")
  }
  const activePlacement = object(source.activePlacement)
  let parsedPlacement: PilotProjectState["activePlacement"] = {}
  if (Object.keys(activePlacement).length > 0) {
    const boards = object(activePlacement.boards)
    if (
      activePlacement.activeRevision !== source.activeRevision ||
      Object.keys(boards).length === 0
    ) {
      throw new PilotApiError(0, "invalid_api_response")
    }
    parsedPlacement = {
      activeRevision: integer(activePlacement.activeRevision),
      boards: Object.fromEntries(
        Object.entries(boards).map(([boardId, preparation]) => {
          const parsed = parsePilotPrintPreparation(preparation)
          if (
            parsed.boardId !== boardId ||
            parsed.sourceProjectId !== source.sourceProjectId ||
            parsed.revision !== source.activeRevision
          )
            throw new PilotApiError(0, "invalid_api_response")
          return [boardId, parsed]
        }),
      ),
    }
  }
  return {
    profile: "pilot-product-v1",
    sourceProjectId: string(source.sourceProjectId),
    sourceProjectName: optionalNullableString(source.sourceProjectName),
    activeRevision: integer(source.activeRevision),
    synthetic: boolean(source.synthetic),
    activePlacement: parsedPlacement,
    revisions: source.revisions.map((entry) => {
      const item = object(entry)
      return {
        revision: integer(item.revision),
        predecessor: integer(item.predecessor),
        blocked: boolean(item.blocked),
      }
    }),
  }
}

export function createPilotRequestId(action: "sync" | "print" | "activate"): string {
  return `studio-${action}-${crypto.randomUUID()}`
}

export class PilotApi {
  private readonly fetcher: Fetcher

  constructor(fetcher: Fetcher = (input, init) => fetch(input, init)) {
    this.fetcher = fetcher
  }

  private async call(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.fetcher(`${PILOT_API_BASE}${path}`, {
      ...init,
      credentials: "same-origin",
      headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    })
    if (response.status === 204) return undefined
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new PilotApiError(response.status, "invalid_api_response")
    }
    if (!response.ok) {
      const error = object(payload).error
      throw new PilotApiError(response.status, typeof error === "string" ? error : "request_failed")
    }
    return payload
  }

  async login(username: string, password: string): Promise<{ username: string }> {
    const payload = object(
      await this.call("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),
    )
    return { username: string(payload.username) }
  }

  async session(): Promise<PilotSession> {
    const payload = object(await this.call("/auth/session"))
    if (!Array.isArray(payload.sourceProjectIds)) throw new PilotApiError(0, "invalid_api_response")
    let projectNames: Record<string, string> | undefined
    if (payload.projectNames !== undefined) {
      projectNames = Object.fromEntries(
        Object.entries(object(payload.projectNames)).map(([projectId, name]) => [
          projectId,
          string(name),
        ]),
      )
    }
    return {
      username: string(payload.username),
      sourceProjectIds: payload.sourceProjectIds.map(string),
      ...(projectNames ? { projectNames } : {}),
    }
  }

  async logout(): Promise<void> {
    await this.call("/auth/logout", { method: "POST" })
  }

  async project(sourceProjectId: string): Promise<PilotProjectState> {
    const state = parseProjectState(
      await this.call(`/projects/${encodeURIComponent(sourceProjectId)}`),
    )
    if (state.sourceProjectId !== sourceProjectId) {
      throw new PilotApiError(0, "invalid_api_response")
    }
    return state
  }

  async revision(sourceProjectId: string, revision: number): Promise<PilotRevision> {
    const result = parsePilotRevision(
      await this.call(`/projects/${encodeURIComponent(sourceProjectId)}/revisions/${revision}`),
    )
    if (result.source.sourceProjectId !== sourceProjectId || result.revision !== revision) {
      throw new PilotApiError(0, "invalid_api_response")
    }
    return result
  }

  async sync(sourceProjectId: string, request: PilotSyncRequest): Promise<PilotRevision> {
    const result = parsePilotRevision(
      await this.call(`/projects/${encodeURIComponent(sourceProjectId)}/sync`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    )
    if (result.source.sourceProjectId !== sourceProjectId) {
      throw new PilotApiError(0, "invalid_api_response")
    }
    return result
  }

  async preparePrint(
    sourceProjectId: string,
    request: PilotPrintRequest,
  ): Promise<PilotPrintPreparation> {
    const preparation = parsePilotPrintPreparation(
      await this.call(`/projects/${encodeURIComponent(sourceProjectId)}/print-preparations`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    )
    if (
      preparation.sourceProjectId !== sourceProjectId ||
      preparation.revision !== request.revision ||
      preparation.boardId !== request.boardId ||
      preparation.requestId !== request.requestId ||
      preparation.cards.length !== request.cardIds.length ||
      preparation.cards.some((card, index) => card.sourcePlanCardId !== request.cardIds[index])
    ) {
      throw new PilotApiError(0, "print_identity_mismatch")
    }
    return preparation
  }

  async activate(sourceProjectId: string, request: PilotActivateRequest): Promise<PilotActivation> {
    const payload = object(
      await this.call(`/projects/${encodeURIComponent(sourceProjectId)}/activations`, {
        method: "POST",
        body: JSON.stringify(request),
      }),
    )
    const boards = object(payload.boards)
    const result = {
      activeRevision: integer(payload.activeRevision),
      boards: Object.fromEntries(
        Object.entries(boards).map(([boardId, value]) => {
          const preparation = parsePilotPrintPreparation(value)
          if (
            preparation.boardId !== boardId ||
            preparation.sourceProjectId !== sourceProjectId ||
            preparation.revision !== request.revision
          ) {
            throw new PilotApiError(0, "invalid_api_response")
          }
          return [boardId, preparation]
        }),
      ),
    }
    if (result.activeRevision !== request.revision) {
      throw new PilotApiError(0, "invalid_api_response")
    }
    const responseRequestIds = Object.values(result.boards).map((item) => item.requestId)
    if (
      responseRequestIds.length !== request.printRequestIds.length ||
      request.printRequestIds.some((requestId) => !responseRequestIds.includes(requestId))
    ) {
      throw new PilotApiError(0, "invalid_api_response")
    }
    return result
  }
}
