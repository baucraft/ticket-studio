export type ImportSourceKind = "export14" | "export15" | "unknown"

export type TicketArea = {
  level1?: string
  level2?: string
  level3?: string
  level4?: string
  level5?: string
  path?: string
}

export type TicketData = {
  ticketId: string
  taskId: string
  taskName: string
  date?: string
  status?: string
  company?: string
  trade?: string
  tradeColor?: string
  description?: string
  area?: TicketArea
  raw?: Record<string, unknown>
}

export type ImportTable = {
  fileName: string
  headers: string[]
  rows: Record<string, unknown>[]
  sourceKind: ImportSourceKind
}

export type ColumnMapping = {
  ticketId?: string
  taskId?: string
  taskName?: string
  date?: string
  status?: string
  company?: string
  trade?: string
  tradeColor?: string
  description?: string
  areaLevel1?: string
  areaLevel2?: string
  areaLevel3?: string
  areaLevel4?: string
  areaLevel5?: string
  areaPath?: string
  startDate?: string
  endDate?: string
  duration?: string
}

export type TicketGroupKey = {
  company: string
  trade: string
  taskKey: string
}
