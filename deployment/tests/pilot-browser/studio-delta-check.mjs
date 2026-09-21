import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"

import { decodePDFRawStream, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib"
import { chromium } from "playwright"
import * as XLSX from "../../../public/vendor/xlsx-0.20.3.mjs"

const base = process.env.STUDIO_DELTA_BASE ?? "http://127.0.0.1:18081"
const proof = process.env.STUDIO_DELTA_PROOF ?? "/proof"

function excelSerial(date) {
  return (Date.parse(`${date}T00:00:00.000Z`) - Date.UTC(1899, 11, 30)) / 86_400_000
}

function workbook(rows) {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Prozessplan")
  return Buffer.from(XLSX.write(book, { type: "array", bookType: "xlsx" }))
}

const headers = [
  "Id",
  "Prozessname",
  "Startdatum",
  "Enddatum",
  "Dauer",
  "Gewerk",
  "Gewerk Hintergrundfarbe",
  "Bereich Ebene 1",
  "Kommentare",
]
const firstImport = workbook([
  headers,
  [
    101,
    "Waende stellen",
    excelSerial("2026-09-14"),
    excelSerial("2026-09-20"),
    99,
    "Trockenbau",
    "RGB(15,118,110)",
    "Nord",
    "Material bereitstellen",
  ],
  [
    202,
    "Leitungen montieren",
    excelSerial("2026-09-28"),
    excelSerial("2026-10-02"),
    1,
    "Elektro",
    "RGB(3,105,161)",
    "Sued",
    "Trasse pruefen",
  ],
])
const secondImport = workbook([
  headers,
  [
    303,
    "Decke schliessen",
    excelSerial("2026-09-21"),
    excelSerial("2026-09-21"),
    1,
    "Trockenbau",
    "RGB(15,118,110)",
    "West",
    "Freigabe pruefen",
  ],
])
const rejectedImport = workbook([
  ["Id", "Prozess ID", "Aufgabe", "Datum"],
  ["card-1", 101, "Waende stellen", excelSerial("2026-09-14")],
])

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ acceptDownloads: true })
const page = await context.newPage()
const errors = []
page.on("pageerror", (error) => errors.push(error.message))
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text())
})
await page.route("**/api/pilot/v1/**", (route) =>
  route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: "unauthorized" }),
  }),
)

async function toggleFacet(label, option) {
  await page.getByRole("button", { name: new RegExp(`^${label}:`) }).click()
  await page.getByRole("menuitemcheckbox", { name: option, exact: true }).click()
  await page.keyboard.press("Escape")
}

async function clearFacet(label) {
  await toggleFacet(label, "Alle verfuegbaren")
}

function embeddedCardContent(document, pageIndex) {
  const resources = document.getPage(pageIndex).node.Resources()
  assert.ok(resources)
  const objects = resources.lookup(PDFName.of("XObject"), PDFDict)
  return objects
    .entries()
    .map(([, object]) => {
      const stream = document.context.lookup(object, PDFRawStream)
      return Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")
    })
    .join("\n")
}

try {
  await page.goto(base, { waitUntil: "networkidle" })
  if ((await page.getByRole("tab", { name: "Pilot" }).count()) === 0) {
    throw new Error(
      `bootstrap_failed:${JSON.stringify({ body: await page.locator("body").innerText(), errors })}`,
    )
  }
  await page.getByRole("tab", { name: "Pilot" }).click()
  await page.getByRole("button", { name: /Prozessplan-XLSX ohne Tags/ }).click()
  await page.getByRole("heading", { name: "Auswaehlen, pruefen, gezielt drucken." }).waitFor()

  await page.locator('input[type="file"]').setInputFiles({
    name: "prozessplan-a.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: firstImport,
  })
  await page.getByRole("heading", { name: "Welche Tage sind Arbeitstage?" }).waitFor()
  assert.equal(await page.getByText(/Dauer-Spalte/).count(), 1)
  await page.getByLabel(/Mo-Sa/).check()
  await page.getByRole("button", { name: "Arbeitswoche bestaetigen" }).click()
  await page.getByText("Bestaetigt: Mo-Sa / 11 Karten").waitFor()

  await toggleFacet("ISO-Woche", "KW 38 / 2026")
  await toggleFacet("ISO-Woche", "KW 40 / 2026")
  await page.getByRole("button", { name: "ISO-Woche: 2 ausgewaehlt" }).waitFor()
  await toggleFacet("Bereich", "Nord")
  await page.getByRole("button", { name: /^Gewerk:/ }).click()
  assert.equal(await page.getByRole("menuitemcheckbox", { name: "Trockenbau" }).count(), 1)
  assert.equal(await page.getByRole("menuitemcheckbox", { name: "Elektro" }).count(), 0)
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "ISO-Woche: KW 38 / 2026" }).waitFor()
  await page.getByRole("button", { name: "Alle 6 gefilterten auswaehlen" }).click()
  await clearFacet("Bereich")
  await clearFacet("ISO-Woche")
  await toggleFacet("ISO-Woche", "KW 40 / 2026")
  await page.getByRole("button", { name: /^Bereich:/ }).click()
  assert.equal(await page.getByRole("menuitemcheckbox", { name: "Sued" }).count(), 1)
  assert.equal(await page.getByRole("menuitemcheckbox", { name: "Nord" }).count(), 0)
  await page.keyboard.press("Escape")
  await toggleFacet("Bereich", "Sued")
  await page.getByText(/6 ausgewaehlt.*6 durch Filter ausgeblendet/).waitFor()
  await page
    .getByRole("button", { name: /Leitungen montieren fuer Druck auswaehlen/ })
    .first()
    .click()
  await page.getByText("Leitungen montieren", { exact: true }).first().click()
  const previewCard = page.getByLabel("Taglose Karte in Aktiv-Orientierung")
  const completedEnd = previewCard.locator('[data-card-status="done"]')
  assert.equal(
    await completedEnd.evaluate((element) => getComputedStyle(element).backgroundColor),
    "rgb(219, 245, 230)",
  )
  assert.equal(
    await completedEnd.evaluate((element) => getComputedStyle(element).borderTopColor),
    "rgb(3, 105, 161)",
  )
  assert.equal(
    await completedEnd
      .getByText("Leitungen montieren", { exact: true })
      .evaluate((element) => getComputedStyle(element).fontSize),
    "18px",
  )
  await page.getByText(/7 ausgewaehlte Karten als PDF/).waitFor()
  assert.equal(await page.getByText("Vorschau ist keine Druckauswahl.").count(), 1)
  const beforeUnloadPrevented = await page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true })
    return !window.dispatchEvent(event)
  })
  assert.equal(beforeUnloadPrevented, true)

  const downloadEvent = page.waitForEvent("download")
  await page.getByRole("button", { name: /7 ausgewaehlte Karten als PDF/ }).click()
  const download = await downloadEvent
  const downloadPath = await download.path()
  assert.ok(downloadPath)
  const pdf = await PDFDocument.load(await readFile(downloadPath))
  assert.equal(pdf.getPageCount(), 7)
  const size = pdf.getPage(0).getSize()
  assert.ok(Math.abs(size.width - (66 * 72) / 25.4) < 0.001)
  assert.ok(Math.abs(size.height - (120 * 72) / 25.4) < 0.001)
  assert.equal(pdf.getPage(0).node.get(PDFName.of("PilotActiveTagId")), undefined)
  assert.equal(pdf.getPage(0).node.get(PDFName.of("PilotDoneTagId")), undefined)
  assert.match(embeddedCardContent(pdf, 0), /0\.0588\d* 0\.4627\d* 0\.4313\d* rg/)
  assert.match(embeddedCardContent(pdf, 6), /0\.0117\d* 0\.4117\d* 0\.6313\d* rg/)
  assert.match(embeddedCardContent(pdf, 6), /0\.86 0\.96 0\.9 rg/)
  assert.match(embeddedCardContent(pdf, 6), /9\.0708\d* Tf/)

  await page.screenshot({ path: `${proof}/tagless-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - innerWidth,
  )
  assert.ok(mobileOverflow <= 1, `tagless mobile page overflows by ${mobileOverflow}px`)
  await page.screenshot({ path: `${proof}/tagless-mobile.png`, fullPage: true })

  await page.locator('input[type="file"]').setInputFiles({
    name: "plankarten.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: rejectedImport,
  })
  await page
    .getByRole("alert")
    .getByText(/Nur Prozessplan-XLSX/)
    .waitFor()
  await page.getByText(/7 ausgewaehlte Karten als PDF/).waitFor()

  await page.locator('input[type="file"]').setInputFiles({
    name: "prozessplan-b.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: secondImport,
  })
  await page.getByText("prozessplan-b.xlsx", { exact: true }).waitFor()
  assert.equal(await page.getByText(/ausgewaehlte Karten als PDF/).count(), 0)
  await page.getByLabel(/Mo-Fr/).check()
  await page.getByRole("button", { name: "Arbeitswoche bestaetigen" }).click()
  await page.getByText("Bestaetigt: Mo-Fr / 1 Karten").waitFor()
  await page.getByText("1 sichtbar / 0 ausgewaehlt").waitFor()

  let switchGuarded = false
  page.once("dialog", async (dialog) => {
    switchGuarded = dialog.message().includes("Quellweg")
    await dialog.dismiss()
  })
  await page.getByRole("button", { name: /LCMD mit Tags/ }).click()
  assert.equal(switchGuarded, true)
  await page.getByRole("heading", { name: "Auswaehlen, pruefen, gezielt drucken." }).waitFor()

  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: /LCMD mit Tags/ }).click()
  await page.getByRole("heading", { name: "Persoenlich anmelden" }).waitFor()
  await page.getByRole("button", { name: /Prozessplan-XLSX ohne Tags/ }).click()
  await page.getByText("Noch keine Datei").waitFor()

  const unexpectedErrors = errors.filter(
    (message) =>
      !/Failed to load resource: the server responded with a status of 401/.test(message),
  )
  assert.deepEqual(unexpectedErrors, [])
  await writeFile(
    `${proof}/studio-delta-result.json`,
    `${JSON.stringify(
      {
        passed: true,
        calendar: "Mo-Sa",
        firstCardCount: 11,
        exportedCardCount: 7,
        reimportCardCount: 1,
        sourceSwitchGuarded: switchGuarded,
        sourceSwitchClearedLocalState: true,
        rejectedReimportPreservedState: true,
        beforeUnloadPrevented,
        mobileOverflow,
      },
      null,
      2,
    )}\n`,
  )
} finally {
  await browser.close()
}
