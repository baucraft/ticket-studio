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
  StandardFonts,
} from "pdf-lib"
import { describe, expect, it } from "vitest"

import {
  PilotApi,
  PilotApiError,
  parsePilotPrintPreparation,
  type PilotPrintPreparation,
  type PilotRevision,
} from "@/lib/pilot-api"
import { cardMetaLine, cardVisibleMetaLine, mm } from "@/lib/pilot-card-layout"
import {
  createPilotBoardMarkerPdf,
  createPilotCardsPdf,
  pilotMarkerAssetFromCodebook,
} from "@/lib/pilot-print-pdf"
import {
  assertPilotPrintPreparation,
  EMPTY_PILOT_CARD_FILTERS,
  filterPilotCards,
  mergePilotCardSelection,
  normalizePilotFilters,
  PILOT_BOARD_CAPACITY,
  pilotActiveCards,
  pilotCardIdsForPdf,
  pilotCardDisposition,
  pilotCardsInScope,
  pilotCardsToPrint,
  pilotFacetOptions,
  pilotIsoWeek,
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
    sourceProjectName: "Bauabschnitt Nord",
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
  sourceProjectName: "Bauabschnitt Nord",
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
    tradeColor: "#f0c020",
    cardNumber: index + 1,
    cardCount: cards.length,
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

type TextPlacement = {
  text: string
  size: number
  y: number
  rotated: boolean
  bold: boolean
}

function textPlacements(content: string): TextPlacement[] {
  return [
    ...content.matchAll(
      /\/(Helvetica(?:-Bold)?)-\d+ ([\d.]+) Tf\n24 TL\n([-+\d.e]+) [-+\d.e]+ [-+\d.e]+ ([-+\d.e]+) [-+\d.e]+ ([-+\d.e]+) Tm\n<([0-9A-F]+)> Tj/g,
    ),
  ].map((match) => ({
    text: Buffer.from(match[6]!, "hex").toString("latin1"),
    size: Number(match[2]),
    y: Number(match[5]),
    rotated: Number(match[4]) < 0,
    bold: match[1] === "Helvetica-Bold",
  }))
}

async function expectVisibleTextClearance(content: string) {
  const metricsDocument = await PDFDocument.create()
  const normal = await metricsDocument.embedFont(StandardFonts.Helvetica)
  const bold = await metricsDocument.embedFont(StandardFonts.HelveticaBold)
  const placements = textPlacements(content)
  for (const rotated of [false, true]) {
    const lines = placements
      .filter(
        (placement) =>
          placement.rotated === rotated &&
          placement.y / (72 / 25.4) >= (rotated ? 14 : 88) &&
          placement.y / (72 / 25.4) <= (rotated ? 32 : 106),
      )
      .map((placement) => {
        const font = placement.bold ? bold : normal
        const ascent = font.heightAtSize(placement.size, { descender: false })
        const descent = font.heightAtSize(placement.size) - ascent
        return {
          ...placement,
          block: placement.bold ? "title" : "meta",
          depth: rotated ? placement.y : -placement.y,
          ascent,
          descent,
        }
      })
      .sort((left, right) => left.depth - right.depth)

    expect(lines.filter((line) => line.block === "title").length).toBeGreaterThan(0)
    expect(lines.filter((line) => line.block === "meta").length).toBeGreaterThan(0)
    const baselineOrigin = lines[0]!.depth
    expect(lines[0]!.depth - baselineOrigin - lines[0]!.ascent).toBeGreaterThanOrEqual(
      -mm(3) - 0.000001,
    )
    expect(lines.at(-1)!.depth - baselineOrigin + lines.at(-1)!.descent).toBeLessThanOrEqual(
      mm(14) + 0.000001,
    )
    for (let index = 1; index < lines.length; index += 1) {
      const previous = lines[index - 1]!
      const current = lines[index]!
      const clearance = current.depth - current.ascent - (previous.depth + previous.descent)
      const requiredMm = previous.block === current.block ? 0.4 : 0.8
      expect(clearance).toBeGreaterThanOrEqual(mm(requiredMm) - 0.000001)
    }
  }
}

describe("pilot browser flow", () => {
  it("uses the relative cookie API from named login through stable print preparation and PDF", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const responses = [
      json({ username: "member-a" }),
      json({
        username: "member-a",
        sourceProjectIds: [PROJECT],
        projectNames: { [PROJECT]: "Bauabschnitt Nord" },
      }),
      json({
        profile: "pilot-product-v1",
        sourceProjectId: PROJECT,
        sourceProjectName: "Bauabschnitt Nord",
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
    expect(await api.session()).toMatchObject({
      sourceProjectIds: [PROJECT],
      projectNames: { [PROJECT]: "Bauabschnitt Nord" },
    })
    expect(await api.project(PROJECT)).toMatchObject({
      activeRevision: 0,
      sourceProjectName: "Bauabschnitt Nord",
    })
    const synced = await api.sync(PROJECT, {
      requestId: "sync-stable",
      expectedRevision: 0,
      forecastStart: "2026-10-01",
      forecastEnd: "2026-10-31",
      confirmedRemovedCardIds: [],
    })
    expect(new Set(synced.delta.map((item) => item.kind))).toEqual(new Set(["new"]))
    expect(synced.source.sourceProjectName).toBe("Bauabschnitt Nord")
    const printRequest = {
      requestId: "print-stable",
      revision: synced.revision,
      boardId: "kw-40-nord",
      cardIds: synced.source.cards.map((card) => card.sourcePlanCardId),
    }
    const first = await api.preparePrint(PROJECT, printRequest)
    expect(first.sourceProjectName).toBe("Bauabschnitt Nord")
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
    expect(
      cardPdf
        .getPage(0)
        .node.lookup(PDFName.of("PilotCardMarkerOuterEdgeMm"), PDFNumber)
        .asNumber(),
    ).toBe(18)
    expect(
      cardPdf.getPage(0).node.lookup(PDFName.of("PilotInnerShortMm"), PDFNumber).asNumber(),
    ).toBe(62.5)
    expect(
      cardPdf.getPage(0).node.lookup(PDFName.of("PilotInnerLongMm"), PDFNumber).asNumber(),
    ).toBe(117)
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
    expect(cardText.filter((value) => value === "Material bereitstellen")).toHaveLength(2)
    expect(cardText.join(" ")).not.toContain("Karte 1 von 6")
    expect(embeddedCardContent(cardPdf, 0)).toMatch(/0\.9411\d* 0\.7529\d* 0\.1254\d* rg/)
    expect(cardText.join(" ")).toContain("ID activity-a | Trockenbau | Bauteil Nord / Ebene 1")
    expect(cardText.join(" ")).not.toContain("KW 40/26-4")
    expect(cardText.join(" ")).not.toContain("ID: activity-a")
    expect(cardText.join(" ")).not.toContain("ID card-1")
    expect(embeddedCardContent(cardPdf, 0)).toMatch(
      /0\.8509803921568627 0\.9764705882352941 0\.615686274509804 rg/,
    )
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
    const longActivity = "Brandschutzabschottungen im Installationsschacht Nord montieren"
    const longName = {
      ...preparation,
      cards: [{ ...preparation.cards[0]!, activity: longActivity, task: null }],
    }
    const longNamePdf = await PDFDocument.load(
      await createPilotCardsPdf(longName, undefined, assetLoader),
    )
    const longText = textOperators(embeddedCardContent(longNamePdf, 0)).join(" ")
    expect(longText.replaceAll(" ", "").match(/Brandschutzabschottungen/g)).toHaveLength(2)
    expect(longText.replaceAll(" ", "")).toContain("InstallationsschachtNordmontieren")

    const oversized = {
      ...preparation,
      cards: [{ ...preparation.cards[0]!, activity: "X".repeat(500), task: null }],
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
    const capacity = Array.from({ length: PILOT_BOARD_CAPACITY }, (_, index) => `card-${index}`)
    expect(mergePilotCardSelection([], capacity)).toEqual(capacity)
    expect(mergePilotCardSelection(capacity, ["card-900"])).toBeNull()
    expect(mergePilotCardSelection(capacity, ["card-899"])).toEqual(capacity)
  })

  it("renders the ISO week-year and weekday correctly across New Year", async () => {
    expect(cardMetaLine("activity-new-year", "2027-01-01", "Elektro", "Nord")).toBe(
      "ID activity-new-year | KW 53/26-5 | Elektro | Nord",
    )
    expect(cardMetaLine("activity-monday", "2027-01-04", "Elektro", "Nord")).toBe(
      "ID activity-monday | KW 01/27-1 | Elektro | Nord",
    )
    const document = await PDFDocument.load(
      await createPilotCardsPdf(
        {
          ...preparation,
          cards: [
            {
              ...preparation.cards[0]!,
              sourceActivityId: "activity-new-year",
              date: "2027-01-01",
            },
          ],
        },
        undefined,
        assetLoader,
      ),
    )
    expect(textOperators(embeddedCardContent(document, 0)).join(" ")).toContain(
      "ID activity-new-year | Trockenbau | Bauteil Nord / Ebene 1",
    )
    expect(textOperators(embeddedCardContent(document, 0)).join(" ")).not.toContain("KW 53/26-5")
  })

  it("renders a boundary-length tagged title at the readable 1.8 mm minimum", async () => {
    const title = "W".repeat(117)
    const document = await PDFDocument.load(
      await createPilotCardsPdf(
        {
          ...preparation,
          cards: [{ ...preparation.cards[0]!, activity: title, task: null }],
        },
        undefined,
        assetLoader,
      ),
    )
    const content = embeddedCardContent(document, 0)
    expect(
      [...content.matchAll(/ ([\d.]+) Tf/g)].some(
        (match) => Math.abs(Number(match[1]) - (1.8 * 72) / 25.4) < 0.000001,
      ),
    ).toBe(true)
    expect(
      textOperators(content)
        .filter((text) => /^W+$/.test(text))
        .join(""),
    ).toBe(title.repeat(2))
    const placements = textPlacements(content)
    const titlePlacements = placements.filter((placement) => /^W+$/.test(placement.text))
    const secondaryPlacements = placements.filter((placement) =>
      ["AKTIV", "ERLEDIGT", "Kommentar:"].includes(placement.text),
    )
    const planningPlacement = placements.find((placement) => placement.text.startsWith("geplant:"))
    expect(titlePlacements.some((placement) => !placement.rotated)).toBe(true)
    expect(titlePlacements.some((placement) => placement.rotated)).toBe(true)
    expect([...new Set(titlePlacements.map((placement) => placement.size))]).toEqual([mm(1.8)])
    expect(secondaryPlacements).toHaveLength(3)
    expect(planningPlacement).toBeDefined()
    expect(
      [...secondaryPlacements, planningPlacement!].every(
        (placement) => placement.size < titlePlacements[0]!.size,
      ),
    ).toBe(true)
  })

  it("uses the largest fitting title size for a medium tagged card", async () => {
    const document = await PDFDocument.load(
      await createPilotCardsPdf(
        {
          ...preparation,
          cards: [{ ...preparation.cards[0]!, activity: "W".repeat(48), task: null }],
        },
        undefined,
        assetLoader,
      ),
    )
    const sizes = [...embeddedCardContent(document, 0).matchAll(/ ([\d.]+) Tf/g)].map((match) =>
      Number(match[1]),
    )
    const largest = Math.max(...sizes)
    expect(largest).toBeLessThan((3.2 * 72) / 25.4)
    expect(largest).toBeGreaterThan((1.8 * 72) / 25.4)
  })

  it.each([
    {
      name: "one-line title and meta",
      task: "Kurzmontage",
      area: "Nord",
    },
    {
      name: "multi-line title and meta",
      task: "Brandschutzabschottungen fachgerecht montieren und pruefen",
      area: "Bauteil Nord / Ebene 1 / Installationsschacht mit langem Bereichsnamen",
      sourceActivityId: "LCMD-Aktivitaet-0000000000000000000000000000000000000001",
    },
    {
      name: "three title lines at the preferred size before fitting",
      task: "WWWWWWWWWW WWWWWWWWWW WWWWWWWWWW",
      area: "Nord / Ebene 1",
    },
  ])("keeps measured tagged text clearance for $name on both card ends", async (sample) => {
    const document = await PDFDocument.load(
      await createPilotCardsPdf(
        {
          ...preparation,
          cards: [
            {
              ...preparation.cards[0]!,
              task: sample.task,
              area: sample.area,
              sourceActivityId: sample.sourceActivityId ?? preparation.cards[0]!.sourceActivityId,
            },
          ],
        },
        undefined,
        assetLoader,
      ),
    )
    const content = embeddedCardContent(document, 0)
    await expectVisibleTextClearance(content)
    const renderedMeta = textOperators(content).join("").replaceAll(" ", "")
    const expectedMeta = cardVisibleMetaLine(
      sample.sourceActivityId ?? preparation.cards[0]!.sourceActivityId,
      preparation.cards[0]!.trade,
      sample.area,
    ).replaceAll(" ", "")
    expect(renderedMeta.split(expectedMeta)).toHaveLength(3)
  })

  it("does not repeat an identical task below the tagged process title", async () => {
    const activity =
      "Montage vorbereiten und Bauteile im vereinbarten Arbeitsabschnitt fertigstellen"
    const document = await PDFDocument.load(
      await createPilotCardsPdf(
        {
          ...preparation,
          cards: [{ ...preparation.cards[0]!, activity, task: activity }],
        },
        undefined,
        assetLoader,
      ),
    )
    const text = textOperators(embeddedCardContent(document, 0)).join(" ")
    expect(text).not.toContain("Aufgabe:")
    expect(text.match(/Montage vorbereiten/g)).toHaveLength(2)
  })

  it("filters all 1773 scoped cards and disambiguates same-name processes without exposing IDs", () => {
    const large = Array.from({ length: 1773 }, (_, index) => ({
      ...cards[0]!,
      sourcePlanCardId: `card-${index}`,
      sourceActivityId: `process-${index % 2}`,
      activity: "Montage",
      area: index % 2 ? "Nord" : "Sued",
      trade: index % 3 ? "Elektro" : "Trockenbau",
      company: `Firma ${index}`,
      date: index % 2 ? "2026-10-02" : "2026-10-01",
    }))
    const started = performance.now()
    const options = pilotFacetOptions(large, EMPTY_PILOT_CARD_FILTERS, "process")
    expect(options).toHaveLength(2)
    expect(options.map((option) => option.label)).toEqual(
      expect.arrayContaining(["Montage · Nord · 2026-10-02", "Montage · Sued · 2026-10-01"]),
    )
    expect(options.map((option) => option.label).join(" ")).not.toContain("process-")
    expect(
      filterPilotCards(large, {
        ...EMPTY_PILOT_CARD_FILTERS,
        area: ["Nord"],
        trade: ["Elektro"],
        process: ["process-1"],
        week: ["2026-KW40"],
        query: "Firma 1001",
      }),
    ).toHaveLength(1)
    expect(performance.now() - started).toBeLessThan(1171)
  })

  it("combines multiple ISO weeks, facets by the other filters and resets invalid choices", () => {
    const facetCards = [
      { ...cards[0]!, sourcePlanCardId: "north-38", date: "2026-09-14", area: "Nord" },
      { ...cards[0]!, sourcePlanCardId: "north-39", date: "2026-09-21", area: "Nord" },
      {
        ...cards[0]!,
        sourcePlanCardId: "south-40",
        sourceActivityId: "activity-b",
        activity: "Elektro pruefen",
        date: "2026-10-01",
        area: "Sued",
        trade: "Elektro",
      },
    ]
    expect(pilotIsoWeek("2027-01-01")).toBe("2026-KW53")
    expect(
      filterPilotCards(facetCards, {
        ...EMPTY_PILOT_CARD_FILTERS,
        week: ["2026-KW38", "2026-KW39"],
      }),
    ).toHaveLength(2)
    expect(
      pilotFacetOptions(facetCards, { ...EMPTY_PILOT_CARD_FILTERS, area: ["Sued"] }, "week").map(
        (option) => option.value,
      ),
    ).toEqual(["2026-KW40"])
    expect(
      normalizePilotFilters(
        facetCards,
        {
          ...EMPTY_PILOT_CARD_FILTERS,
          area: ["Nord"],
          trade: ["Trockenbau"],
          week: ["2026-KW40"],
        },
        "week",
      ),
    ).toMatchObject({ area: [], trade: [], week: ["2026-KW40"] })
  })

  it("normalizes absent metadata for legacy responses and rejects untrusted color formats", async () => {
    const parsed = parsePilotPrintPreparation({
      ...preparation,
      cards: preparation.cards.map((card) =>
        Object.fromEntries(
          Object.entries(card).filter(
            ([key]) => !["tradeColor", "cardNumber", "cardCount"].includes(key),
          ),
        ),
      ),
    })
    expect(parsed.cards[0]).toMatchObject({ tradeColor: null, cardNumber: null, cardCount: null })
    const legacyPdf = await PDFDocument.load(
      await createPilotCardsPdf(parsed, [parsed.cards[0]!.sourcePlanCardId], assetLoader),
    )
    expect(embeddedCardContent(legacyPdf, 0)).toMatch(/0\.45 0\.48 0\.52 rg/)
    expect(() =>
      parsePilotPrintPreparation({
        ...preparation,
        cards: [{ ...preparation.cards[0], tradeColor: "rgb(1,2,3)" }],
      }),
    ).toThrow(/invalid_api_response/)
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

  it.each([
    { cardNumber: 1, cardCount: null },
    { cardNumber: null, cardCount: 2 },
    { cardNumber: 3, cardCount: 2 },
  ])("rejects incomplete or impossible card numbering %j", (ordinal) => {
    expect(() =>
      parsePilotPrintPreparation({
        ...preparation,
        cards: [{ ...preparation.cards[0], ...ordinal }],
      }),
    ).toThrow(/invalid_api_response/)
  })

  it.each(["project", "boardRevision", "placementRevision"])(
    "rejects mismatched active placement %s",
    async (mismatch) => {
      const state = {
        profile: "pilot-product-v1",
        sourceProjectId: PROJECT,
        activeRevision: 1,
        synthetic: true,
        activePlacement: {
          activeRevision: mismatch === "placementRevision" ? 2 : 1,
          boards: {
            [preparation.boardId]: {
              ...preparation,
              sourceProjectId: mismatch === "project" ? "foreign-project" : PROJECT,
              revision: mismatch === "boardRevision" ? 2 : 1,
            },
          },
        },
        revisions: [{ revision: 1, predecessor: 0, blocked: false }],
      }
      const api = new PilotApi((async () => json(state)) as typeof fetch)
      await expect(api.project(PROJECT)).rejects.toThrow(/invalid_api_response/)
    },
  )

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
    expect(pilotCardIdsForPdf(preparation, nextRevision, state)).toEqual([
      "card-2",
      "card-3",
      "card-4",
      "card-5",
      "card-6",
    ])
    const alreadyPlaced = {
      ...state,
      activeRevision: 2,
      activePlacement: {
        activeRevision: 2,
        boards: { previous: { ...activePreparation, revision: 2 } },
      },
    }
    expect(pilotCardDisposition(nextRevision.delta[1]!, pilotActiveCards(alreadyPlaced), 2)).toBe(
      "reuse",
    )
    expect(pilotCardsToPrint(preparation, nextRevision, alreadyPlaced)).not.toContain("card-2")
    const fullyPlaced = {
      ...alreadyPlaced,
      activePlacement: {
        activeRevision: 2,
        boards: { previous: { ...preparation, revision: 2 } },
      },
    }
    expect(pilotCardsToPrint(preparation, nextRevision, fullyPlaced)).toEqual([])
    expect(pilotCardIdsForPdf(preparation, nextRevision, fullyPlaced)).toEqual(
      preparation.cards.map((card) => card.sourcePlanCardId),
    )
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
