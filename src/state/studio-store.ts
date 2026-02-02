import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"
import DOMPurify from "dompurify"

import { applyMapping, readXlsxToTable, suggestMapping } from "@/lib/import-xlsx"
import { DEFAULT_SVG_TEMPLATE } from "@/lib/default-template-svg"
import type { ColumnMapping, ImportTable, TicketData } from "@/lib/ticket-types"
import type { SvgTicketTemplate } from "@/lib/template-types"

export type TemplateWarnings = {
  noMustacheTags: boolean
  unreasonableDimensions: boolean
  invalidSvg: boolean
}

export type Export14DayMode = "auto" | "weekdays" | "all-days"

export type TicketFilter = {
  company?: string
  trade?: string
  taskId?: string
}

type StudioState = {
  importTable: ImportTable | null
  mapping: ColumnMapping | null
  export14DayMode: Export14DayMode

  tickets: TicketData[]
  selectedTicketId: string | null
  filter: TicketFilter
  search: string

  template: SvgTicketTemplate
  templateWarnings: TemplateWarnings | null

  previewFlipped: boolean
  showTemplateReference: boolean

  importing: boolean
  importError: string | null

  actions: {
    importXlsxFile: (file: File) => Promise<void>
    setSelectedTicketId: (id: string | null) => void
    setFilter: (next: TicketFilter) => void
    clearFilter: () => void

    setSearch: (value: string) => void

    setExport14DayMode: (mode: Export14DayMode) => void
    updateMapping: (mapping: ColumnMapping) => void

    setTemplate: (template: SvgTicketTemplate) => void
    resetTemplate: () => void
    updateTemplateSvg: (svg: string) => void
    importTemplateSvgFile: (file: File) => Promise<void>
    clearTemplateWarnings: () => void

    setPreviewFlipped: (v: boolean) => void
    setShowTemplateReference: (v: boolean) => void
  }
}

export const useStudioStore = create<StudioState>()(
  persist(
    immer((set, get) => ({
      importTable: null,
      mapping: null,
      export14DayMode: "auto",

      tickets: [],
      selectedTicketId: null,
      filter: {},
      search: "",

      template: DEFAULT_SVG_TEMPLATE,
      templateWarnings: null,

      previewFlipped: false,
      showTemplateReference: false,

      importing: false,
      importError: null,

      actions: {
        importXlsxFile: async (file) => {
          set((s) => {
            s.importing = true
            s.importError = null
          })

          try {
            const table = await readXlsxToTable(file)
            const mapping = suggestMapping(table)
            const tickets = applyMapping(table, mapping, {
              export14DayMode: get().export14DayMode,
            })

            set((s) => {
              s.importTable = table
              s.mapping = mapping
              s.tickets = tickets
              s.selectedTicketId = tickets[0]?.ticketId ?? null
              s.filter = {}
              s.importing = false
            })
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to import file"
            set((s) => {
              s.importing = false
              s.importError = msg
            })
          }
        },

        setSelectedTicketId: (id) => {
          set((s) => {
            s.selectedTicketId = id
          })
        },

        setFilter: (next) => {
          set((s) => {
            s.filter = next
          })
        },

        clearFilter: () => {
          set((s) => {
            s.filter = {}
          })
        },

        setSearch: (value) => {
          set((s) => {
            s.search = value
          })
        },

        setExport14DayMode: (mode) => {
          const { importTable, mapping } = get()

          set((s) => {
            s.export14DayMode = mode
          })

          if (!importTable || !mapping) return
          const tickets = applyMapping(importTable, mapping, { export14DayMode: mode })
          set((s) => {
            s.tickets = tickets
            if (tickets.length && !tickets.some((t) => t.ticketId === s.selectedTicketId)) {
              s.selectedTicketId = tickets[0]?.ticketId ?? null
            }
          })
        },

        updateMapping: (mapping) => {
          const { importTable, export14DayMode } = get()
          if (!importTable) return
          const tickets = applyMapping(importTable, mapping, { export14DayMode })
          set((s) => {
            s.mapping = mapping
            s.tickets = tickets
            s.selectedTicketId = tickets[0]?.ticketId ?? null
            s.filter = {}
          })
        },

        setTemplate: (template) => {
          set((s) => {
            s.template = template
          })
        },

        resetTemplate: () => {
          set((s) => {
            s.template = DEFAULT_SVG_TEMPLATE
          })
        },

        updateTemplateSvg: (svg) => {
          set((s) => {
            s.template.svg = svg
          })
        },

        importTemplateSvgFile: async (file) => {
          const text = await file.text()

          // 1. Validate SVG structure
          const parser = new DOMParser()
          const doc = parser.parseFromString(text, "image/svg+xml")
          const svgEl = doc.querySelector("svg")
          const parseError = doc.querySelector("parsererror")

          if (!svgEl || parseError) {
            throw new Error("Invalid SVG file - could not parse")
          }

          // 2. Sanitize SVG with DOMPurify
          const sanitizedSvg = DOMPurify.sanitize(text, {
            USE_PROFILES: { svg: true, svgFilters: true },
            ADD_TAGS: ["use"],
            ADD_ATTR: ["xlink:href", "href", "viewBox", "preserveAspectRatio"],
          })

          // 3. Auto-detect dimensions from viewBox or width/height
          let widthMm = 70.19
          let heightMm = 123.11
          const viewBox = svgEl.getAttribute("viewBox")

          if (viewBox) {
            const parts = viewBox.split(/[\s,]+/).map(Number)
            if (parts.length === 4 && !isNaN(parts[2]) && !isNaN(parts[3])) {
              widthMm = parts[2]
              heightMm = parts[3]
            }
          } else {
            // Try width/height attributes (assume mm if no unit or mm unit)
            const w = svgEl.getAttribute("width")
            const h = svgEl.getAttribute("height")
            if (w && h) {
              const parsedW = parseFloat(w.replace(/mm$/, ""))
              const parsedH = parseFloat(h.replace(/mm$/, ""))
              if (!isNaN(parsedW) && !isNaN(parsedH)) {
                widthMm = parsedW
                heightMm = parsedH
              }
            }
          }

          // 4. Check for mustache tags
          const hasMustacheTags = /\{\{[^}]+\}\}/.test(text)

          // 5. Check reasonable dimensions (10-500mm)
          const isReasonable = widthMm >= 10 && widthMm <= 500 && heightMm >= 10 && heightMm <= 500

          // 6. Store template and warnings
          set((s) => {
            s.template = {
              id: crypto.randomUUID(),
              name: file.name.replace(/\.svg$/i, ""),
              widthMm,
              heightMm,
              svg: sanitizedSvg,
            }
            s.templateWarnings = {
              noMustacheTags: !hasMustacheTags,
              unreasonableDimensions: !isReasonable,
              invalidSvg: false,
            }
          })
        },

        clearTemplateWarnings: () => {
          set((s) => {
            s.templateWarnings = null
          })
        },

        setPreviewFlipped: (v) => {
          set((s) => {
            s.previewFlipped = v
          })
        },

        setShowTemplateReference: (v) => {
          set((s) => {
            s.showTemplateReference = v
          })
        },
      },
    })),
    {
      name: "ticket-studio-v2", // New key - clean cut from old storage
      partialize: (s) => ({
        template: s.template,
        export14DayMode: s.export14DayMode,
        previewFlipped: s.previewFlipped,
        showTemplateReference: s.showTemplateReference,
      }),
    },
  ),
)

export function useSelectedTicket() {
  return useStudioStore((s) =>
    s.selectedTicketId ? (s.tickets.find((t) => t.ticketId === s.selectedTicketId) ?? null) : null,
  )
}
