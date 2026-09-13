import { writeFile } from "node:fs/promises"
import assert from "node:assert/strict"

import { chromium } from "playwright"

const base = "https://ticket-studio.dreso.int:8443"
const project = process.env.PILOT_TEST_PROJECT
if (!project) throw new Error("PILOT_TEST_PROJECT is required")

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Authorization: `Basic ${Buffer.from("static-test:static-only-password").toString("base64")}`,
  },
  acceptDownloads: true,
})
await context.addInitScript(() => {
  const ids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000004",
    "00000000-0000-4000-8000-000000000005",
    "00000000-0000-4000-8000-000000000006",
  ]
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: () => ids.shift() ?? `00000000-0000-4000-8000-${String(Date.now()).slice(-12)}`,
  })
})
const page = await context.newPage()
const errors = []
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`)
})
page.on("pageerror", (error) => errors.push(`page: ${error.message}`))
await page.goto(base, { waitUntil: "networkidle" })
await page.waitForTimeout(1000)
await writeFile(
  "/proof/browser-bootstrap.json",
  `${JSON.stringify({ url: page.url(), title: await page.title(), body: await page.locator("body").innerText(), errors }, null, 2)}\n`,
)
await page.getByRole("tab", { name: "Pilot" }).click()
await page.getByLabel("Benutzername").fill("member-a")
await page.getByLabel("Passwort").fill("test-only-password")
await page.getByRole("button", { name: "Anmelden" }).click()
await page.getByRole("heading", { name: "Delta verstehen" }).waitFor()
await page.setViewportSize({ width: 390, height: 844 })
const mobileOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
)
assert.ok(mobileOverflow <= 1, `mobile page overflows by ${mobileOverflow}px`)
await page.screenshot({ path: "/proof/studio-mobile.png", fullPage: true })
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
await page.getByRole("button", { name: "Druck vorbereiten", exact: true }).click()
await page.getByText("Backendbindung steht").waitFor()
const preparedMobileOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
)
assert.ok(
  preparedMobileOverflow <= 1,
  `prepared mobile page overflows by ${preparedMobileOverflow}px`,
)
await page.getByRole("button", { name: "Karten-PDF" }).scrollIntoViewIfNeeded()
assert.equal(await page.getByRole("button", { name: "Karten-PDF" }).isVisible(), true)
await page.setViewportSize({ width: 1366, height: 900 })
await page.screenshot({ path: "/proof/studio-wide.png", fullPage: true })
await page.getByRole("button", { name: /Identisch erneut anfordern/ }).click()
await page.getByText("backendgebunden vorbereitet").waitFor()

const cardDownload = page.waitForEvent("download")
await page.getByRole("button", { name: "Karten-PDF" }).click()
const cards = await cardDownload
await cards.saveAs("/proof/cards.pdf")
const markerDownload = page.waitForEvent("download")
await page.getByRole("button", { name: "Tafelmarker" }).click()
const marker = await markerDownload
await marker.saveAs("/proof/marker.pdf")

const preparationRoute = `**/api/pilot/v1/projects/${project}/print-preparations`
await page.route(preparationRoute, async (route) => {
  await route.fulfill({
    status: 409,
    contentType: "application/json",
    body: JSON.stringify({ error: "revision_conflict" }),
  })
})
await page.getByRole("button", { name: /Identisch erneut anfordern/ }).click()
await page
  .getByRole("alert")
  .getByText(/Projektstand hat sich geaendert/)
  .waitFor()
assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "alert")
if ((await page.getByText("Backendbindung steht").count()) !== 0) {
  throw new Error("conflict_kept_stale_preparation")
}
await page.unroute(preparationRoute)
await page.getByRole("button", { name: "Druck vorbereiten", exact: true }).click()
await page.getByText("Backendbindung steht").waitFor()

await page.getByLabel(/Alle vorbereiteten Tafeln wurden entsprechend/).check()
await page.getByRole("button", { name: "Revision aktivieren" }).click()
await page.getByText("ist nach bestaetigtem physischem Umstecken aktiv").waitFor()

for (let index = 0; index < 3; index += 1) {
  await page.getByRole("button", { name: "Tafel hinzufuegen" }).click()
}
if ((await page.locator("article").count()) !== 4) throw new Error("dynamic_board_count_failed")

const conflict = await page.evaluate(
  async ({ project }) => {
    const revision = await fetch(
      `/api/pilot/v1/projects/${encodeURIComponent(project)}/revisions/1`,
    ).then((response) => response.json())
    const response = await fetch(
      `/api/pilot/v1/projects/${encodeURIComponent(project)}/print-preparations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: "studio-print-00000000-0000-4000-8000-000000000003",
          revision: 1,
          boardId: "tafel-1",
          cardIds: [revision.source.cards[0].sourcePlanCardId],
        }),
      },
    )
    return { status: response.status, body: await response.json() }
  },
  { project },
)
if (conflict.status !== 409 || conflict.body.error !== "idempotency_conflict") {
  throw new Error(`conflict_check_failed:${JSON.stringify(conflict)}`)
}

const forbidden = await page.evaluate(async () => {
  const response = await fetch("/api/pilot/v1/projects/not-authorized")
  return { status: response.status, body: await response.json() }
})
if (forbidden.status !== 403 || forbidden.body.error !== "project_forbidden") {
  throw new Error(`forbidden_check_failed:${JSON.stringify(forbidden)}`)
}

await page.reload({ waitUntil: "networkidle" })
await page.getByRole("tab", { name: "Pilot" }).click()
await page.getByRole("heading", { name: "Delta verstehen" }).waitFor()
await context.clearCookies()
await page.reload({ waitUntil: "networkidle" })
await page.getByRole("tab", { name: "Pilot" }).click()
await page.getByRole("heading", { name: "Persoenlich anmelden" }).waitFor()
await page.getByLabel("Benutzername").fill("member-a")
await page.getByLabel("Passwort").fill("test-only-password")
await page.getByRole("button", { name: "Anmelden" }).click()
await page.getByRole("button", { name: /Abmelden/ }).click()
await page.getByRole("heading", { name: "Persoenlich anmelden" }).waitFor()

const unexpectedErrors = errors.filter(
  (message) =>
    !/Failed to load resource: the server responded with a status of (401|403|409)/.test(message),
)
if (unexpectedErrors.length) {
  throw new Error(`browser_errors:${JSON.stringify(unexpectedErrors)}`)
}
await writeFile(
  "/proof/browser-result.json",
  `${JSON.stringify(
    {
      result: "pass",
      flow: [
        "login",
        "session",
        "sync",
        "delta",
        "prepare",
        "mobile-layout",
        "navigation-guard",
        "error-focus",
        "repeat",
        "cards-pdf",
        "marker-pdf",
        "ui-conflict-clears-preparation",
        "activate",
      ],
      boardCount: 4,
      reload: true,
      statuses: { unauthorized: 401, forbidden: forbidden.status, conflict: conflict.status },
      downloads: [cards.suggestedFilename(), marker.suggestedFilename()],
      expectedHttpConsoleErrors: errors.length,
      browserErrors: unexpectedErrors,
    },
    null,
    2,
  )}\n`,
)
await browser.close()
