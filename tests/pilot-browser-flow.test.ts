import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from "pdf-lib"
import { describe, expect, it } from "vitest"

import {
  PilotApi,
  PilotApiError,
  type PilotPrintPreparation,
  type PilotRevision,
} from "@/lib/pilot-api"
import {
  createPilotBoardMarkerPdf,
  createPilotCardsPdf,
  pilotMarkerAssetFromCodebook,
} from "@/lib/pilot-print-pdf"
import {
  assertPilotPrintPreparation,
  pilotActiveCards,
  pilotCardDisposition,
  pilotCardsInScope,
  pilotCardsToPrint,
} from "@/lib/pilot-workflow"

const PROJECT = "synthetic-project"

const cards = Array.from({ length: 6 }, (_, index) => ({
  sourcePlanCardId: `card-${index + 1}`,
  sourceActivityId: "activity-a",
  date: `2026-10-${String(index + 1).padStart(2, "0")}`,
  activity: "Innenausbau vorbereiten",
  task: "Material bereitstellen",
  trade: "Trockenbau",
  company: null,
  area: "Bauteil Nord / Ebene 1",
  sourceStatus: "OPEN",
}))

const revision: PilotRevision = {
  revision: 1,
  predecessor: 0,
  source: {
    sourceProjectId: PROJECT,
    cards,
    processSha256: "a".repeat(64),
    cardSha256: "b".repeat(64),
    processFetchedAt: "2026-09-13T10:00:00+00:00",
    cardFetchedAt: "2026-09-13T10:00:01+00:00",
    atomicSnapshot: false,
    forecastStart: "2026-10-01",
    forecastEnd: "2026-10-31",
  },
  delta: cards.map((card) => ({
    sourcePlanCardId: card.sourcePlanCardId,
    kind: "new" as const,
    changedFields: [],
    replacementPrintRequired: false,
  })),
  blocked: false,
}

const preparation: PilotPrintPreparation = {
  schema: "pilot-print-v1",
  requestId: "print-stable",
  requestHash: "c".repeat(64),
  sourceProjectId: PROJECT,
  authority: "synthetic-authority",
  synthetic: true,
  revision: 1,
  revisionHash: "d".repeat(64),
  boardId: "kw-40-nord",
  boardMarkerId: 64_000,
  family: "tagCircle49h12",
  layoutVersion: "tag-only-card-v1-18mm",
  cards: cards.map((card, index) => ({
    ...card,
    activeTagId: 10_000 + index * 2,
    doneTagId: 10_001 + index * 2,
  })),
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const codebook = readFile(resolve("public/pilot-assets/tagCircle49h12.bits")).then(
  (bytes) => new Uint8Array(bytes),
)
const assetLoader = async (filename: string) =>
  pilotMarkerAssetFromCodebook(await codebook, filename)

function embeddedCardContent(document: PDFDocument, pageIndex: number) {
  const resources = document.getPage(pageIndex).node.Resources()
  if (!resources) throw new Error("missing PDF resources")
  const objects = resources.lookup(PDFName.of("XObject"), PDFDict)
  return objects
    .entries()
    .map(([, object]) => {
      const stream = document.context.lookup(object, PDFRawStream)
      return Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")
    })
    .join("\n")
}

function textOperators(content: string) {
  return [...content.matchAll(/<([0-9A-F]+)> Tj/g)].map((match) =>
    Buffer.from(match[1]!, "hex").toString("latin1"),
  )
}

describe("pilot browser flow", () => {
  it("uses the relative cookie API from named login through stable print preparation and PDF", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const responses = [
      json({ username: "member-a" }),
      json({ username: "member-a", sourceProjectIds: [PROJECT] }),
      json({
        profile: "pilot-product-v1",
        sourceProjectId: PROJECT,
        activeRevision: 0,
        synthetic: true,
        activePlacement: {},
        revisions: [],
      }),
      json(revision),
      json(preparation),
      json(preparation),
      json({ activeRevision: 1, boards: { "kw-40-nord": preparation } }),
      json({
        profile: "pilot-product-v1",
        sourceProjectId: PROJECT,
        activeRevision: 1,
        synthetic: true,
        activePlacement: { activeRevision: 1, boards: { "kw-40-nord": preparation } },
        revisions: [{ revision: 1, predecessor: 0, blocked: false }],
      }),
    ]
    const api = new PilotApi(async (input, init) => {
      calls.push({ url: String(input), init })
      return responses.shift()!
    })

    await api.login("member-a", "test-only-password")
    expect((await api.session()).sourceProjectIds).toEqual([PROJECT])
    expect((await api.project(PROJECT)).activeRevision).toBe(0)
    const synced = await api.sync(PROJECT, {
      requestId: "sync-stable",
      expectedRevision: 0,
      forecastStart: "2026-10-01",
      forecastEnd: "2026-10-31",
      confirmedRemovedCardIds: [],
    })
    expect(new Set(synced.delta.map((item) => item.kind))).toEqual(new Set(["new"]))
    const printRequest = {
      requestId: "print-stable",
      revision: synced.revision,
      boardId: "kw-40-nord",
      cardIds: synced.source.cards.map((card) => card.sourcePlanCardId),
    }
    const first = await api.preparePrint(PROJECT, printRequest)
    const retry = await api.preparePrint(PROJECT, printRequest)
    expect(retry).toEqual(first)
    expect(calls.every((call) => call.url.startsWith("/api/pilot/v1/"))).toBe(true)
    expect(calls.every((call) => call.init?.credentials === "same-origin")).toBe(true)
    expect(calls[4]?.init?.body).toBe(calls[5]?.init?.body)
    expect(calls.map((call) => JSON.stringify(call.init?.headers ?? {})).join(" ")).not.toContain(
      "Authorization",
    )

    const cardBytes = await createPilotCardsPdf(first, undefined, assetLoader)
    const markerBytes = await createPilotBoardMarkerPdf(first, assetLoader)
    expect(await createPilotCardsPdf(first, undefined, assetLoader)).toEqual(cardBytes)
    expect(await createPilotBoardMarkerPdf(first, assetLoader)).toEqual(markerBytes)
    const cardPdf = await PDFDocument.load(cardBytes)
    const markerPdf = await PDFDocument.load(markerBytes)
    expect(cardPdf.getPageCount()).toBe(6)
    expect(cardPdf.getPage(0).getSize()).toMatchObject({
      width: expect.closeTo((66 * 72) / 25.4, 5),
      height: expect.closeTo((120 * 72) / 25.4, 5),
    })
    expect(
      cardPdf.getPage(0).node.lookup(PDFName.of("PilotBothCardEnds"), PDFNumber).asNumber(),
    ).toBe(1)
    expect(cardPdf.getPage(5).node.lookup(PDFName.of("PilotDoneTagId"), PDFNumber).asNumber()).toBe(
      10_011,
    )
    expect(
      markerPdf.getPage(0).node.lookup(PDFName.of("PilotBoardMarkerId"), PDFNumber).asNumber(),
    ).toBe(64_000)
    expect(
      cardPdf
        .getPage(0)
        .node.lookup(PDFName.of("PilotSourcePlanCardId"), PDFHexString)
        .decodeText(),
    ).toBe("card-1")
    const cardText = textOperators(embeddedCardContent(cardPdf, 0))
    expect(cardText.filter((value) => value === "Innenausbau vorbereiten")).toHaveLength(2)
    expect(cardText.join(" ").match(/Aufgabe: Material bereitstellen/g)).toHaveLength(2)
    expect(embeddedCardContent(cardPdf, 0)).toMatch(/-1 0\.\d+ -0\.\d+ -1/)
    const activation = await api.activate(PROJECT, {
      requestId: "activate-stable",
      revision: 1,
      expectedRevision: 0,
      printRequestIds: [preparation.requestId],
      physicalPlacementConfirmed: true,
    })
    expect(activation.activeRevision).toBe(1)
    expect(pilotActiveCards(await api.project(PROJECT)).size).toBe(6)
  }, 20_000)

  it.each([
    [401, "unauthorized"],
    [403, "project_forbidden"],
    [409, "revision_conflict"],
  ])("preserves HTTP %s and its stable error code", async (status, code) => {
    const api = new PilotApi(async () => json({ error: code }, status))
    await expect(api.session()).rejects.toMatchObject<Partial<PilotApiError>>({ status, code })
  })

  it("fails closed for cards outside the bound preparation and text that does not fit", async () => {
    await expect(createPilotCardsPdf(preparation, ["unknown"], assetLoader)).rejects.toThrow(
      /nicht Teil der Druckvorbereitung/,
    )
    const oversized = {
      ...preparation,
      cards: [{ ...preparation.cards[0]!, activity: "X".repeat(500) }],
    }
    await expect(createPilotCardsPdf(oversized, undefined, assetLoader)).rejects.toThrow(
      /passt nicht vollstaendig/,
    )
  })

  it("keeps all 900 backend cards available without expanding or truncating the date scope", () => {
    const large = Array.from({ length: 900 }, (_, index) => ({
      ...cards[0]!,
      sourcePlanCardId: `large-${index}`,
      date: index % 2 === 0 ? "2026-10-01" : "2026-11-01",
    }))
    const scoped = pilotCardsInScope(large, "2026-10-01", "2026-10-31")
    expect(scoped).toHaveLength(450)
    expect(scoped[0]?.sourcePlanCardId).toBe("large-0")
    expect(scoped.at(-1)?.sourcePlanCardId).toBe("large-898")
  })

  it("renders the complete low/high backend ID ranges from the official codebook", async () => {
    const bytes = await codebook
    expect(
      new TextDecoder().decode(
        pilotMarkerAssetFromCodebook(bytes, "tagCircle49h12_id00000_card_active_18mm.svg"),
      ),
    ).toContain("tagCircle49h12 ID 0")
    expect(
      new TextDecoder().decode(
        pilotMarkerAssetFromCodebook(bytes, "tagCircle49h12_id65534_board_36mm.svg"),
      ),
    ).toContain("tagCircle49h12 ID 65534")
    expect(() =>
      pilotMarkerAssetFromCodebook(bytes, "tagCircle49h12_id64000_card_active_18mm.svg"),
    ).toThrow(/Rollenbereich/)
    const official = await readFile(
      resolve("public/ana09c4/tagCircle49h12_id00000_card_active_18mm.svg"),
      "ascii",
    )
    const generated = new TextDecoder().decode(
      pilotMarkerAssetFromCodebook(bytes, "tagCircle49h12_id00000_card_active_18mm.svg"),
    )
    const modules = (svg: string) =>
      [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1"\/>/g)].map(
        (match) => `${match[1]}/${match[2]}`,
      )
    expect(modules(generated)).toEqual(modules(official))
  })

  it("derives reuse and replacement only from backend identity, active placement and delta", () => {
    const activePreparation = {
      ...preparation,
      boardId: "previous",
      cards: [preparation.cards[0]!, preparation.cards[1]!],
    }
    const state = {
      profile: "pilot-product-v1" as const,
      sourceProjectId: PROJECT,
      activeRevision: 1,
      synthetic: true,
      activePlacement: { activeRevision: 1, boards: { previous: activePreparation } },
      revisions: [{ revision: 1, predecessor: 0, blocked: false }],
    }
    const nextRevision = {
      ...revision,
      revision: 2,
      predecessor: 1,
      delta: revision.delta.map((delta, index) => ({
        ...delta,
        kind: index === 1 ? ("changed" as const) : ("unchanged" as const),
        changedFields: index === 1 ? ["activity"] : [],
        replacementPrintRequired: index === 1,
      })),
    }
    const active = pilotActiveCards(state)
    expect(pilotCardDisposition(nextRevision.delta[0]!, active)).toBe("reuse")
    expect(pilotCardDisposition(nextRevision.delta[1]!, active)).toBe("replacement_print")
    expect(pilotCardDisposition(nextRevision.delta[2]!, active)).toBe("new_print")
    expect(pilotCardsToPrint(preparation, nextRevision, state)).toEqual([
      "card-2",
      "card-3",
      "card-4",
      "card-5",
      "card-6",
    ])
  })

  it("rejects a print response whose backend identity order differs from the request", () => {
    const request = {
      requestId: preparation.requestId,
      revision: preparation.revision,
      boardId: preparation.boardId,
      cardIds: preparation.cards.map((card) => card.sourcePlanCardId),
    }
    expect(() => assertPilotPrintPreparation(preparation, request, PROJECT)).not.toThrow()
    expect(() =>
      assertPilotPrintPreparation(
        { ...preparation, cards: [...preparation.cards].reverse() },
        request,
        PROJECT,
      ),
    ).toThrow(/Projekt-\/Kartenbindung/)
  })
})
