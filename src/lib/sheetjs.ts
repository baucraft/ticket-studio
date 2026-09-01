export type SheetJSImport = {
  read: (
    data: ArrayBuffer | Uint8Array,
    opts?: Record<string, unknown>,
  ) => {
    SheetNames: string[]
    Sheets: Record<string, unknown>
  }
  utils: {
    sheet_to_json: (
      ws: unknown,
      opts?: Record<string, unknown>,
    ) => Array<Record<string, unknown>> | unknown[][]
  }
  SSF?: {
    parse_date_code?: (v: number) => {
      y: number
      m: number
      d: number
      H?: number
      M?: number
      S?: number
    } | null
  }
}

let cached: SheetJSImport | null = null

type SheetJSGlobal = typeof globalThis & {
  __sheetjs?: SheetJSImport
  __sheetjsPromise?: Promise<SheetJSImport>
  XLSX?: SheetJSImport
}

export async function getSheetJS(): Promise<SheetJSImport> {
  if (cached) return cached

  const g = globalThis as SheetJSGlobal

  // Prefer the loader-initialized global for offline + supply-chain stability.
  if (g.__sheetjs) {
    cached = g.__sheetjs
    return cached
  }

  if (g.__sheetjsPromise) {
    cached = await g.__sheetjsPromise
    g.__sheetjs = cached
    return cached
  }

  // Fallback for standalone builds.
  if (g.XLSX) {
    cached = g.XLSX
    g.__sheetjs = cached
    return cached
  }

  throw new Error("The vendored SheetJS loader is unavailable")
}
