import { getSheetJS } from "@/lib/sheetjs"
import type { ColumnMapping, ImportSourceKind, ImportTable, TicketData } from "@/lib/ticket-types"

function normalizeHeader(v: unknown) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
}

export function aoaToImportTable(fileName: string, aoa: unknown[][]): ImportTable {
  let headerIndex = aoa.findIndex((row) => row.some((c) => normalizeHeader(c).length > 0))
  if (headerIndex < 0) headerIndex = 0
  const headerRow = aoa[headerIndex] ?? []
  const headers = headerRow.map((h, idx) => {
    const normalized = normalizeHeader(h)
    return normalized.length ? normalized : `__col${idx + 1}`
  })

  const dataRows = aoa
    .slice(headerIndex + 1)
    .filter((row) => row.some((c) => normalizeHeader(c).length > 0))

  const rows: Record<string, unknown>[] = dataRows.map((row) => {
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < headers.length; i += 1) {
      obj[headers[i]] = row[i] ?? null
    }
    return obj
  })

  const sourceKind = detectSourceKind(headers)
  return {
    fileName,
    headers,
    rows,
    sourceKind,
  }
}

function excelSerialToDate(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null

  // Excel 1900 date system with leap-year bug accounted for by using 1899-12-30.
  const epoch = Date.UTC(1899, 11, 30)
  const wholeDays = Math.floor(value)
  const dayMs = wholeDays * 24 * 60 * 60 * 1000
  const fractionMs = Math.round((value - wholeDays) * 24 * 60 * 60 * 1000)
  return new Date(epoch + dayMs + fractionMs)
}

function toIsoDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const dt = excelSerialToDate(value)
  return dt ? dt.toISOString().slice(0, 10) : null
}

function getString(value: unknown) {
  if (value == null) return null
  const s = String(value).trim()
  return s.length ? s : null
}

function detectSourceKind(headers: string[]): ImportSourceKind {
  const set = new Set(headers.map((h) => h.toLowerCase()))
  if (set.has("datum") && (set.has("aufgabe") || set.has("prozess id"))) return "export15"
  if (set.has("startdatum") && set.has("enddatum")) return "export14"
  return "unknown"
}

function pickHeader(headers: string[], candidates: string[]) {
  const lowered = new Map(headers.map((h) => [h.toLowerCase(), h]))
  for (const c of candidates) {
    const found = lowered.get(c.toLowerCase())
    if (found) return found
  }
  return undefined
}

export function suggestMapping(table: ImportTable): ColumnMapping {
  const headers = table.headers

  if (table.sourceKind === "export15") {
    return {
      ticketId: pickHeader(headers, ["Id"]),
      taskId: pickHeader(headers, ["Prozess ID", "ProzessId", "ProzessID", "Id"]),
      taskName: pickHeader(headers, ["Aufgabe", "Prozessname"]),
      date: pickHeader(headers, ["Datum"]),
      status: pickHeader(headers, ["Status"]),
      trade: pickHeader(headers, ["Gewerk"]),
      description: pickHeader(headers, ["Beschreibung"]),
      areaLevel1: pickHeader(headers, ["Bereich Ebene 1"]),
      areaLevel2: pickHeader(headers, ["Bereich Ebene 2"]),
      areaLevel3: pickHeader(headers, ["Bereich Ebene 3"]),
      areaLevel4: pickHeader(headers, ["Bereich Ebene 4"]),
      areaLevel5: pickHeader(headers, ["Bereich Ebene 5"]),
    }
  }

  if (table.sourceKind === "export14") {
    return {
      taskId: pickHeader(headers, ["Id"]),
      taskName: pickHeader(headers, ["Prozessname"]),
      status: pickHeader(headers, ["Status Text", "Status"]),
      trade: pickHeader(headers, ["Gewerk"]),
      tradeColor: pickHeader(headers, ["Gewerk Hintergrundfarbe"]),
      description: pickHeader(headers, ["Kommentare"]),
      areaLevel1: pickHeader(headers, ["Bereich Ebene 1"]),
      areaLevel2: pickHeader(headers, ["Bereich Ebene 2"]),
      areaLevel3: pickHeader(headers, ["Bereich Ebene 3"]),
      areaLevel4: pickHeader(headers, ["Bereich Ebene 4"]),
      areaLevel5: pickHeader(headers, ["Bereich Ebene 5"]),
      areaPath: pickHeader(headers, ["Bereichspfad"]),
      startDate: pickHeader(headers, ["Startdatum"]),
      endDate: pickHeader(headers, ["Enddatum"]),
      duration: pickHeader(headers, ["Dauer"]),
    }
  }

  return {
    taskId: pickHeader(headers, ["Id", "Task ID", "TaskId"]),
    taskName: pickHeader(headers, ["Aufgabe", "Prozessname", "Task"]),
    trade: pickHeader(headers, ["Gewerk", "Trade"]),
    date: pickHeader(headers, ["Datum", "Date"]),
    status: pickHeader(headers, ["Status"]),
    description: pickHeader(headers, ["Beschreibung", "Kommentare"]),
  }
}

function parseRgbString(value: unknown) {
  const s = getString(value)
  if (!s) return null
  const m = s.match(/RGB\((\d{1,3}),(\d{1,3}),(\d{1,3})\)/i)
  if (!m) return null
  const r = Math.max(0, Math.min(255, Number(m[1])))
  const g = Math.max(0, Math.min(255, Number(m[2])))
  const b = Math.max(0, Math.min(255, Number(m[3])))
  const hex = (n: number) => n.toString(16).padStart(2, "0")
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function isWeekend(d: Date) {
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

type GenerateMode = "auto" | "weekdays" | "all-days"

function buildDaySeries(start: Date, end: Date, mode: Exclude<GenerateMode, "auto">) {
  const out: Date[] = []
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  while (cur.getTime() <= last.getTime()) {
    if (mode === "all-days" || !isWeekend(cur)) out.push(new Date(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

function chooseGenerateMode(
  start: Date,
  end: Date,
  duration: unknown,
  preferred: GenerateMode,
): Exclude<GenerateMode, "auto"> {
  if (preferred !== "auto") return preferred

  const expected = typeof duration === "number" && Number.isFinite(duration) ? duration : null
  const allDays = buildDaySeries(start, end, "all-days")
  const weekdays = buildDaySeries(start, end, "weekdays")

  if (expected == null) {
    // If there is no duration hint, assume weekdays (most scheduling exports are working days).
    return "weekdays"
  }

  const diffAll = Math.abs(allDays.length - expected)
  const diffWeek = Math.abs(weekdays.length - expected)
  if (diffWeek < diffAll) return "weekdays"
  if (diffAll < diffWeek) return "all-days"
  return "weekdays"
}

export async function readXlsxToTable(file: File): Promise<ImportTable> {
  const XLSX = await getSheetJS()
  const data = await file.arrayBuffer()
  const wb = XLSX.read(data, { type: "array" })
  const first = wb.SheetNames[0]
  const ws = (wb.Sheets as Record<string, unknown>)[first]

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][]
  return aoaToImportTable(file.name, aoa)
}

export function applyMapping(
  table: ImportTable,
  mapping: ColumnMapping,
  opts: {
    export14DayMode?: GenerateMode
  } = {},
): TicketData[] {
  const out: TicketData[] = []

  if (table.sourceKind === "export15") {
    for (const row of table.rows) {
      const ticketId = getString(mapping.ticketId ? row[mapping.ticketId] : null)
      const taskId = getString(mapping.taskId ? row[mapping.taskId] : null)
      const taskName = getString(mapping.taskName ? row[mapping.taskName] : null)

      if (!taskId || !taskName) continue

      out.push({
        ticketId:
          ticketId ?? `${taskId}:${toIsoDate(mapping.date ? row[mapping.date] : null) ?? ""}`,
        taskId,
        taskName,
        date: toIsoDate(mapping.date ? row[mapping.date] : null) ?? undefined,
        status: getString(mapping.status ? row[mapping.status] : null) ?? undefined,
        company: getString(mapping.company ? row[mapping.company] : null) ?? undefined,
        trade: getString(mapping.trade ? row[mapping.trade] : null) ?? undefined,
        tradeColor:
          parseRgbString(mapping.tradeColor ? row[mapping.tradeColor] : null) ?? undefined,
        description: getString(mapping.description ? row[mapping.description] : null) ?? undefined,
        area: {
          level1: getString(mapping.areaLevel1 ? row[mapping.areaLevel1] : null) ?? undefined,
          level2: getString(mapping.areaLevel2 ? row[mapping.areaLevel2] : null) ?? undefined,
          level3: getString(mapping.areaLevel3 ? row[mapping.areaLevel3] : null) ?? undefined,
          level4: getString(mapping.areaLevel4 ? row[mapping.areaLevel4] : null) ?? undefined,
          level5: getString(mapping.areaLevel5 ? row[mapping.areaLevel5] : null) ?? undefined,
          path: getString(mapping.areaPath ? row[mapping.areaPath] : null) ?? undefined,
        },
        raw: row,
      })
    }
    return out
  }

  if (table.sourceKind === "export14") {
    const dayMode: GenerateMode = opts.export14DayMode ?? "auto"
    for (const row of table.rows) {
      const taskId = getString(mapping.taskId ? row[mapping.taskId] : null)
      const taskName = getString(mapping.taskName ? row[mapping.taskName] : null)
      if (!taskId || !taskName) continue

      const start = excelSerialToDate(mapping.startDate ? row[mapping.startDate] : null)
      const end = excelSerialToDate(mapping.endDate ? row[mapping.endDate] : null)
      if (!start || !end) continue

      const mode = chooseGenerateMode(
        start,
        end,
        mapping.duration ? row[mapping.duration] : null,
        dayMode,
      )
      const dates = buildDaySeries(start, end, mode)
      const status = getString(mapping.status ? row[mapping.status] : null)
      const trade = getString(mapping.trade ? row[mapping.trade] : null)
      const tradeColor = parseRgbString(mapping.tradeColor ? row[mapping.tradeColor] : null)
      const description = getString(mapping.description ? row[mapping.description] : null)

      const area = {
        level1: getString(mapping.areaLevel1 ? row[mapping.areaLevel1] : null) ?? undefined,
        level2: getString(mapping.areaLevel2 ? row[mapping.areaLevel2] : null) ?? undefined,
        level3: getString(mapping.areaLevel3 ? row[mapping.areaLevel3] : null) ?? undefined,
        level4: getString(mapping.areaLevel4 ? row[mapping.areaLevel4] : null) ?? undefined,
        level5: getString(mapping.areaLevel5 ? row[mapping.areaLevel5] : null) ?? undefined,
        path: getString(mapping.areaPath ? row[mapping.areaPath] : null) ?? undefined,
      }

      for (const d of dates) {
        const iso = d.toISOString().slice(0, 10)
        out.push({
          ticketId: `${taskId}:${iso}`,
          taskId,
          taskName,
          date: iso,
          status: status ?? undefined,
          company: getString(mapping.company ? row[mapping.company] : null) ?? undefined,
          trade: trade ?? undefined,
          tradeColor: tradeColor ?? undefined,
          description: description ?? undefined,
          area,
          raw: row,
        })
      }
    }
    return out
  }

  // Unknown format - best effort using whatever mapping was provided.
  for (const row of table.rows) {
    const taskId = getString(mapping.taskId ? row[mapping.taskId] : null)
    const taskName = getString(mapping.taskName ? row[mapping.taskName] : null)
    if (!taskId || !taskName) continue
    const date = toIsoDate(mapping.date ? row[mapping.date] : null)

    out.push({
      ticketId:
        getString(mapping.ticketId ? row[mapping.ticketId] : null) ?? `${taskId}:${date ?? ""}`,
      taskId,
      taskName,
      date: date ?? undefined,
      status: getString(mapping.status ? row[mapping.status] : null) ?? undefined,
      company: getString(mapping.company ? row[mapping.company] : null) ?? undefined,
      trade: getString(mapping.trade ? row[mapping.trade] : null) ?? undefined,
      description: getString(mapping.description ? row[mapping.description] : null) ?? undefined,
      raw: row,
    })
  }

  return out
}
