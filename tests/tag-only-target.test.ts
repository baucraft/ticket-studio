import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { TagCard, TagOnlyTargetView } from "@/components/target/TagOnlyTargetView"
import {
  filterTagOnlyActivities,
  TAG_ONLY_ASSET_MANIFEST_SHA256,
  TAG_ONLY_BOUND_BOARD_IDS,
  TAG_ONLY_BOUND_CARD_IDS,
  TAG_ONLY_BOARD_ID_MAX,
  TAG_ONLY_BOARD_ID_MIN,
  TAG_ONLY_CARD_ID_MAX,
  TAG_ONLY_CANONICAL_SOURCE_SHA256,
  TAG_ONLY_FIXTURE,
  tagOnlyBoardMarkerFilename,
  tagOnlyCardMarkerFilename,
  validateTagOnlyFixture,
} from "@/lib/tag-only-target"

const noFilters = { company: [], trade: [], area: [], week: [], query: "" }

type AssetManifest = {
  schemaVersion: string
  fixtureVersion: string
  fixtureSha256: string
  canonicalSource: { path: string; sha256: string }
  quietZoneModulesPerSide: number
  officialProvenance: {
    assetCommit: string
    assetFamilyTreeGitSha1: Record<string, string>
  }
  assets: Array<{
    family: "tagCircle49h12" | "tagStandard52h13"
    tagId: number
    role: "card" | "board" | "reference"
    status: "active" | "done" | null
    filename: string
    sourcePngSha256: string
    svgSha256: string
  }>
}

async function assetManifest(): Promise<AssetManifest> {
  return JSON.parse(
    await readFile(new URL("../public/ana09c4/manifest.json", import.meta.url), "ascii"),
  ) as AssetManifest
}

const ASSET_ROOT = new URL("../public/ana09c4/", import.meta.url)

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function colorContrast(foreground: string, background: string): number {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function tintWithWhite(hex: string, ratio: number): string {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16))
    .map((channel) => Math.round(channel * ratio + 255 * (1 - ratio)))
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

describe("DEMO-04 Tag-only target picture", () => {
  it("uses stable demo bootstrap keys while every LCMD source binding remains unbound", () => {
    const fixture = validateTagOnlyFixture(TAG_ONLY_FIXTURE)
    expect(fixture.scope).toBe("synthetic_non_product_preflight")
    expect(fixture.demoProjects).toEqual([
      {
        demoProjectKey: "DEMO-04",
        name: "DEMO-04 / synthetischer, nichtproduktiver Testlauf",
      },
    ])
    expect(fixture.activities).toHaveLength(50)
    expect(fixture.activities.filter((item) => item.featured)).toHaveLength(8)
    expect(fixture.activities.map((item) => item.demoActivityKey)).toEqual(
      Array.from({ length: 50 }, (_, index) => `D04-${String(index + 1).padStart(3, "0")}`),
    )
    expect(new Set(fixture.activities.map((item) => item.demoProjectKey))).toEqual(
      new Set(["DEMO-04"]),
    )
    expect(fixture.activities.every((item) => item.sourceBinding.state === "unbound")).toBe(true)
    expect(new Set(fixture.boards.map((item) => item.demoArea))).toEqual(new Set(["Nord", "Sued"]))
    expect(
      fixture.boards.map(
        (board) => fixture.activities.filter((item) => item.boardId === board.id).length,
      ),
    ).toEqual([18, 16, 16])
  })

  it("keeps every card in the ANA-09C4 pair contract and board IDs reserved", () => {
    validateTagOnlyFixture(TAG_ONLY_FIXTURE)
    for (const item of TAG_ONLY_FIXTURE.activities) {
      expect(item.activeTagId).toBe(2 * item.markerSlot)
      expect(item.doneTagId).toBe(2 * item.markerSlot + 1)
      expect(item.activeTagId).toBeGreaterThanOrEqual(0)
      expect(item.doneTagId).toBeLessThanOrEqual(TAG_ONLY_CARD_ID_MAX)
    }
    for (const board of TAG_ONLY_FIXTURE.boards) {
      expect(board.boardMarkerId).toBeGreaterThanOrEqual(TAG_ONLY_BOARD_ID_MIN)
      expect(board.boardMarkerId).toBeLessThanOrEqual(TAG_ONLY_BOARD_ID_MAX)
    }
  })

  it("renders both status markers on the same physical card", () => {
    const item = TAG_ONLY_FIXTURE.activities[1]
    const html = renderToStaticMarkup(createElement(TagCard, { activity: item, done: false }))
    expect(html).toContain('data-card-end="active"')
    expect(html).toContain('data-card-end="done"')
    expect(html).toContain(`data-marker-id="${item.activeTagId}"`)
    expect(html).toContain(`data-marker-id="${item.doneTagId}"`)
    expect(html.match(/data-marker-status=/g)).toHaveLength(2)
  })

  it("rotates the whole card without changing either marker ID", () => {
    const item = TAG_ONLY_FIXTURE.activities[2]
    const active = renderToStaticMarkup(createElement(TagCard, { activity: item, done: false }))
    const done = renderToStaticMarkup(createElement(TagCard, { activity: item, done: true }))
    const ids = (html: string) =>
      [...html.matchAll(/data-marker-id="(\d+)"/g)].map((match) => match[1])
    expect(ids(active)).toEqual([String(item.activeTagId), String(item.doneTagId)])
    expect(ids(done)).toEqual(ids(active))
    expect(active).toContain('data-card-orientation="active"')
    expect(active).not.toContain("tag-only-card rotate-180")
    expect(done).toContain('data-card-orientation="done"')
    expect(done).toContain("tag-only-card rotate-180")
  })

  it("keeps the done end internally rotated by 180 degrees", async () => {
    const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8")
    expect(css).toMatch(/\.tag-only-card__end--done\s*{[^}]*transform:\s*rotate\(180deg\)/s)
  })

  it.each([
    [
      "fractional card slot",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        fixture.activities[0].markerSlot = 0.5
        fixture.activities[0].activeTagId = 1
        fixture.activities[0].doneTagId = 2
      },
    ],
    [
      "fractional board marker",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        fixture.boards[0].boardMarkerId = 63486.5
      },
    ],
    [
      "duplicate board marker",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        fixture.boards[1].boardMarkerId = fixture.boards[0].boardMarkerId
      },
    ],
    [
      "invented LCMD source binding",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        ;(fixture.activities[0].sourceBinding as { state: string }).state = "bound"
      },
    ],
    [
      "invented LCMD process field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        ;(
          fixture.activities[0] as (typeof fixture.activities)[0] & { lcmdProcessId: string }
        ).lcmdProcessId = "invented-4711"
      },
    ],
    [
      "invented LCMD project field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.demoProjects[0], { lcmdProjectId: "invented-project" })
      },
    ],
    [
      "legacy source project field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.demoProjects[0], { sourceProjectId: "invented-source-project" })
      },
    ],
    [
      "unknown demo project field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.demoProjects[0], { unexpected: true })
      },
    ],
    [
      "invented LCMD board field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.boards[0], { lcmdBoardId: "invented-board" })
      },
    ],
    [
      "legacy source board field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.boards[0], { sourceBoardId: "invented-source-board" })
      },
    ],
    [
      "unknown board field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.boards[0], { unexpected: true })
      },
    ],
    [
      "invented preflight sequence identity",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.preflight.sequence[0], { lcmdBoardId: "invented-board" })
      },
    ],
    [
      "unknown preflight sequence field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.preflight.sequence[0], { unexpected: true })
      },
    ],
    [
      "invented root identity",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture, { lcmdProjectId: "invented-project" })
      },
    ],
    [
      "unknown nested contract field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.printContract, { unexpected: true })
      },
    ],
    [
      "unknown provenance field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.provenance, { unexpected: true })
      },
    ],
    [
      "unknown identity contract field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.identityContract, { lcmdProjectId: "invented-project" })
      },
    ],
    [
      "unknown preflight field",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.preflight, { unexpected: true })
      },
    ],
    [
      "nested source binding identity",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        Object.assign(fixture.activities[0].sourceBinding, { lcmdProcessId: "invented-process" })
      },
    ],
    [
      "identity object in preflight instructions",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        ;(fixture.preflight.instructions as unknown[])[0] = { lcmdProjectId: "invented-project" }
      },
    ],
    [
      "coordinated board identity substitution",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        const previousId = fixture.boards[0].id
        fixture.boards[0].id = "lcmd-board-4711"
        fixture.preflight.sequence[0].boardId = fixture.boards[0].id
        for (const activity of fixture.activities) {
          if (activity.boardId === previousId) activity.boardId = fixture.boards[0].id
        }
      },
    ],
    [
      "coordinated demo activity key swap",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        const firstKey = fixture.activities[0].demoActivityKey
        fixture.activities[0].demoActivityKey = fixture.activities[1].demoActivityKey
        fixture.activities[1].demoActivityKey = firstKey
      },
    ],
    [
      "coordinated allowed board identity bundle swap",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        const first = fixture.boards[0]
        const second = fixture.boards[1]
        ;[first.id, second.id] = [second.id, first.id]
        ;[first.boardMarkerId, second.boardMarkerId] = [second.boardMarkerId, first.boardMarkerId]
      },
    ],
    [
      "coordinated activity identity bundle swap",
      (fixture: typeof TAG_ONLY_FIXTURE) => {
        const first = fixture.activities[4]
        const second = fixture.activities[5]
        ;[first.demoActivityKey, second.demoActivityKey] = [
          second.demoActivityKey,
          first.demoActivityKey,
        ]
        ;[first.markerSlot, second.markerSlot] = [second.markerSlot, first.markerSlot]
        ;[first.activeTagId, second.activeTagId] = [second.activeTagId, first.activeTagId]
        ;[first.doneTagId, second.doneTagId] = [second.doneTagId, first.doneTagId]
      },
    ],
  ])("rejects %s", (_, mutate) => {
    const fixture = structuredClone(TAG_ONLY_FIXTURE)
    mutate(fixture)
    expect(() => validateTagOnlyFixture(fixture)).toThrow()
  })

  it("filters only inside the selected demo context and board", () => {
    const all = filterTagOnlyActivities(TAG_ONLY_FIXTURE, "DEMO-04", "board-nord-a", noFilters)
    expect(all).toHaveLength(18)
    expect(
      filterTagOnlyActivities(TAG_ONLY_FIXTURE, "DEMO-04", "board-nord-a", {
        ...noFilters,
        company: ["Mock Partner Blau"],
        week: ["KW 37"],
      }).map((item) => item.demoActivityKey),
    ).toEqual(["D04-002"])
    expect(
      filterTagOnlyActivities(TAG_ONLY_FIXTURE, "DEMO-04", "board-nord-a", {
        ...noFilters,
        trade: ["Sanitaer"],
      }),
    ).toEqual([])
    const combined = filterTagOnlyActivities(TAG_ONLY_FIXTURE, "", "", {
      ...noFilters,
      trade: ["Elektro", "Trockenbau"],
      week: ["KW 36", "KW 37", "KW 38"],
    })
    expect(combined.length).toBeGreaterThan(1)
    expect(new Set(combined.map((item) => item.trade))).toEqual(new Set(["Elektro", "Trockenbau"]))
    expect(new Set(combined.map((item) => item.week))).toEqual(new Set(["KW 36", "KW 37", "KW 38"]))
    expect(
      filterTagOnlyActivities(TAG_ONLY_FIXTURE, "", "", {
        ...noFilters,
        query: "282",
      }).map((item) => item.demoActivityKey),
    ).toEqual(["D04-050"])
  })

  it("contains the permanent target-picture qualification in the UI source", async () => {
    const source = await readFile(
      new URL("../src/components/target/TagOnlyTargetView.tsx", import.meta.url),
      "utf8",
    )
    expect(source).toContain("DEMO-04 / synthetischer, nichtproduktiver Testlauf")
    expect(source).toContain("Noch nicht an einen LCMD-Export gebunden")
    expect(source).toContain("Demo-Tag-IDs vorab reserviert, nicht produktiv vergeben")
    expect(source).toContain(
      "Tag-only-Layout und physische Erkennung nicht durch Gate G4 freigegeben",
    )
    expect(source).toContain("Keine LCMD-Liveverbindung")
    expect(source).toContain("Kein Writeback")
    expect(source).toContain("Keine validierte laufende Synchronisierung")
    expect(source).toContain("Nur Messeauswahl (8)")
    expect(source).toContain("Alle 50 anzeigen")
    expect(source).toContain("Filter-Scope: 50 synthetische Demo-Vorgaenge")
    expect(source).toContain("keine Vergabe und keine Persistenz")
    expect(source).not.toContain("Markerbild nicht Bestandteil")
    expect(source).not.toContain("crypto.subtle")
    expect(source).not.toContain("createObjectURL")
    expect(source).not.toContain("verifyTagOnlyAssetDelivery")
  })

  it("binds every fixture card pair and board to a SHA-256 verified official asset", async () => {
    const manifestBytes = await readFile(
      new URL("../public/ana09c4/manifest.json", import.meta.url),
    )
    expect(createHash("sha256").update(manifestBytes).digest("hex")).toBe(
      TAG_ONLY_ASSET_MANIFEST_SHA256,
    )
    const manifest = await assetManifest()
    expect(manifest.schemaVersion).toBe("demo04-tag-only-assets-v2")
    expect(manifest.fixtureVersion).toBe(TAG_ONLY_FIXTURE.fixtureVersion)
    expect(manifest.fixtureSha256).toBe(TAG_ONLY_CANONICAL_SOURCE_SHA256)
    expect(manifest.canonicalSource).toEqual({
      path: "src/data/demo-04-synthetic-activities.v1.json",
      sha256: TAG_ONLY_CANONICAL_SOURCE_SHA256,
    })
    expect(manifest.quietZoneModulesPerSide).toBe(1)
    expect(manifest.officialProvenance).toMatchObject({
      assetCommit: "f3fd9a7add5bfd82a886fc65240fdb8e3c9ac5a1",
      assetFamilyTreeGitSha1: {
        tagCircle49h12: "52cc190bc5d2824afd5f3fb908283d71de86fc6a",
        tagStandard52h13: "eddc1dd85b74f711d8a07b82e326f12d00bf155c",
      },
    })
    expect(manifest.assets).toHaveLength(105)

    const expectedCardIds = new Set(
      TAG_ONLY_FIXTURE.activities.flatMap((item) => [item.activeTagId, item.doneTagId]),
    )
    const expectedBoardIds = new Set(TAG_ONLY_FIXTURE.boards.map((board) => board.boardMarkerId))
    expect(expectedCardIds).toEqual(TAG_ONLY_BOUND_CARD_IDS)
    expect(expectedBoardIds).toEqual(TAG_ONLY_BOUND_BOARD_IDS)

    for (const asset of manifest.assets) {
      const bytes = await readFile(new URL(`../public/ana09c4/${asset.filename}`, import.meta.url))
      expect(asset.sourcePngSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.svgSha256)
      if (asset.role === "card") {
        expect(asset.filename).toBe(
          tagOnlyCardMarkerFilename(asset.tagId, asset.status as "active" | "done"),
        )
      } else if (asset.role === "board") {
        expect(asset.filename).toBe(tagOnlyBoardMarkerFilename(asset.tagId))
      } else {
        expect(asset.family).toBe("tagStandard52h13")
        expect(asset.filename).toMatch(/^tagStandard52h13_id00000_reference_/)
      }
    }
    const svgFiles = (await readdir(ASSET_ROOT)).filter((filename) => filename.endsWith(".svg"))
    expect(svgFiles.sort()).toEqual(manifest.assets.map((asset) => asset.filename).sort())
  })

  it("renders the target mode without crypto.subtle", () => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} })
    try {
      const html = renderToStaticMarkup(createElement(TagOnlyTargetView))
      expect(html).toContain('data-card-orientation="active"')
      expect(html.match(/data-marker-status=/g)).toHaveLength(2)
      expect(html).toContain("tagCircle49h12_id00000_card_active_18mm.svg")
      expect(html).not.toContain("Zielbild blockiert")
    } finally {
      if (cryptoDescriptor) Object.defineProperty(globalThis, "crypto", cryptoDescriptor)
      else Reflect.deleteProperty(globalThis, "crypto")
    }
  })

  it("fails closed for card and board IDs without a bound vector", () => {
    expect(() => tagOnlyCardMarkerFilename(2, "active")).toThrow("Kein gebundenes")
    expect(() => tagOnlyBoardMarkerFilename(63489)).toThrow("Kein gebundenes")
  })

  it("uses one stable mock color per trade and distinct colors across trades", () => {
    const colorsByTrade = new Map<string, Set<string>>()
    for (const item of TAG_ONLY_FIXTURE.activities) {
      const colors = colorsByTrade.get(item.trade) ?? new Set<string>()
      colors.add(item.tradeColor)
      colorsByTrade.set(item.trade, colors)
      expect(item.tradeColorSource).toBe("synthetic_mock")
    }
    expect([...colorsByTrade.values()].every((colors) => colors.size === 1)).toBe(true)
    expect(new Set([...colorsByTrade.values()].map((colors) => [...colors][0])).size).toBe(
      colorsByTrade.size,
    )
    for (const colors of colorsByTrade.values()) {
      const color = [...colors][0]
      expect(colorContrast(color, tintWithWhite(color, 0.1))).toBeGreaterThanOrEqual(4.5)
    }
  })
})
