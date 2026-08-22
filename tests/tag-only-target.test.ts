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
  TAG_ONLY_FIXTURE,
  tagOnlyBoardMarkerFilename,
  tagOnlyCardMarkerFilename,
  validateTagOnlyFixture,
} from "@/lib/tag-only-target"

const noFilters = { company: "", trade: "", area: "", week: "" }

type AssetManifest = {
  family: string
  quietZoneModulesPerSide: number
  officialProvenance: { assetCommit: string; assetFamilyTreeGitSha1: string }
  assets: Array<{
    tagId: number
    role: "card" | "board"
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
  it("uses a validated synthetic fixture with project-bound source keys", () => {
    const fixture = validateTagOnlyFixture(TAG_ONLY_FIXTURE)
    expect(fixture.scope).toBe("synthetic_non_product_target_picture")
    expect(fixture.projects).toHaveLength(2)
    expect(
      new Set(fixture.activities.map((item) => `${item.sourceProjectId}:${item.sourceActivityId}`))
        .size,
    ).toBe(fixture.activities.length)
    expect(
      fixture.activities.filter((item) => item.sourceActivityId === "SYN-PROC-1001"),
    ).toHaveLength(2)
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
  ])("rejects %s", (_, mutate) => {
    const fixture = structuredClone(TAG_ONLY_FIXTURE)
    mutate(fixture)
    expect(() => validateTagOnlyFixture(fixture)).toThrow()
  })

  it("filters only inside the selected project and board", () => {
    const all = filterTagOnlyActivities(
      TAG_ONLY_FIXTURE,
      "synthetic-project-nord",
      "board-nord-a",
      noFilters,
    )
    expect(all).toHaveLength(4)
    expect(
      filterTagOnlyActivities(TAG_ONLY_FIXTURE, "synthetic-project-nord", "board-nord-a", {
        ...noFilters,
        company: "Mock Partner Blau",
        week: "KW 37",
      }).map((item) => item.sourceActivityId),
    ).toEqual(["SYN-PROC-1002"])
    expect(
      filterTagOnlyActivities(TAG_ONLY_FIXTURE, "synthetic-project-nord", "board-nord-a", {
        ...noFilters,
        trade: "Stahlbau",
      }),
    ).toEqual([])
  })

  it("contains the permanent target-picture qualification in the UI source", async () => {
    const source = await readFile(
      new URL("../src/components/target/TagOnlyTargetView.tsx", import.meta.url),
      "utf8",
    )
    expect(source).toContain("Demonstrator / Zielbild - keine Produktionsfreigabe")
    expect(source).toContain(
      "Tag-only-Layout und physische Erkennung werden noch in Gate G4 validiert",
    )
    expect(source).toContain("Keine LCMD-Liveverbindung")
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
    expect(manifest.family).toBe("tagCircle49h12")
    expect(manifest.quietZoneModulesPerSide).toBe(1)
    expect(manifest.officialProvenance).toMatchObject({
      assetCommit: "f3fd9a7add5bfd82a886fc65240fdb8e3c9ac5a1",
      assetFamilyTreeGitSha1: "52cc190bc5d2824afd5f3fb908283d71de86fc6a",
    })
    expect(manifest.assets).toHaveLength(19)

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
      } else {
        expect(asset.filename).toBe(tagOnlyBoardMarkerFilename(asset.tagId))
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
