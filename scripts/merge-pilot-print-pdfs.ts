import { createHash } from "node:crypto"
import { access, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { PDFDocument, PDFHexString, PDFName, PDFNumber } from "pdf-lib"

type MergeContract = {
  forecastStart: string
  forecastEnd: string
  asOf: string
  revision: unknown
}

type PrintPdfInput = {
  name: string
  bytes: Uint8Array
}

type PageIdentity = {
  sourcePlanCardIdSha256: string
  date: string
  activeTagId: number
  doneTagId: number
}

const MM_TO_POINTS = 72 / 25.4
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex")
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value)
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`
  }
  throw new Error("Die Revision enthaelt einen nicht kanonischen Wert.")
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Ungueltige ${label}.`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value) throw new Error(`Ungueltige ${label}.`)
  return value
}

function requiredText(page: ReturnType<PDFDocument["getPage"]>, name: string) {
  return page.node.lookup(PDFName.of(name), PDFHexString).decodeText()
}

function requiredNumber(page: ReturnType<PDFDocument["getPage"]>, name: string) {
  return page.node.lookup(PDFName.of(name), PDFNumber).asNumber()
}

function assertContract(contract: MergeContract) {
  for (const value of [contract.forecastStart, contract.forecastEnd, contract.asOf]) {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    if (!ISO_DATE.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new Error(`Ungueltiges ISO-Datum ${value}.`)
    }
  }
  if (contract.forecastEnd < contract.forecastStart) throw new Error("Ungueltiger Forecastzeitraum.")
}

function revisionExpectation(contract: MergeContract) {
  const revision = record(contract.revision, "Donnerstagrevision")
  const source = record(revision.source, "Revisionsquelle")
  const sourceProjectId = text(source.sourceProjectId, "Projektbindung")
  if (
    revision.blocked !== false ||
    source.forecastStart !== contract.forecastStart ||
    source.forecastEnd !== contract.forecastEnd
  ) {
    throw new Error("Die Donnerstagrevision passt nicht zum freigegebenen Forecast oder ist blockiert.")
  }
  if (!Array.isArray(source.cards) || !Array.isArray(revision.delta)) {
    throw new Error("Die Donnerstagrevision enthaelt keine gueltige Karten-/Deltamenge.")
  }
  const delta = new Map<string, string>()
  for (const raw of revision.delta) {
    const item = record(raw, "Revisionsdelta")
    const id = text(item.sourcePlanCardId, "Delta-Kartenidentitaet")
    if (delta.has(id)) throw new Error("Doppelte Kartenidentitaet im Revisionsdelta.")
    delta.set(id, text(item.kind, "Deltaart"))
  }
  const cards = new Map<string, string>()
  for (const raw of source.cards) {
    const card = record(raw, "Revisionskarte")
    const id = text(card.sourcePlanCardId, "Kartenidentitaet")
    const date = text(card.date, "Kartendatum")
    if (cards.has(id)) throw new Error("Doppelte Kartenidentitaet in der Donnerstagrevision.")
    if (date >= contract.forecastStart && date <= contract.forecastEnd) {
      if (!["new", "changed", "unchanged"].includes(delta.get(id) ?? "")) {
        throw new Error("Eine Forecastkarte ist nicht druckbar oder muss manuell geklaert werden.")
      }
      cards.set(id, date)
    }
  }
  if (cards.size === 0) throw new Error("Die Donnerstagrevision enthaelt keine Forecastkarten.")
  return { sourceProjectId, revisionHash: sha256(canonical(revision)), cards }
}

function boxMatches(box: { x: number; y: number; width: number; height: number }) {
  return (
    Math.abs(box.x) <= 0.01 &&
    Math.abs(box.y) <= 0.01 &&
    Math.abs(box.width / MM_TO_POINTS - 66) <= 0.01 &&
    Math.abs(box.height / MM_TO_POINTS - 120) <= 0.01
  )
}

export async function mergePilotPrintPdfs(inputs: readonly PrintPdfInput[], contract: MergeContract) {
  assertContract(contract)
  if (inputs.length === 0) throw new Error("Mindestens eine Pilot-Karten-PDF ist erforderlich.")
  const expectation = revisionExpectation(contract)

  const output = await PDFDocument.create({ updateMetadata: false })
  const sourceFiles: Array<{ name: string; sha256: string; pageCount: number }> = []
  const pages: PageIdentity[] = []
  const cardIds = new Set<string>()
  const tagIds = new Set<number>()

  for (const input of inputs) {
    const document = await PDFDocument.load(input.bytes, { updateMetadata: false })
    if (document.getPageCount() === 0) throw new Error(`${input.name}: leere PDF.`)
    sourceFiles.push({ name: input.name, sha256: sha256(input.bytes), pageCount: document.getPageCount() })

    for (const page of document.getPages()) {
      const widthMm = page.getWidth() / MM_TO_POINTS
      const heightMm = page.getHeight() / MM_TO_POINTS
      const project = requiredText(page, "PilotSourceProjectId")
      const cardId = requiredText(page, "PilotSourcePlanCardId")
      const pageRevisionHash = requiredText(page, "PilotRevisionHash")
      const activeTagId = requiredNumber(page, "PilotActiveTagId")
      const doneTagId = requiredNumber(page, "PilotDoneTagId")
      const userUnit = page.node.lookupMaybe(PDFName.of("UserUnit"), PDFNumber)?.asNumber() ?? 1
      if (
        Math.abs(widthMm - 66) > 0.01 ||
        Math.abs(heightMm - 120) > 0.01 ||
        page.getRotation().angle !== 0 ||
        userUnit !== 1 ||
        !boxMatches(page.getCropBox()) ||
        !boxMatches(page.getTrimBox()) ||
        !boxMatches(page.getBleedBox()) ||
        requiredNumber(page, "PilotOuterShortMm") !== 66 ||
        requiredNumber(page, "PilotOuterLongMm") !== 120 ||
        requiredNumber(page, "PilotCardMarkerOuterEdgeMm") !== 18 ||
        requiredNumber(page, "PilotVisibleTextFit") !== 1 ||
        requiredNumber(page, "PilotBothCardEnds") !== 1
      ) {
        throw new Error(`${input.name}: ungueltiger Pilot-Druckvertrag.`)
      }
      if (!project || project !== expectation.sourceProjectId) {
        throw new Error(`${input.name}: falsches Quellprojekt im Drucksatz.`)
      }
      if (!/^[0-9a-f]{64}$/.test(pageRevisionHash) || pageRevisionHash !== expectation.revisionHash) {
        throw new Error(`${input.name}: falscher Revisionsstand im Drucksatz.`)
      }
      const expectedDate = expectation.cards.get(cardId)
      if (!cardId || !expectedDate) throw new Error(`${input.name}: Karte gehoert nicht zur Donnerstagrevision.`)
      if (cardIds.has(cardId)) throw new Error(`${input.name}: doppelte Kartenidentitaet im Drucksatz.`)
      if (
        !Number.isInteger(activeTagId) ||
        !Number.isInteger(doneTagId) ||
        activeTagId < 0 ||
        doneTagId < 0 ||
        activeTagId >= 63_486 ||
        doneTagId >= 63_486 ||
        activeTagId === doneTagId ||
        tagIds.has(activeTagId) ||
        tagIds.has(doneTagId)
      ) {
        throw new Error(`${input.name}: ungueltige oder doppelte Karten-Tag-ID.`)
      }
      cardIds.add(cardId)
      tagIds.add(activeTagId)
      tagIds.add(doneTagId)
      pages.push({ sourcePlanCardIdSha256: sha256(cardId), date: expectedDate, activeTagId, doneTagId })
    }

    const copied = await output.copyPages(document, document.getPageIndices())
    copied.forEach((page) => output.addPage(page))
  }

  if (cardIds.size !== expectation.cards.size) {
    throw new Error(
      `Drucksatz unvollstaendig: ${cardIds.size} von ${expectation.cards.size} Forecastkarten.`,
    )
  }

  const asOf = new Date(`${contract.asOf}T00:00:00.000Z`)
  output.setTitle(`Pilot-Karten ${contract.forecastStart} bis ${contract.forecastEnd}`)
  output.setAuthor("Ticket Studio")
  output.setCreator("Ticket Studio pilot-print-merge-v1")
  output.setProducer("Ticket Studio pilot-print-merge-v1")
  output.setSubject(`${pages.length} Karten | ${expectation.revisionHash}`)
  output.setCreationDate(asOf)
  output.setModificationDate(asOf)
  const bytes = await output.save({ addDefaultPage: false, useObjectStreams: false })
  return {
    bytes,
    manifest: {
      schema: "pilot-two-month-print-package-v1",
      forecastStart: contract.forecastStart,
      forecastEnd: contract.forecastEnd,
      asOf: contract.asOf,
      sourceProjectIdSha256: sha256(expectation.sourceProjectId),
      revisionHash: expectation.revisionHash,
      pageCount: pages.length,
      sourceFiles,
      pages,
      outputSha256: sha256(bytes),
    },
  }
}

function parseArguments(arguments_: string[]) {
  const values: Record<string, string> = {}
  const inputs: string[] = []
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!
    if (argument.startsWith("--")) {
      const value = arguments_[index + 1]
      if (!value || value.startsWith("--")) throw new Error(`Wert fuer ${argument} fehlt.`)
      values[argument.slice(2)] = value
      index += 1
    } else {
      inputs.push(argument)
    }
  }
  for (const name of ["output", "forecast-start", "forecast-end", "as-of", "revision"]) {
    if (!values[name]) throw new Error(`--${name} ist erforderlich.`)
  }
  if (inputs.length === 0) throw new Error("Mindestens eine Eingabe-PDF ist erforderlich.")
  return { values, inputs }
}

async function exists(file: string) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function main() {
  const { values, inputs } = parseArguments(process.argv.slice(2))
  const outputPath = path.resolve(values.output!)
  const manifestPath = outputPath.replace(/\.pdf$/i, "") + ".manifest.json"
  if ((await exists(outputPath)) || (await exists(manifestPath))) {
    throw new Error("Ausgabe oder Manifest existiert bereits.")
  }
  const source = await Promise.all(
    inputs.map(async (file) => ({ name: path.basename(file), bytes: await readFile(file) })),
  )
  const revision = JSON.parse(await readFile(values.revision!, "utf8")) as unknown
  const result = await mergePilotPrintPdfs(source, {
    forecastStart: values["forecast-start"]!,
    forecastEnd: values["forecast-end"]!,
    asOf: values["as-of"]!,
    revision,
  })
  await writeFile(outputPath, result.bytes, { flag: "wx", mode: 0o600 })
  try {
    await writeFile(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    })
  } catch (error) {
    await unlink(outputPath)
    throw error
  }
  process.stdout.write(
    `${JSON.stringify({ result: "pass", output: outputPath, manifest: manifestPath, pageCount: result.manifest.pageCount, outputSha256: result.manifest.outputSha256 })}\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
