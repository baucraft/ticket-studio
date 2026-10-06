import { PDFDocument, PDFHexString, PDFName, PDFNumber } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { mergePilotPrintPdfs } from "../scripts/merge-pilot-print-pdfs"
import { generatePilotPrintPackage } from "../scripts/generate-pilot-print-package"
import { parsePilotPrintPreparation } from "../src/lib/pilot-api"

import { createHash } from "node:crypto"

const mm = (value: number) => (value * 72) / 25.4

function canonical(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`
}

const revision = {
  revision: 1,
  predecessor: 0,
  source: {
    sourceProjectId: "project-a",
    cards: [
      { sourcePlanCardId: "card-a", date: "2026-10-12", area: "EA1 / Area A" },
      { sourcePlanCardId: "card-b", date: "2026-10-19", area: "EA2 / Area B" },
    ],
    forecastStart: "2026-10-12",
    forecastEnd: "2026-12-06",
  },
  delta: [
    { sourcePlanCardId: "card-a", kind: "new" },
    { sourcePlanCardId: "card-b", kind: "new" },
  ],
  blocked: false,
}
const revisionHash = createHash("sha256").update(canonical(revision)).digest("hex")

function allocationFixture() {
  const header = {
    schema: "pilot-allocation-journal-v1",
    authority: "synthetic-test-authority",
    project: "project-a",
    synthetic: true,
    allowedTags: [1000, 1001, 1002, 1003],
    allowedMarkers: [64000],
  }
  const request = {
    requestId: "test-print",
    revision: 1,
    boardId: "test-board",
    cardIds: ["card-a", "card-b"],
  }
  const job = {
    schema: "pilot-print-v1",
    family: "tagCircle49h12",
    layoutVersion: "tag-only-card-v1-18mm",
    ...request,
    requestHash: createHash("sha256").update(canonical(request)).digest("hex"),
    authority: header.authority,
    sourceProjectId: header.project,
    synthetic: true,
    boardMarkerId: 64000,
    revisionHash,
    cards: [
      {
        sourcePlanCardId: "card-a",
        sourceActivityId: "activity-a",
        date: "2026-10-12",
        activity: "A",
        task: null,
        trade: null,
        company: null,
        area: "EA1 / Area A",
        sourceStatus: null,
        activeTagId: 1000,
        doneTagId: 1001,
      },
      {
        sourcePlanCardId: "card-b",
        sourceActivityId: "activity-b",
        date: "2026-10-19",
        activity: "B",
        task: null,
        trade: null,
        company: null,
        area: "EA2 / Area B",
        sourceStatus: null,
        activeTagId: 1002,
        doneTagId: 1003,
      },
    ],
  }
  const event = {
    sequence: 1,
    previous: createHash("sha256").update(canonical(header)).digest("hex"),
    job,
  }
  return {
    journal: new TextEncoder().encode(`${canonical(header)}\n${canonical(event)}\n`),
    witness: { count: 1, hash: createHash("sha256").update(canonical(event)).digest("hex") },
  }
}

async function printPdf(
  cards: Array<{ id: string; active: number; done: number }>,
  options: { trimWidthMm?: number } = {},
) {
  const document = await PDFDocument.create({ updateMetadata: false })
  for (const [index, card] of cards.entries()) {
    const page = document.addPage([mm(66), mm(120)])
    page.node.set(PDFName.of("PilotCardIndex"), PDFNumber.of(index + 1))
    page.node.set(PDFName.of("PilotActiveTagId"), PDFNumber.of(card.active))
    page.node.set(PDFName.of("PilotDoneTagId"), PDFNumber.of(card.done))
    page.node.set(PDFName.of("PilotOuterShortMm"), PDFNumber.of(66))
    page.node.set(PDFName.of("PilotOuterLongMm"), PDFNumber.of(120))
    page.node.set(PDFName.of("PilotCardMarkerOuterEdgeMm"), PDFNumber.of(18))
    page.node.set(PDFName.of("PilotVisibleTextFit"), PDFNumber.of(1))
    page.node.set(PDFName.of("PilotBothCardEnds"), PDFNumber.of(1))
    page.node.set(PDFName.of("PilotSourceProjectId"), PDFHexString.fromText("project-a"))
    page.node.set(PDFName.of("PilotSourcePlanCardId"), PDFHexString.fromText(card.id))
    page.node.set(PDFName.of("PilotRevisionHash"), PDFHexString.fromText(revisionHash))
    if (options.trimWidthMm) page.setTrimBox(0, 0, mm(options.trimWidthMm), mm(120))
  }
  return document.save({ addDefaultPage: false, useObjectStreams: false })
}

const contract = {
  forecastStart: "2026-10-12",
  forecastEnd: "2026-12-06",
  asOf: "2026-10-08",
  revision,
  allocation: allocationFixture(),
}

describe("pilot print merge", () => {
  it("merges one revision into a deterministic identity manifest", async () => {
    const first = await printPdf([{ id: "card-a", active: 1000, done: 1001 }])
    const second = await printPdf([{ id: "card-b", active: 1002, done: 1003 }])

    const result = await mergePilotPrintPdfs(
      [
        { name: "week-1.pdf", bytes: first },
        { name: "week-2.pdf", bytes: second },
      ],
      contract,
    )

    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(2)
    expect(result.manifest).toMatchObject({
      schema: "pilot-two-month-print-package-v1",
      forecastStart: "2026-10-12",
      forecastEnd: "2026-12-06",
      asOf: "2026-10-08",
      revisionHash,
      pageCount: 2,
    })
    expect(result.manifest.pages.map((page) => [page.activeTagId, page.doneTagId])).toEqual([
      [1000, 1001],
      [1002, 1003],
    ])
    expect(result.manifest.outputSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it("blocks duplicate physical card identities", async () => {
    const first = await printPdf([{ id: "card-a", active: 1000, done: 1001 }])
    const duplicate = await printPdf([{ id: "card-a", active: 1002, done: 1003 }])

    await expect(
      mergePilotPrintPdfs(
        [
          { name: "week-1.pdf", bytes: first },
          { name: "week-2.pdf", bytes: duplicate },
        ],
        contract,
      ),
    ).rejects.toThrow("doppelte Kartenidentitaet")
  })

  it("blocks an incomplete revision and invalid print boxes", async () => {
    const first = await printPdf([{ id: "card-a", active: 1000, done: 1001 }])
    await expect(
      mergePilotPrintPdfs([{ name: "week-1.pdf", bytes: first }], contract),
    ).rejects.toThrow("Drucksatz unvollstaendig")

    const invalid = await printPdf(
      [
        { id: "card-a", active: 1000, done: 1001 },
        { id: "card-b", active: 1002, done: 1003 },
      ],
      { trimWidthMm: 65 },
    )
    await expect(
      mergePilotPrintPdfs([{ name: "invalid.pdf", bytes: invalid }], contract),
    ).rejects.toThrow("ungueltiger Pilot-Druckvertrag")
  })

  it("applies explicit area selection with exact completeness and no cardinality truncation", async () => {
    const first = await printPdf([{ id: "card-a", active: 1000, done: 1001 }])
    const selection = {
      schema: "pilot-print-selection-v1",
      sourceProjectId: "project-a",
      forecastStart: contract.forecastStart,
      forecastEnd: contract.forecastEnd,
      mode: "areas",
      areaPaths: ["EA1"],
    }
    const selectedContract = { ...contract, selection }
    const result = await mergePilotPrintPdfs(
      [{ name: "area-a.pdf", bytes: first }],
      selectedContract,
    )
    expect(result.manifest).toMatchObject({
      pageCount: 1,
      fullForecastCardCount: 2,
      excludedByExplicitAreaSelection: 1,
      selection: { mode: "areas", areaPaths: ["EA1"] },
    })
    expect(
      (await mergePilotPrintPdfs([{ name: "area-a.pdf", bytes: first }], selectedContract)).bytes,
    ).toEqual(result.bytes)
    await expect(
      mergePilotPrintPdfs([{ name: "area-a.pdf", bytes: first }], {
        ...contract,
        selection: { ...selection, areaPaths: ["EA"] },
      }),
    ).rejects.toThrow("Bereich fehlt")
  })

  it("rejects unallocated tag pairs and inconsistent witnesses", async () => {
    const tampered = await printPdf([
      { id: "card-a", active: 1100, done: 1101 },
      { id: "card-b", active: 1002, done: 1003 },
    ])
    await expect(
      mergePilotPrintPdfs([{ name: "tampered.pdf", bytes: tampered }], contract),
    ).rejects.toThrow("Vergabestand belegt")
    await expect(
      mergePilotPrintPdfs([{ name: "tampered.pdf", bytes: tampered }], {
        ...contract,
        allocation: { ...contract.allocation, witness: { count: 0, hash: "a".repeat(64) } },
      }),
    ).rejects.toThrow("Witness")
  })

  it("rejects a modified preparation before rendering any PDF", async () => {
    const event = JSON.parse(new TextDecoder().decode(contract.allocation.journal).split("\n")[1]!)
    const preparation = parsePilotPrintPreparation(event.job)
    preparation.cards[0]!.activeTagId = 1100
    await expect(
      generatePilotPrintPackage([preparation], contract, new Uint8Array()),
    ).rejects.toThrow("nicht identisch zum gebundenen Journalauftrag")
  })
})
