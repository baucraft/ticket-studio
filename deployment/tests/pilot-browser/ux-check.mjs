import assert from "node:assert/strict"
import { writeFile } from "node:fs/promises"

import { chromium } from "playwright"

const base = process.env.PILOT_UX_BASE ?? "http://127.0.0.1:18081"
const proof = process.env.PILOT_UX_PROOF ?? "/proof"
const project = "synthetic-project"
const cards = Array.from({ length: 6 }, (_, index) => ({
  sourcePlanCardId: `card-${index + 1}`,
  sourceActivityId: "activity-a",
  date: `2026-10-${String(index + 1).padStart(2, "0")}`,
  activity: `Innenausbau ${index + 1}`,
  task: "Material bereitstellen",
  trade: "Trockenbau",
  company: "Beispiel GmbH",
  area: "Nord",
  sourceStatus: "OPEN",
}))
const revision = {
  revision: 1,
  predecessor: 0,
  source: {
    sourceProjectId: project,
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
    kind: "new",
    changedFields: [],
    replacementPrintRequired: false,
  })),
  blocked: false,
}
const preparation = {
  schema: "pilot-print-v1",
  requestId: "request-placeholder",
  requestHash: "c".repeat(64),
  sourceProjectId: project,
  authority: "synthetic-authority",
  synthetic: true,
  revision: 1,
  revisionHash: "d".repeat(64),
  boardId: "tafel-1",
  boardMarkerId: 64000,
  family: "tagCircle49h12",
  layoutVersion: "tag-only-card-v1-18mm",
  cards: cards.map((card, index) => ({
    ...card,
    activeTagId: 10000 + index * 2,
    doneTagId: 10001 + index * 2,
  })),
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const pageErrors = []
let authenticated = false
let prepareCalls = 0
page.on("pageerror", (error) => pageErrors.push(error.message))
await page.route("**/api/pilot/v1/**", async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const respond = (body, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
  if (url.pathname.endsWith("/auth/session")) {
    return authenticated
      ? respond({ username: "member-a", sourceProjectIds: [project] })
      : respond({ error: "unauthorized" }, 401)
  }
  if (url.pathname.endsWith("/auth/login")) {
    authenticated = true
    return respond({ username: "member-a" })
  }
  if (url.pathname.endsWith(`/projects/${project}/revisions/1`)) return respond(revision)
  if (url.pathname.endsWith(`/projects/${project}/sync`)) return respond(revision)
  if (url.pathname.endsWith(`/projects/${project}/print-preparations`)) {
    prepareCalls += 1
    if (prepareCalls === 2) return respond({ error: "revision_conflict" }, 409)
    const requestBody = request.postDataJSON()
    return respond({ ...preparation, requestId: requestBody.requestId })
  }
  if (url.pathname.endsWith(`/projects/${project}`)) {
    return respond({
      profile: "pilot-product-v1",
      sourceProjectId: project,
      activeRevision: 0,
      synthetic: true,
      activePlacement: {},
      revisions: [{ revision: 1, predecessor: 0, blocked: false }],
    })
  }
  return respond({ error: "not_found" }, 404)
})

try {
  await page.goto(base, { waitUntil: "networkidle" })
  if ((await page.getByRole("tab", { name: "Pilot" }).count()) === 0) {
    throw new Error(
      `bootstrap_failed:${JSON.stringify({ body: await page.locator("body").innerText(), pageErrors })}`,
    )
  }
  await page.getByRole("tab", { name: "Pilot" }).click()
  await page.getByLabel("Benutzername").fill("member-a")
  await page.getByLabel("Passwort").fill("test-only-password")
  await page.getByRole("button", { name: "Anmelden" }).click()
  await page.getByRole("heading", { name: "Delta verstehen" }).waitFor()

  await page.setViewportSize({ width: 390, height: 844 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  assert.ok(overflow <= 1, `mobile page overflows by ${overflow}px`)
  await page.getByLabel("Forecast von").fill("2026-10-02")
  let forecastNavigationGuarded = false
  page.once("dialog", async (dialog) => {
    forecastNavigationGuarded = dialog.message().includes("noch nicht abgeschlossen")
    await dialog.dismiss()
  })
  await page.getByRole("tab", { name: "Zielbild" }).click()
  assert.equal(forecastNavigationGuarded, true)
  await page.getByLabel("Forecast von").fill("2026-10-01")
  await page.getByRole("button", { name: /LCMD synchronisieren/ }).click()
  await page.getByText("LCMD-Stand als Revision 1 synchronisiert.").waitFor()
  await page.getByRole("button", { name: /Alle 6 verfuegbaren/ }).click()

  const beforeUnloadPrevented = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true })
    return !window.dispatchEvent(event)
  })
  assert.equal(beforeUnloadPrevented, true)
  let navigationGuarded = false
  page.once("dialog", async (dialog) => {
    navigationGuarded = dialog.message().includes("noch nicht abgeschlossen")
    await dialog.dismiss()
  })
  await page.getByRole("tab", { name: "Zielbild" }).click()
  assert.equal(navigationGuarded, true)
  await page.getByRole("heading", { name: "Delta verstehen" }).waitFor()
  await page.screenshot({ path: `${proof}/studio-mobile.png`, fullPage: true })

  await page.getByRole("button", { name: "Druck vorbereiten", exact: true }).click()
  await page.getByText("Backendbindung steht").waitFor()
  const preparedMobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  )
  assert.ok(
    preparedMobileOverflow <= 1,
    `prepared mobile page overflows by ${preparedMobileOverflow}px`,
  )
  await page.getByRole("button", { name: "Karten-PDF" }).scrollIntoViewIfNeeded()
  assert.equal(await page.getByRole("button", { name: "Karten-PDF" }).isVisible(), true)
  await page.screenshot({ path: `${proof}/studio-mobile-prepared.png`, fullPage: true })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.screenshot({ path: `${proof}/studio-wide.png`, fullPage: true })
  await page.getByRole("button", { name: /Identisch erneut anfordern/ }).click()
  await page
    .getByRole("alert")
    .getByText(/Projektstand hat sich geaendert/)
    .waitFor()
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "alert")
  assert.deepEqual(pageErrors, [])
  await writeFile(
    `${proof}/studio-ux-result.json`,
    `${JSON.stringify({ passed: true, mobileOverflow: overflow, preparedMobileOverflow, navigationGuarded, forecastNavigationGuarded, beforeUnloadPrevented, errorFocus: true }, null, 2)}\n`,
  )
} finally {
  await browser.close()
}
