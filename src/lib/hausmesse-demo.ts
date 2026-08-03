import type { SvgTicketTemplate } from "@/lib/template-types"
import type { ImportTable, TicketData } from "@/lib/ticket-types"

export const HAUSMESSE_CASE_ID = "hausmesse-demo-v1"
export const HAUSMESSE_INPUT_FORMAT = "hausmesse-demo-plan-v1"
export const HAUSMESSE_MANIFEST_FORMAT = "ticket-combined-v1"
export const HAUSMESSE_LAYOUT_VERSION = "combined-v1-demo-field-reference"

export type HausmesseStatus = "active" | "finished"

type HausmesseCompany = {
  id: number
  name: string
}

type HausmesseTrade = {
  id: number
  name: string
  color: string
}

type HausmesseActivity = {
  sourceActivityId: string
  cardId: string
  ticketId: number
  task: string
  companyId: number
  tradeId: number
  initialStatus: HausmesseStatus
  slot: {
    column: number
    row: number
  }
}

export type HausmesseDemoPlan = {
  schemaVersion: 1
  format: typeof HAUSMESSE_INPUT_FORMAT
  contractScope: "non_product_demo"
  projectId: typeof HAUSMESSE_CASE_ID
  projectName: "Hausmesse Demo"
  layoutVersion: typeof HAUSMESSE_LAYOUT_VERSION
  companies: HausmesseCompany[]
  trades: HausmesseTrade[]
  activities: HausmesseActivity[]
}

const TASKS = [
  "Baustelleneinrichtung vorbereiten",
  "Leichtbauwaende stellen",
  "Deckenunterkonstruktion montieren",
  "Brandschutzbekleidung schliessen",
  "Oberflaechen spachteln",
  "Elektrotrassen montieren",
  "Unterverteilung setzen",
  "Kabelzug vorbereiten",
  "Leuchten anschliessen",
  "Funktionspruefung Elektro",
  "Lueftungskanaele montieren",
  "Heizungsleitungen verlegen",
  "Sanitaeranschluesse vorbereiten",
  "TGA-Anlage pruefen",
] as const

const TRADE_ASSIGNMENTS = [
  [101, 201],
  [101, 201],
  [101, 201],
  [101, 201],
  [101, 201],
  [102, 202],
  [102, 202],
  [102, 202],
  [102, 202],
  [102, 202],
  [103, 203],
  [103, 203],
  [103, 203],
  [103, 203],
] as const

export const HAUSMESSE_DEMO_PLAN: HausmesseDemoPlan = {
  schemaVersion: 1,
  format: HAUSMESSE_INPUT_FORMAT,
  contractScope: "non_product_demo",
  projectId: HAUSMESSE_CASE_ID,
  projectName: "Hausmesse Demo",
  layoutVersion: HAUSMESSE_LAYOUT_VERSION,
  companies: [
    { id: 201, name: "Demo Partner A" },
    { id: 202, name: "Demo Partner B" },
    { id: 203, name: "Demo Partner C" },
  ],
  trades: [
    { id: 101, name: "Trockenbau", color: "#3b82f6" },
    { id: 102, name: "Elektro", color: "#f59e0b" },
    { id: 103, name: "TGA", color: "#10b981" },
  ],
  activities: TASKS.map((task, index) => ({
    sourceActivityId: `demo-activity-${String(index + 1).padStart(2, "0")}`,
    cardId: `demo-ticket-${String(index + 1).padStart(2, "0")}`,
    ticketId: 100001 + index,
    task,
    companyId: TRADE_ASSIGNMENTS[index][1],
    tradeId: TRADE_ASSIGNMENTS[index][0],
    initialStatus: (index + 1) % 2 === 0 ? "finished" : "active",
    slot: {
      column: index % 5,
      row: Math.floor(index / 5),
    },
  })),
}

export class HausmesseDemoError extends Error {}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HausmesseDemoError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireExactKeys(value: Record<string, unknown>, keys: string[], label: string) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new HausmesseDemoError(`${label} contains unsupported fields`)
  }
}

function requireInteger(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new HausmesseDemoError(`${label} must be an integer from ${min} to ${max}`)
  }
  return value as number
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HausmesseDemoError(`${label} must be a non-empty string`)
  }
  return value
}

export function validateHausmesseDemoPlan(input: unknown): HausmesseDemoPlan {
  const plan = requireRecord(input, "Demo plan")
  requireExactKeys(
    plan,
    [
      "schemaVersion",
      "format",
      "contractScope",
      "projectId",
      "projectName",
      "layoutVersion",
      "companies",
      "trades",
      "activities",
    ],
    "Demo plan",
  )
  if (
    plan.schemaVersion !== 1 ||
    plan.format !== HAUSMESSE_INPUT_FORMAT ||
    plan.contractScope !== "non_product_demo" ||
    plan.projectId !== HAUSMESSE_CASE_ID ||
    plan.projectName !== "Hausmesse Demo" ||
    plan.layoutVersion !== HAUSMESSE_LAYOUT_VERSION
  ) {
    throw new HausmesseDemoError("Demo plan header differs from the frozen contract")
  }
  if (!Array.isArray(plan.companies) || plan.companies.length !== 3) {
    throw new HausmesseDemoError("Demo plan must contain exactly three companies")
  }
  if (!Array.isArray(plan.trades) || plan.trades.length !== 3) {
    throw new HausmesseDemoError("Demo plan must contain exactly three trades")
  }
  if (!Array.isArray(plan.activities) || plan.activities.length !== 14) {
    throw new HausmesseDemoError("Demo plan must contain exactly 14 activities")
  }

  const companies = plan.companies.map((item, index) => {
    const company = requireRecord(item, `Company ${index + 1}`)
    requireExactKeys(company, ["id", "name"], `Company ${index + 1}`)
    return {
      id: requireInteger(company.id, 0, 999, `Company ${index + 1} id`),
      name: requireString(company.name, `Company ${index + 1} name`),
    }
  })
  const trades = plan.trades.map((item, index) => {
    const trade = requireRecord(item, `Trade ${index + 1}`)
    requireExactKeys(trade, ["id", "name", "color"], `Trade ${index + 1}`)
    const color = requireString(trade.color, `Trade ${index + 1} color`)
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      throw new HausmesseDemoError(`Trade ${index + 1} color must be hexadecimal`)
    }
    return {
      id: requireInteger(trade.id, 0, 999, `Trade ${index + 1} id`),
      name: requireString(trade.name, `Trade ${index + 1} name`),
      color,
    }
  })
  const companyIds = new Set(companies.map((company) => company.id))
  const tradeIds = new Set(trades.map((trade) => trade.id))
  if (companyIds.size !== companies.length || tradeIds.size !== trades.length) {
    throw new HausmesseDemoError("Company and trade ids must be unique")
  }

  const activities = plan.activities.map((item, index) => {
    const activity = requireRecord(item, `Activity ${index + 1}`)
    requireExactKeys(
      activity,
      [
        "sourceActivityId",
        "cardId",
        "ticketId",
        "task",
        "companyId",
        "tradeId",
        "initialStatus",
        "slot",
      ],
      `Activity ${index + 1}`,
    )
    const slot = requireRecord(activity.slot, `Activity ${index + 1} slot`)
    requireExactKeys(slot, ["column", "row"], `Activity ${index + 1} slot`)
    const companyId = requireInteger(activity.companyId, 0, 999, `Activity ${index + 1} companyId`)
    const tradeId = requireInteger(activity.tradeId, 0, 999, `Activity ${index + 1} tradeId`)
    if (!companyIds.has(companyId) || !tradeIds.has(tradeId)) {
      throw new HausmesseDemoError(`Activity ${index + 1} references an unknown company or trade`)
    }
    if (activity.initialStatus !== "active" && activity.initialStatus !== "finished") {
      throw new HausmesseDemoError(`Activity ${index + 1} has an unsupported status`)
    }
    const initialStatus: HausmesseStatus = activity.initialStatus
    return {
      sourceActivityId: requireString(
        activity.sourceActivityId,
        `Activity ${index + 1} sourceActivityId`,
      ),
      cardId: requireString(activity.cardId, `Activity ${index + 1} cardId`),
      ticketId: requireInteger(activity.ticketId, 0, 999999, `Activity ${index + 1} ticketId`),
      task: requireString(activity.task, `Activity ${index + 1} task`),
      companyId,
      tradeId,
      initialStatus,
      slot: {
        column: requireInteger(slot.column, 0, 4, `Activity ${index + 1} slot column`),
        row: requireInteger(slot.row, 0, 2, `Activity ${index + 1} slot row`),
      },
    }
  })

  const unique = (values: unknown[]) => new Set(values).size === values.length
  if (
    !unique(activities.map((activity) => activity.sourceActivityId)) ||
    !unique(activities.map((activity) => activity.cardId)) ||
    !unique(activities.map((activity) => activity.ticketId)) ||
    !unique(activities.map((activity) => `${activity.slot.column}:${activity.slot.row}`))
  ) {
    throw new HausmesseDemoError("Activity ids and slots must be unique")
  }
  const active = activities.filter((activity) => activity.initialStatus === "active").length
  if (active !== 7) {
    throw new HausmesseDemoError("Demo plan must contain seven active and seven finished cards")
  }

  const normalized: HausmesseDemoPlan = {
    schemaVersion: 1,
    format: HAUSMESSE_INPUT_FORMAT,
    contractScope: "non_product_demo",
    projectId: HAUSMESSE_CASE_ID,
    projectName: "Hausmesse Demo",
    layoutVersion: HAUSMESSE_LAYOUT_VERSION,
    companies,
    trades,
    activities,
  }
  if (JSON.stringify(normalized) !== JSON.stringify(HAUSMESSE_DEMO_PLAN)) {
    throw new HausmesseDemoError("Demo plan differs from the frozen Hausmesse data set")
  }
  return normalized
}

function payload(companyId: number, tradeId: number, ticketId: number): string {
  return `${String(companyId).padStart(3, "0")}${String(tradeId).padStart(3, "0")}${String(ticketId).padStart(6, "0")}`
}

const APRILTAG_MODULES = {
  0: [
    "11111111",
    "11101111",
    "11001011",
    "11110101",
    "11110011",
    "10100011",
    "10101001",
    "11111111",
  ],
  1: [
    "11111111",
    "10110111",
    "10100101",
    "11110011",
    "11100001",
    "10001011",
    "11001001",
    "11111111",
  ],
} as const

function modulesToPath(modules: readonly string[]): string {
  return modules
    .flatMap((row, y) =>
      [...row].flatMap((value, x) => (value === "1" ? [`M${x} ${y}h1v1h-1Z`] : [])),
    )
    .join("")
}

export const ACTIVE_APRILTAG_PATH = modulesToPath(APRILTAG_MODULES[0])
export const FINISHED_APRILTAG_PATH = modulesToPath(APRILTAG_MODULES[1])
export const FINISHED_APRILTAG_ROTATED_PATH = modulesToPath(
  [...APRILTAG_MODULES[1]].reverse().map((row) => [...row].reverse().join("")),
)

export async function createHausmesseDemoTickets(
  input: unknown = HAUSMESSE_DEMO_PLAN,
): Promise<TicketData[]> {
  const plan = validateHausmesseDemoPlan(input)
  const { createDataMatrixPaths } = await import("@/lib/hausmesse-demo-barcodes")
  const companies = new Map(plan.companies.map((company) => [company.id, company]))
  const trades = new Map(plan.trades.map((trade) => [trade.id, trade]))
  return plan.activities.map((activity) => {
    const company = companies.get(activity.companyId)!
    const trade = trades.get(activity.tradeId)!
    const encodedPayload = payload(activity.companyId, activity.tradeId, activity.ticketId)
    const { normalPath, rotatedPath } = createDataMatrixPaths(encodedPayload)
    return {
      ticketId: activity.cardId,
      taskId: activity.sourceActivityId,
      taskName: activity.task,
      status: activity.initialStatus,
      company: company.name,
      trade: trade.name,
      tradeColor: trade.color,
      companyId: company.id,
      tradeId: trade.id,
      numericTicketId: activity.ticketId,
      payload: encodedPayload,
      isFinished: activity.initialStatus === "finished",
      dataMatrixPath: normalPath,
      dataMatrixRotatedPath: rotatedPath,
      activeAprilTagPath: ACTIVE_APRILTAG_PATH,
      finishedAprilTagPath: FINISHED_APRILTAG_PATH,
      finishedAprilTagRotatedPath: FINISHED_APRILTAG_ROTATED_PATH,
    }
  })
}

export function createHausmesseDemoImportTable(): ImportTable {
  const plan = validateHausmesseDemoPlan(HAUSMESSE_DEMO_PLAN)
  return {
    fileName: `${HAUSMESSE_INPUT_FORMAT}.json`,
    headers: [
      "sourceActivityId",
      "cardId",
      "ticketId",
      "task",
      "companyId",
      "tradeId",
      "initialStatus",
    ],
    rows: plan.activities.map((activity) => ({ ...activity })),
    sourceKind: "hausmesseDemo",
  }
}

export function createHausmesseManifest(input: unknown = HAUSMESSE_DEMO_PLAN) {
  const plan = validateHausmesseDemoPlan(input)
  return {
    format: HAUSMESSE_MANIFEST_FORMAT,
    manifestVersion: 1,
    contractScope: plan.contractScope,
    projectId: plan.projectId,
    projectName: plan.projectName,
    layout: {
      version: plan.layoutVersion,
      contract: "combined-v1-relative",
      cardWidthMm: 66,
      cardHeightMm: 120,
      visibleHeightMm: 30,
      aprilTagFamily: "tag36h11",
      activeAprilTagId: 0,
      finishedAprilTagId: 1,
      aprilTagSizeMm: 9,
      dataMatrixSizeMm: 11,
      codeGapMm: 0.7,
      labelWidthMm: 25,
      labelHeightMm: 15,
      qualification: "demo_field_reference_not_gate_g4_production_layout",
    },
    companies: plan.companies,
    trades: plan.trades,
    tickets: plan.activities.map((activity) => ({
      cardId: activity.cardId,
      ticketId: activity.ticketId,
      sourceActivityId: activity.sourceActivityId,
      task: activity.task,
      companyId: activity.companyId,
      tradeId: activity.tradeId,
      payload: payload(activity.companyId, activity.tradeId, activity.ticketId),
      initialStatus: activity.initialStatus,
      slot: activity.slot,
    })),
    expected: {
      sourceActive: 7,
      sourceFinished: 7,
      analyzerConfirmed: 13,
      analyzerPartial: 1,
      analyzerMissing: 0,
      analyzerFalse: 0,
      confirmedActive: 6,
      confirmedFinished: 7,
      confirmedByTrade: {
        "101": { finished: 2, total: 5 },
        "102": { finished: 3, total: 5 },
        "103": { finished: 2, total: 3 },
      },
      deliberatePartialCardId: "demo-ticket-13",
      deliberatePartialErrorCode: "DM_NOT_DECODED",
    },
  }
}

export function serializeHausmesseManifest(input: unknown = HAUSMESSE_DEMO_PLAN): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(createHausmesseManifest(input), null, 2)}\n`)
}

export function serializeHausmesseDemoPlan(input: unknown = HAUSMESSE_DEMO_PLAN): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(validateHausmesseDemoPlan(input), null, 2)}\n`)
}

function csvField(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function serializeHausmesseManifestCsv(input: unknown = HAUSMESSE_DEMO_PLAN): Uint8Array {
  const manifest = createHausmesseManifest(input)
  const header = [
    "cardId",
    "ticketId",
    "sourceActivityId",
    "task",
    "companyId",
    "tradeId",
    "payload",
    "initialStatus",
    "slotColumn",
    "slotRow",
  ]
  const rows = manifest.tickets.map((ticket) => [
    ticket.cardId,
    ticket.ticketId,
    ticket.sourceActivityId,
    ticket.task,
    ticket.companyId,
    ticket.tradeId,
    ticket.payload,
    ticket.initialStatus,
    ticket.slot.column,
    ticket.slot.row,
  ])
  return new TextEncoder().encode(
    `${[header, ...rows].map((row) => row.map(csvField).join(",")).join("\n")}\n`,
  )
}

export const HAUSMESSE_DEMO_TEMPLATE: SvgTicketTemplate = {
  id: HAUSMESSE_LAYOUT_VERSION,
  name: "Hausmesse Combined V1 Demo",
  widthMm: 66,
  heightMm: 120,
  svg: `<svg viewBox="0 0 66 120" width="66mm" height="120mm" xmlns="http://www.w3.org/2000/svg">
  <rect width="66" height="120" fill="#fff" stroke="#111827" stroke-width="0.3"/>
  <rect x="0" y="0" width="66" height="30" fill="{{tradeColor}}" fill-opacity="0.12"/>
  <rect x="0" y="0" width="6" height="30" fill="{{tradeColor}}"/>
  <rect x="40" y="1" width="25" height="15" fill="#fff" stroke="#94a3b8" stroke-width="0.15"/>
  <path d="{{activeAprilTagPath}}" transform="translate(42.15 4) scale(1.125)" fill="#000"/>
  <path d="{{dataMatrixPath}}" transform="translate(51.85 3) scale(0.3928571429)" fill="#000" fill-rule="evenodd"/>
  <text x="8" y="7" font-family="Helvetica,Arial,sans-serif" font-size="2.4" font-weight="700" fill="#111827">{{trade}}</text>
  <text x="8" y="12" font-family="Helvetica,Arial,sans-serif" font-size="2" fill="#475569">{{company}}</text>
  <text x="8" y="21" font-family="Helvetica,Arial,sans-serif" font-size="3.2" font-weight="700" fill="#111827" data-wrap-width="56">{{taskName}}</text>
  <text x="8" y="28" font-family="Helvetica,Arial,sans-serif" font-size="1.8" fill="#64748b">{{ticketId}} · AKTIV</text>
  <line x1="0" y1="30" x2="66" y2="30" stroke="#cbd5e1" stroke-width="0.25"/>
  <text x="33" y="56" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="2.2" fill="#64748b">HAUSMESSE DEMO · combined-v1-relative</text>
  <text x="33" y="61" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="2" font-weight="700" fill="#b45309">DEMO-FELDREFERENZ · KEIN PRODUKTIONSLAYOUT</text>
  <g transform="rotate(180 33 60)">
    <rect x="0" y="0" width="66" height="30" fill="{{tradeColor}}" fill-opacity="0.12"/>
    <rect x="0" y="0" width="6" height="30" fill="{{tradeColor}}"/>
    <rect x="40" y="1" width="25" height="15" fill="#fff" stroke="#94a3b8" stroke-width="0.15"/>
    <path d="{{finishedAprilTagPath}}" transform="translate(42.15 4) scale(1.125)" fill="#000"/>
    <path d="{{dataMatrixPath}}" transform="translate(51.85 3) scale(0.3928571429)" fill="#000" fill-rule="evenodd"/>
    <text x="8" y="7" font-family="Helvetica,Arial,sans-serif" font-size="2.4" font-weight="700" fill="#111827">{{trade}}</text>
    <text x="8" y="12" font-family="Helvetica,Arial,sans-serif" font-size="2" fill="#475569">{{company}}</text>
    <text x="8" y="21" font-family="Helvetica,Arial,sans-serif" font-size="3.2" font-weight="700" fill="#111827" data-wrap-width="56">{{taskName}}</text>
    <text x="8" y="28" font-family="Helvetica,Arial,sans-serif" font-size="1.8" fill="#64748b">{{ticketId}} · ERLEDIGT</text>
    <line x1="0" y1="30" x2="66" y2="30" stroke="#cbd5e1" stroke-width="0.25"/>
  </g>
</svg>`,
}
