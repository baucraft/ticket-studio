import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { writeHausmesseDemoPackage } from "../scripts/hausmesse-demo-writer"
import {
  createHausmesseDemoTickets,
  createHausmesseManifest,
  HAUSMESSE_DEMO_PLAN,
  HAUSMESSE_DEMO_TEMPLATE,
  HausmesseDemoError,
  serializeHausmesseManifest,
  serializeHausmesseManifestCsv,
  validateHausmesseDemoPlan,
} from "@/lib/hausmesse-demo"
import { createHausmesseDemoPackage, HAUSMESSE_FILES } from "@/lib/hausmesse-demo-package"

function mutablePlan() {
  return structuredClone(HAUSMESSE_DEMO_PLAN)
}

const EXPECTED_CARDS = [
  ["demo-ticket-01", "201101100001", false, 0, 0],
  ["demo-ticket-02", "201101100002", true, 1, 0],
  ["demo-ticket-03", "201101100003", false, 2, 0],
  ["demo-ticket-04", "201101100004", true, 3, 0],
  ["demo-ticket-05", "201101100005", false, 4, 0],
  ["demo-ticket-06", "202102100006", true, 0, 1],
  ["demo-ticket-07", "202102100007", false, 1, 1],
  ["demo-ticket-08", "202102100008", true, 2, 1],
  ["demo-ticket-09", "202102100009", false, 3, 1],
  ["demo-ticket-10", "202102100010", true, 4, 1],
  ["demo-ticket-11", "203103100011", false, 0, 2],
  ["demo-ticket-12", "203103100012", true, 1, 2],
  ["demo-ticket-13", "203103100013", false, 2, 2],
  ["demo-ticket-14", "203103100014", true, 3, 2],
] as const

describe("Hausmesse demo contract", () => {
  it("builds the frozen 14-card Combined contract", async () => {
    const tickets = await createHausmesseDemoTickets()
    const manifest = createHausmesseManifest()

    expect(tickets).toHaveLength(14)
    expect(
      manifest.tickets.map((ticket) => [
        ticket.cardId,
        ticket.payload,
        ticket.initialStatus === "finished",
        ticket.slot.column,
        ticket.slot.row,
      ]),
    ).toEqual(EXPECTED_CARDS)
    expect(new Set(tickets.map((ticket) => ticket.payload))).toHaveLength(14)
    expect(tickets.filter((ticket) => ticket.isFinished)).toHaveLength(7)
    expect(new Set(tickets.map((ticket) => ticket.tradeId))).toEqual(new Set([101, 102, 103]))
    expect(tickets[0].payload).toBe("201101100001")
    expect(tickets[12].ticketId).toBe("demo-ticket-13")
    expect(manifest.expected).toEqual({
      sourceActive: 7,
      sourceFinished: 7,
      analyzerConfirmed: 13,
      analyzerPartial: 1,
      analyzerMissing: 0,
      analyzerFalse: 0,
      confirmedActive: 6,
      confirmedFinished: 7,
      confirmedByTrade: {
        "101": { finished: 2, total: 5 },
        "102": { finished: 3, total: 5 },
        "103": { finished: 2, total: 3 },
      },
      deliberatePartialCardId: "demo-ticket-13",
      deliberatePartialErrorCode: "DM_NOT_DECODED",
    })
    expect(manifest.layout.contract).toBe("combined-v1-relative")
    expect(manifest.layout.qualification).toBe("demo_field_reference_not_gate_g4_production_layout")
    expect(HAUSMESSE_DEMO_TEMPLATE.svg.match(/width="6" height="30"/g)).toHaveLength(2)
    expect(HAUSMESSE_DEMO_TEMPLATE.svg.match(/fill-opacity="0.12"/g)).toHaveLength(2)
  })

  it.each([
    ["unknown field", (plan: Record<string, unknown>) => (plan.extra = true)],
    [
      "wrong count",
      (plan: Record<string, unknown>) => ((plan.activities as unknown[]).length = 13),
    ],
    [
      "duplicate id",
      (plan: Record<string, unknown>) => {
        const activities = plan.activities as Array<Record<string, unknown>>
        activities[1].ticketId = activities[0].ticketId
      },
    ],
    [
      "unknown trade",
      (plan: Record<string, unknown>) => {
        const activities = plan.activities as Array<Record<string, unknown>>
        activities[0].tradeId = 999
      },
    ],
    [
      "changed task",
      (plan: Record<string, unknown>) => {
        const activities = plan.activities as Array<Record<string, unknown>>
        activities[0].task = "Plausible but unsupported"
      },
    ],
  ])("rejects %s instead of inventing plausible demo data", (_, mutate) => {
    const plan = mutablePlan() as unknown as Record<string, unknown>
    mutate(plan)
    expect(() => validateHausmesseDemoPlan(plan)).toThrow(HausmesseDemoError)
  })

  it("serializes JSON and CSV byte-deterministically over five runs", () => {
    const json = serializeHausmesseManifest()
    const csv = serializeHausmesseManifestCsv()
    for (let run = 0; run < 5; run += 1) {
      expect(serializeHausmesseManifest()).toEqual(json)
      expect(serializeHausmesseManifestCsv()).toEqual(csv)
    }
    expect(new TextDecoder().decode(json)).not.toMatch(
      /(gps|latitude|longitude|timestamp|device|client|building)/i,
    )
    expect(new TextDecoder().decode(csv).trim().split("\n")).toHaveLength(15)
  })

  it("creates a deterministic 14-page PDF and matching checksums", async () => {
    const first = await createHausmesseDemoPackage()
    for (let run = 0; run < 4; run += 1) {
      expect(await createHausmesseDemoPackage()).toEqual(first)
    }

    const pdf = await PDFDocument.load(first.pdf)
    expect(pdf.getPageCount()).toBe(14)
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo((66 * 72) / 25.4, 5)
      expect(page.getHeight()).toBeCloseTo((120 * 72) / 25.4, 5)
    }
    const printPdf = await PDFDocument.load(first.printPdf)
    expect(printPdf.getPageCount()).toBe(4)
    for (const page of printPdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo((210 * 72) / 25.4, 5)
      expect(page.getHeight()).toBeCloseTo((297 * 72) / 25.4, 5)
    }
    const checksums = new TextDecoder().decode(first.checksums)
    expect(checksums).toContain(HAUSMESSE_FILES.plan)
    expect(checksums).toContain(HAUSMESSE_FILES.pdf)
    expect(checksums).toContain(HAUSMESSE_FILES.printPdf)
    expect(checksums).toContain(HAUSMESSE_FILES.manifest)
    expect(checksums).toContain(HAUSMESSE_FILES.csv)
  }, 15_000)

  it("publishes a complete package atomically and rejects existing targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "ticket-studio-demo-"))
    const output = join(root, "package")
    try {
      await writeHausmesseDemoPackage(output)
      const checksum = await readFile(join(output, HAUSMESSE_FILES.checksums))

      await expect(writeHausmesseDemoPackage(output)).rejects.toThrow("already exists")

      expect(await readFile(join(output, HAUSMESSE_FILES.checksums))).toEqual(checksum)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
