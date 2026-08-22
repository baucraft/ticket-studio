import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

import {
  filterTagOnlyActivities,
  TAG_ONLY_BOARD_ID_MAX,
  TAG_ONLY_BOARD_ID_MIN,
  TAG_ONLY_CARD_ID_MAX,
  TAG_ONLY_FIXTURE,
  validateTagOnlyFixture,
} from "@/lib/tag-only-target"

const noFilters = { company: "", trade: "", area: "", week: "" }

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
  })

  it.each([
    [
      "tagCircle49h12_id00000_card_active_18mm.svg",
      "48ae2c4c8cf4b2a3246506e037c3cb874cc4be77d2e0aa6295044af9f31ec6b2",
    ],
    [
      "tagCircle49h12_id00001_card_done_18mm.svg",
      "8f2619f71a101af993c35711f85da97799a0a7ca133dfb2f54fdba778b9403c0",
    ],
    [
      "tagCircle49h12_id63486_board_36mm.svg",
      "2f566bf776834379a6cf7d627803ef2c55413f0b09d986d30bbe3e401b7787b8",
    ],
  ])("keeps the ANA-09C4 provenance hash for %s", async (fileName, expectedHash) => {
    const bytes = await readFile(new URL(`../public/ana09c4/${fileName}`, import.meta.url))
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(expectedHash)
  })
})
