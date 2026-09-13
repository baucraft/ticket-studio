import { FileCode, LayoutGrid, Presentation, Workflow } from "lucide-react"
import { useState } from "react"

import { StudioView } from "@/components/studio/StudioView"
import { PilotView } from "@/components/pilot/PilotView"
import { TemplateView } from "@/components/template/TemplateView"
import { TagOnlyTargetView } from "@/components/target/TagOnlyTargetView"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function App() {
  const [tab, setTab] = useState("template")

  const scrollablePage = tab === "target" || tab === "pilot"

  return (
    <div
      className={scrollablePage ? "min-h-svh" : "h-svh overflow-hidden"}
      style={{
        background:
          "radial-gradient(900px 600px at 10% 0%, oklch(0.985 0 0) 0%, transparent 60%), radial-gradient(700px 500px at 100% 20%, oklch(0.95 0.02 230) 0%, transparent 60%), linear-gradient(oklch(0.99 0 0), oklch(0.985 0 0))",
      }}
    >
      <div
        className={`mx-auto flex max-w-[1600px] flex-col px-3 py-4 sm:px-4 sm:py-5 ${
          scrollablePage ? "min-h-svh" : "h-full"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold tracking-tight">Ticket Studio</div>
            <div className="text-xs text-muted-foreground">
              {tab === "pilot"
                ? "LCMD synchronisieren → Delta verstehen → Tafeln vorbereiten → PDF drucken"
                : tab === "target"
                  ? "Isoliertes Tag-only-Zielbild fuer DEMO-04"
                  : "Upload template → Import Excel → Preview → Export PDF"}
            </div>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={setTab}
          className="mt-4 flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList>
            <TabsTrigger value="pilot" className="gap-2">
              <Workflow className="size-4" />
              Pilot
            </TabsTrigger>
            <TabsTrigger value="target" className="gap-2">
              <Presentation className="size-4" />
              Zielbild
            </TabsTrigger>
            <TabsTrigger value="template" className="gap-2">
              <FileCode className="size-4" />
              Template
            </TabsTrigger>
            <TabsTrigger value="studio" className="gap-2">
              <LayoutGrid className="size-4" />
              Studio
            </TabsTrigger>
          </TabsList>

          <TabsContent value="target" className="mt-4 min-h-0 flex-1">
            <TagOnlyTargetView />
          </TabsContent>

          <TabsContent value="pilot" className="mt-4 min-h-0 flex-1">
            <PilotView />
          </TabsContent>

          <TabsContent
            value="template"
            className="mt-4 min-h-0 flex-1 overflow-auto md:overflow-hidden"
          >
            <TemplateView />
          </TabsContent>

          <TabsContent
            value="studio"
            className="mt-4 min-h-0 flex-1 overflow-auto md:overflow-hidden"
          >
            <StudioView />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
