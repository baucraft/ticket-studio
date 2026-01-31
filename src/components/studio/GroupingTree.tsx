import { useMemo, useState } from "react"
import { ChevronRight, Layers, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useStudioStore } from "@/state/studio-store"
import type { TicketData } from "@/lib/ticket-types"

type Node = {
  label: string
  count: number
  children?: Node[]
  key: { company?: string; trade?: string; taskId?: string }
}

function buildTree(tickets: TicketData[]): Node[] {
  const byCompany = new Map<string, TicketData[]>()
  for (const t of tickets) {
    const company = t.company ?? "(no company)"
    const arr = byCompany.get(company)
    if (arr) arr.push(t)
    else byCompany.set(company, [t])
  }

  const companies: Node[] = []
  for (const [company, companyTickets] of byCompany.entries()) {
    const byTrade = new Map<string, TicketData[]>()
    for (const t of companyTickets) {
      const trade = t.trade ?? "(no trade)"
      const arr = byTrade.get(trade)
      if (arr) arr.push(t)
      else byTrade.set(trade, [t])
    }

    const trades: Node[] = []
    for (const [trade, tradeTickets] of byTrade.entries()) {
      const byTask = new Map<string, TicketData[]>()
      for (const t of tradeTickets) {
        const task = t.taskId
        const arr = byTask.get(task)
        if (arr) arr.push(t)
        else byTask.set(task, [t])
      }

      const tasks: Node[] = []
      for (const [taskId, taskTickets] of byTask.entries()) {
        const taskName = taskTickets[0]?.taskName ?? "(task)"
        tasks.push({
          label: `${taskName}`,
          count: taskTickets.length,
          key: { company, trade, taskId },
        })
      }

      tasks.sort((a, b) => a.label.localeCompare(b.label))

      trades.push({
        label: trade,
        count: tradeTickets.length,
        key: { company, trade },
        children: tasks,
      })
    }

    trades.sort((a, b) => a.label.localeCompare(b.label))

    companies.push({
      label: company,
      count: companyTickets.length,
      key: { company },
      children: trades,
    })
  }

  companies.sort((a, b) => a.label.localeCompare(b.label))
  return companies
}

export function GroupingTree() {
  const tickets = useStudioStore((s) => s.tickets)
  const filter = useStudioStore((s) => s.filter)
  const setFilter = useStudioStore((s) => s.actions.setFilter)
  const clearFilter = useStudioStore((s) => s.actions.clearFilter)

  const tree = useMemo(() => buildTree(tickets), [tickets])

  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set())

  const toggleOpen = (key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const activeLabel =
    (filter.taskId ?? filter.trade ?? filter.company) ? JSON.stringify(filter) : ""

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <div className="text-sm font-medium">Groups</div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          onClick={clearFilter}
          disabled={!activeLabel}
        >
          <X className="size-4" />
          Clear
        </Button>
      </div>
      <Separator />

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {tree.length === 0 ? (
            <div className="px-2 py-6 text-xs text-muted-foreground">Import to see groups.</div>
          ) : null}

          {tree.map((company) => (
            <TreeNode
              key={`c:${company.label}`}
              node={company}
              depth={0}
              filter={filter}
              onSelect={setFilter}
              openKeys={openKeys}
              toggleOpen={toggleOpen}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function isActive(filter: { company?: string; trade?: string; taskId?: string }, key: Node["key"]) {
  return (
    (key.company ? filter.company === key.company : !filter.company) &&
    (key.trade ? filter.trade === key.trade : !filter.trade) &&
    (key.taskId ? filter.taskId === key.taskId : !filter.taskId)
  )
}

function TreeNode(props: {
  node: Node
  depth: number
  filter: { company?: string; trade?: string; taskId?: string }
  onSelect: (next: { company?: string; trade?: string; taskId?: string }) => void
  openKeys: Set<string>
  toggleOpen: (key: string) => void
}) {
  const { node, depth, filter, onSelect, openKeys, toggleOpen } = props
  const active = isActive(filter, node.key)
  const hasChildren = (node.children?.length ?? 0) > 0

  const key = `${node.key.company ?? "_"}::${node.key.trade ?? "_"}::${node.key.taskId ?? "_"}`
  const isOpen = hasChildren ? openKeys.has(key) : false

  return (
    <div>
      <div
        className={
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors " +
          (active ? "bg-primary/10 text-primary" : "hover:bg-muted/40")
        }
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <button
          type="button"
          className={
            "grid size-6 place-items-center rounded-md text-muted-foreground transition-colors " +
            (hasChildren ? "hover:bg-muted/60" : "opacity-0")
          }
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) toggleOpen(key)
          }}
        >
          <ChevronRight
            className={"size-4 transition-transform " + (isOpen ? "rotate-90" : "rotate-0")}
          />
        </button>

        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => onSelect(node.key)}
          title={node.label}
        >
          {node.label}
        </button>

        <div className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {node.count}
        </div>
      </div>

      {hasChildren && isOpen ? (
        <div className="mt-1">
          {node.children!.map((child) => (
            <TreeNode
              key={`${depth}:${child.label}:${child.key.taskId ?? ""}`}
              node={child}
              depth={depth + 1}
              filter={filter}
              onSelect={onSelect}
              openKeys={openKeys}
              toggleOpen={toggleOpen}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
