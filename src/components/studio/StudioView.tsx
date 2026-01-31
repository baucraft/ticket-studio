import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ImportCard } from "@/components/studio/ImportCard"
import { GroupingTree } from "@/components/studio/GroupingTree"
import { TicketList } from "@/components/studio/TicketList"
import { TicketPreview } from "@/components/studio/TicketPreview"
import { MappingDialog } from "@/components/studio/MappingDialog"
import { ExportButton } from "@/components/studio/ExportButton"

export function StudioView() {
  return (
    <div className="grid gap-3 md:grid-cols-[320px_1fr_420px]">
      <div className="grid gap-3">
        <ImportCard />

        <Card className="p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Actions</div>
              <div className="text-xs text-muted-foreground">Export or adjust mappings</div>
            </div>
          </div>
          <Separator className="my-3" />
          <div className="flex flex-wrap gap-2">
            <ExportButton />
            <MappingDialog />
          </div>
        </Card>

        <GroupingTree />
      </div>

      <div className="min-h-[60svh]">
        <TicketList />
      </div>

      <div className="min-h-[60svh]">
        <TicketPreview />
      </div>
    </div>
  )
}
