import { useDeferredValue, useMemo, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { CalendarDays, Hash } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useStudioStore } from "@/state/studio-store"
import type { TicketData } from "@/lib/ticket-types"

function matchesFilter(
  t: TicketData,
  filter: { company?: string; trade?: string; taskId?: string },
) {
  if (filter.company && (t.company ?? "(no company)") !== filter.company) return false
  if (filter.trade && (t.trade ?? "(no trade)") !== filter.trade) return false
  if (filter.taskId && t.taskId !== filter.taskId) return false
  return true
}

function normalizeSearch(s: string) {
  return s.trim().toLowerCase()
}

export function TicketList() {
  const tickets = useStudioStore((s) => s.tickets)
  const filter = useStudioStore((s) => s.filter)
  const selectedTicketId = useStudioStore((s) => s.selectedTicketId)
  const setSelectedTicketId = useStudioStore((s) => s.actions.setSelectedTicketId)
  const search = useStudioStore((s) => s.search)
  const setSearch = useStudioStore((s) => s.actions.setSearch)

  const deferredSearch = useDeferredValue(search)
  const query = normalizeSearch(deferredSearch)
  const filtered = useMemo(() => {
    const base = tickets.filter((t) => matchesFilter(t, filter))
    if (!query) return base
    return base.filter((t) => {
      const hay = [t.ticketId, t.taskId, t.taskName, t.company, t.trade, t.date, t.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(query)
    })
  }, [tickets, filter, query])

  const parentRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 55,
    overscan: 14,
    useFlushSync: false,
  })

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="flex items-center gap-2 p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tickets…"
        />
        <Badge variant="secondary" className="shrink-0">
          {filtered.length.toLocaleString()}
        </Badge>
      </div>
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: rowVirtualizer.getTotalSize(),
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const t = filtered[virtualRow.index]
            const active = t.ticketId === selectedTicketId

            return (
              <button
                key={t.ticketId}
                type="button"
                className={
                  "absolute left-0 right-0 flex items-start gap-3 border-b px-3 py-2 text-left transition-colors " +
                  (active ? "bg-primary/5" : "hover:bg-muted/30")
                }
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => setSelectedTicketId(t.ticketId)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 truncate text-sm font-medium">{t.taskName}</div>
                    {t.status ? (
                      <Badge variant="outline" className="shrink-0">
                        {t.status}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Hash className="size-3" />
                      {t.taskId}
                    </span>
                    {t.date ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3" />
                        {t.date}
                      </span>
                    ) : null}
                    {t.trade ? (
                      <span className="truncate" title={t.trade}>
                        {t.trade}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
