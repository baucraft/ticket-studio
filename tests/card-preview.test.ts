import { describe, expect, it } from "vitest"

import {
  nextPreviewFitStep,
  PREVIEW_FIT_STEPS,
  previewTextOverflows,
} from "@/components/pilot/CardPreview"
import { cardMetaLine, cardVisibleMetaLine } from "@/lib/pilot-card-layout"

describe("studio card preview text fit", () => {
  it("reduces text in bounded readable steps while content overflows", () => {
    let step = 0
    for (let index = 1; index < PREVIEW_FIT_STEPS.length; index += 1) {
      step = nextPreviewFitStep(step, {
        clientHeight: 160,
        clientWidth: 300,
        scrollHeight: 162,
        scrollWidth: 300,
      })
      expect(step).toBe(index)
    }
    expect(PREVIEW_FIT_STEPS[step]).toMatchObject({ titlePx: 12, metaPx: 8 })
    expect(
      nextPreviewFitStep(step, {
        clientHeight: 160,
        clientWidth: 300,
        scrollHeight: 200,
        scrollWidth: 400,
      }),
    ).toBe(step)
    expect(
      previewTextOverflows({
        clientHeight: 160,
        clientWidth: 300,
        scrollHeight: 200,
        scrollWidth: 400,
      }),
    ).toBe(true)
  })

  it("keeps the largest layout when wrapped content fits", () => {
    expect(
      nextPreviewFitStep(0, {
        clientHeight: 160,
        clientWidth: 300,
        scrollHeight: 160.5,
        scrollWidth: 300.5,
      }),
    ).toBe(0)
  })

  it("separates reusable card-face identity from dated Studio context", () => {
    expect(cardVisibleMetaLine("123", "Trockenbau", "Nord")).toBe("ID 123 | Trockenbau | Nord")
    expect(cardVisibleMetaLine("123", "Trockenbau", "Nord")).not.toContain("KW")
    expect(cardMetaLine("123", "2027-01-01", "Trockenbau", "Nord")).toBe(
      "ID 123 | KW 53/26-5 | Trockenbau | Nord",
    )
  })
})
