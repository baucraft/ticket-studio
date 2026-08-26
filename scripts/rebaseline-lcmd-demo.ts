import { open, readFile } from "node:fs/promises"
import { resolve } from "node:path"

import baseFixtureSource from "../src/data/demo-04-synthetic-activities.v1.json"
import {
  assertPrivateLocalInput,
  assertUnversionedLocalPath,
  LCMD_DEMO_REBASELINE_BUILDINGS,
  LCMD_DEMO_REBASELINE_FLOORS,
  LCMD_DEMO_REBASELINE_SCOPE,
  validateLcmdDemoRebaselineScope,
  validateLcmdDemoWorkbooks,
  type LcmdDemoSelection,
} from "./lcmd-demo-xlsx-adapter"

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function writeNewJson(pathValue: string, value: unknown, mode: number): Promise<string> {
  const path = resolve(pathValue)
  const handle = await open(path, "wx", mode)
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8")
    await handle.sync()
  } finally {
    await handle.close()
  }
  return path
}

function projectIdFromLocalXml(xml: string): string {
  const ids = [...xml.matchAll(/&quot;pid&quot;:&quot;([^&]+)&quot;|"pid":"([^"]+)"/g)].map(
    (match) => match[1] ?? match[2],
  )
  const unique = new Set(ids)
  if (
    ids.length !== 1 ||
    unique.size !== 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ids[0])
  ) {
    throw new Error("Lokale Projektmetadaten enthalten nicht genau eine plausible Projekt-ID.")
  }
  return ids[0]
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-")
  return `${day}.${month}.${year}`
}

const processesPath = option("--processes")
const cardsPath = option("--cards")
const projectXmlPath = option("--project-xml")
const selectionOutput = option("--selection-output")
const fixtureOutput = option("--fixture-output")
if (
  !processesPath ||
  !cardsPath ||
  !projectXmlPath ||
  !selectionOutput?.endsWith(".local") ||
  !fixtureOutput ||
  process.argv.length !== 12
) {
  throw new Error(
    "Usage: npm run demo:lcmd-rebaseline -- --processes <xlsx> --cards <xlsx> --project-xml <xml> --selection-output <json.local> --fixture-output <json>",
  )
}

await assertUnversionedLocalPath(selectionOutput, "Auswahlausgabe")
await Promise.all([
  assertPrivateLocalInput(processesPath, "Prozess-Export"),
  assertPrivateLocalInput(cardsPath, "Plankarten-Export"),
  assertPrivateLocalInput(projectXmlPath, "Lokale Projektmetadaten"),
])
const [processBytes, cardBytes, projectXml] = await Promise.all([
  readFile(processesPath),
  readFile(cardsPath),
  readFile(projectXmlPath, "utf8"),
])
const contract = validateLcmdDemoWorkbooks(processBytes, cardBytes)
const sourceProjectId = projectIdFromLocalXml(projectXml)
const selected = LCMD_DEMO_REBASELINE_BUILDINGS.flatMap((areaLevel1) =>
  LCMD_DEMO_REBASELINE_FLOORS.flatMap((areaLevel2) =>
    LCMD_DEMO_REBASELINE_SCOPE.map((scope) => {
      const matches = contract.processes.filter(
        (process) =>
          process.areaLevel1 === areaLevel1 &&
          process.areaLevel2 === areaLevel2 &&
          process.processName === scope.processName &&
          process.trade === scope.trade,
      )
      if (matches.length !== 1) {
        throw new Error(
          `Rebaseline-Scope ist fuer ${areaLevel1}/${areaLevel2}/${scope.processName} nicht eindeutig.`,
        )
      }
      return { process: matches[0], scope }
    }),
  ),
)
if (
  selected.length !== 50 ||
  new Set(selected.map(({ process }) => process.sourceActivityId)).size !== 50
) {
  throw new Error("Rebaseline-Scope muss exakt 50 eindeutige LCMD-Prozesse liefern.")
}

const selection: LcmdDemoSelection = {
  schemaVersion: "demo-04-lcmd-selection-v1",
  sourceProjectId,
  bindings: selected.map(({ process }, index) => ({
    demoActivityKey: `D04-${String(index + 1).padStart(3, "0")}`,
    sourceActivityId: process.sourceActivityId,
  })),
}
validateLcmdDemoRebaselineScope(selection, contract)

const fixture = structuredClone(baseFixtureSource)
fixture.fixtureVersion = "2026-08-25.2"
fixture.scope = "lcmd_derived_synthetic_non_product_preflight"
fixture.provenance.contract = "DEMO-04 read-only LCMD XLSX rebaseline"
fixture.boards[0].name = "Demo-Tafel 1 - LCMD-Auswahl"
fixture.boards[0].area = "Sequenzielle Belegung 1"
fixture.boards[1].name = "Demo-Tafel 2 - LCMD-Auswahl"
fixture.boards[1].area = "Sequenzielle Belegung 2"
fixture.boards[2].name = "Demo-Tafel 3 - LCMD-Auswahl"
fixture.boards[2].area = "Sequenzielle Belegung 3"
fixture.activities = fixture.activities.map((activity, index) => {
  const { process, scope } = selected[index]
  return {
    ...activity,
    sourceBinding: { state: "derived_from_local_read_only_selection" },
    company: "Synthetische LCMD-Demoquelle",
    trade: process.trade,
    tradeColor: scope.demoColor,
    tradeColorSource: "demo_accessible_mapping",
    area: process.areaPath,
    week:
      process.weekStart === process.weekEnd
        ? `KW ${process.weekStart}`
        : `KW ${process.weekStart}-${process.weekEnd}`,
    shortTarget: process.processName,
    fullTarget: `${process.processName} im Bereich ${process.areaPath} vom ${formatDate(process.startDate)} bis ${formatDate(process.endDate)}.`,
  }
})
fixture.identityContract.sourceBindingState = "derived_by_unversioned_local_read_only_selection"
fixture.identityContract.lcmdImporterImplemented = true
Object.assign(fixture.identityContract, { gateQualification: "not_released_by_gate_g4" })
fixture.demoProjects[0].name = "DEMO-04 / aus synthetischem LCMD-Export abgeleitet"

const selectionPath = await writeNewJson(selectionOutput, selection, 0o600)
const fixturePath = await writeNewJson(fixtureOutput, fixture, 0o644)
console.log(`Generated local selection in ${selectionPath}`)
console.log(`Generated ID-free derived fixture in ${fixturePath}`)
