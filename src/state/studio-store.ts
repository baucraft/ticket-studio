import { create } from "zustand"
import { persist } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"

import { applyMapping, readXlsxToTable, suggestMapping } from "@/lib/import-xlsx"
import { DEFAULT_SVG_TEMPLATE } from "@/lib/default-template-svg"
import type { ColumnMapping, ImportTable, TicketData } from "@/lib/ticket-types"
import type { SvgTicketTemplate } from "@/lib/template-types"

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
