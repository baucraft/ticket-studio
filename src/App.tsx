import { LayoutGrid, PencilRuler } from "lucide-react"
import { useState } from "react"

import { StudioView } from "@/components/studio/StudioView"
import { TemplateEditor } from "@/components/editor/TemplateEditor"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function App() {
  const [tab, setTab] = useState("studio")

  return (
    <div
      className="min-h-svh"
      style={{
        background:
          "radial-gradient(900px 600px at 10% 0%, oklch(0.985 0 0) 0%, transparent 60%), radial-gradient(700px 500px at 100% 20%, oklch(0.95 0.02 230) 0%, transparent 60%), linear-gradient(oklch(0.99 0 0), oklch(0.985 0 0))",
      }}
    >
      <div className="mx-auto max-w-[1600px] px-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold tracking-tight">Ticket Studio</div>
            <div className="text-xs text-muted-foreground">
              Import → Preview → Customize template → Export PDF
            </div>
          </div>
          <Badge variant="secondary">local-first</Badge>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="mt-4">
          <TabsList>
            <TabsTrigger value="studio" className="gap-2">
              <LayoutGrid className="size-4" />
              Studio
            </TabsTrigger>
            <TabsTrigger value="template" className="gap-2">
              <PencilRuler className="size-4" />
              Template
            </TabsTrigger>
          </TabsList>

          <TabsContent value="studio" className="mt-4">
            <StudioView />
          </TabsContent>

          <TabsContent value="template" className="mt-4">
            <TemplateEditor />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
