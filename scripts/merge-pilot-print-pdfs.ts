import { createHash } from "node:crypto"
import { access, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { PDFDocument, PDFHexString, PDFName, PDFNumber } from "pdf-lib"
import { canonical, verifyPrintAllocation } from "./pilot-print-allocation"

type MergeContract = {
  forecastStart: string
  forecastEnd: string
  asOf: string
  revision: unknown
  selection?: unknown
  allocation: { journal: Uint8Array; witness: unknown }
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
    if (
      !ISO_DATE.test(value) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new Error(`Ungueltiges ISO-Datum ${value}.`)
    }
  }
  if (contract.forecastEnd < contract.forecastStart)
    throw new Error("Ungueltiger Forecastzeitraum.")
}

function printSelection(contract: MergeContract, sourceProjectId: string) {
  if (contract.selection === undefined) return { mode: "all", areaPaths: [] as string[] }
  const selection = record(contract.selection, "Bereichsauswahl")
  if (selection.schema === "pilot-print-card-selection-v1") {
    const source = record(record(contract.revision, "Donnerstagrevision").source, "Revisionsquelle")
    if (
      selection.sourceProjectId !== sourceProjectId ||
      selection.forecastStart !== contract.forecastStart ||
      selection.forecastEnd !== contract.forecastEnd ||
      selection.mode !== "source-card-ids" ||
      selection.revisionHash !== sha256(canonical(contract.revision)) ||
      typeof selection.processSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(selection.processSha256) ||
      typeof selection.cardSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(selection.cardSha256) ||
      selection.processSha256 !== source.processSha256 ||
      selection.cardSha256 !== source.cardSha256 ||
      typeof selection.areaScopeSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(selection.areaScopeSha256) ||
      !Array.isArray(selection.sourcePlanCardIds) ||
      !selection.sourcePlanCardIds.length
    ) {
      throw new Error("Die Karten-ID-Auswahl passt nicht zu Projekt, Quelle und finaler Revision.")
    }
    const sourcePlanCardIds = selection.sourcePlanCardIds.map((value) => text(value, "Karten-ID"))
    if (
      new Set(sourcePlanCardIds).size !== sourcePlanCardIds.length ||
      sourcePlanCardIds.some((value) => value.trim() !== value)
    ) {
      throw new Error("Die Karten-ID-Auswahl enthaelt doppelte oder ungueltige IDs.")
    }
    return {
      mode: "source-card-ids",
      areaPaths: [] as string[],
      sourcePlanCardIds,
      areaScopeSha256: selection.areaScopeSha256,
    }
  }
  if (
    selection.schema !== "pilot-print-selection-v1" ||
    selection.sourceProjectId !== sourceProjectId ||
    selection.forecastStart !== contract.forecastStart ||
    selection.forecastEnd !== contract.forecastEnd ||
    selection.mode !== "areas" ||
    !Array.isArray(selection.areaPaths) ||
    !selection.areaPaths.length
  ) {
    throw new Error("Die Bereichsauswahl passt nicht zu Projekt und Forecast.")
  }
  const areaPaths = selection.areaPaths.map((value) => text(value, "Bereichspfad"))
  if (
    new Set(areaPaths).size !== areaPaths.length ||
    areaPaths.some((value) => value.trim() !== value)
  ) {
    throw new Error("Die Bereichsauswahl enthaelt doppelte oder ungueltige Pfade.")
  }
  return { mode: "areas", areaPaths }
}

export function pilotPrintExpectation(contract: MergeContract) {
  assertContract(contract)
  const revision = record(contract.revision, "Donnerstagrevision")
  const source = record(revision.source, "Revisionsquelle")
  const sourceProjectId = text(source.sourceProjectId, "Projektbindung")
  const selection = printSelection(contract, sourceProjectId)
  if (
    revision.blocked !== false ||
    source.forecastStart !== contract.forecastStart ||
    source.forecastEnd !== contract.forecastEnd
  ) {
    throw new Error(
      "Die Donnerstagrevision passt nicht zum freigegebenen Forecast oder ist blockiert.",
    )
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
  const allSourceIds = new Set<string>()
  const matchedAreas = new Set<string>()
  const selectedIds = new Set(selection.sourcePlanCardIds ?? [])
  let fullForecastCardCount = 0
  for (const raw of source.cards) {
    const card = record(raw, "Revisionskarte")
    const id = text(card.sourcePlanCardId, "Kartenidentitaet")
    const date = text(card.date, "Kartendatum")
    if (allSourceIds.has(id))
      throw new Error("Doppelte Kartenidentitaet in der Donnerstagrevision.")
    allSourceIds.add(id)
    if (date >= contract.forecastStart && date <= contract.forecastEnd) {
      fullForecastCardCount += 1
      const area = typeof card.area === "string" ? card.area : ""
      const matches = selection.areaPaths.filter(
        (prefix) => area === prefix || area.startsWith(`${prefix} / `),
      )
      matches.forEach((prefix) => matchedAreas.add(prefix))
      if (selection.mode === "areas" && !matches.length) continue
      if (selection.mode === "source-card-ids" && !selectedIds.has(id)) continue
      if (!["new", "changed", "unchanged"].includes(delta.get(id) ?? "")) {
        throw new Error("Eine Forecastkarte ist nicht druckbar oder muss manuell geklaert werden.")
      }
      cards.set(id, date)
    }
  }
  if (selection.mode === "areas" && matchedAreas.size !== selection.areaPaths.length) {
    throw new Error(
      "Ein ausgewaehlter Bereich fehlt im finalen Forecast; Auswahl erneut bestaetigen.",
    )
  }
  if (selection.mode === "source-card-ids" && cards.size !== selectedIds.size) {
    throw new Error("Eine ausgewaehlte Karten-ID fehlt im finalen druckbaren Forecast.")
  }
  if (cards.size === 0) throw new Error("Die Donnerstagrevision enthaelt keine Forecastkarten.")
  return {
    sourceProjectId,
    revisionHash: sha256(canonical(revision)),
    cards,
    fullForecastCardCount,
    selection,
    selectionSha256:
      contract.selection === undefined ? null : sha256(canonical(contract.selection)),
  }
}

function boxMatches(box: { x: number; y: number; width: number; height: number }) {
  return (
    Math.abs(box.x) <= 0.01 &&
    Math.abs(box.y) <= 0.01 &&
    Math.abs(box.width / MM_TO_POINTS - 66) <= 0.01 &&
    Math.abs(box.height / MM_TO_POINTS - 120) <= 0.01
  )
}

export async function mergePilotPrintPdfs(
  inputs: readonly PrintPdfInput[],
  contract: MergeContract,
) {
  assertContract(contract)
  if (inputs.length === 0) throw new Error("Mindestens eine Pilot-Karten-PDF ist erforderlich.")
  const expectation = pilotPrintExpectation(contract)
  const allocation = verifyPrintAllocation(
    contract.allocation.journal,
    contract.allocation.witness,
    expectation.sourceProjectId,
  )
  const currentJobCards = new Set<string>()
  for (const job of allocation.jobs.values()) {
    if (job.revisionHash === expectation.revisionHash) {
      for (const card of job.cards as Array<Record<string, unknown>>)
        currentJobCards.add(card.sourcePlanCardId as string)
    }
  }

  const output = await PDFDocument.create({ updateMetadata: false })
  const sourceFiles: Array<{ name: string; sha256: string; pageCount: number }> = []
  const pages: PageIdentity[] = []
  const cardIds = new Set<string>()
  const tagIds = new Set<number>()

  for (const input of inputs) {
    const document = await PDFDocument.load(input.bytes, { updateMetadata: false })
    if (document.getPageCount() === 0) throw new Error(`${input.name}: leere PDF.`)
    sourceFiles.push({
      name: input.name,
      sha256: sha256(input.bytes),
      pageCount: document.getPageCount(),
    })

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
      if (
        !/^[0-9a-f]{64}$/.test(pageRevisionHash) ||
        pageRevisionHash !== expectation.revisionHash
      ) {
        throw new Error(`${input.name}: falscher Revisionsstand im Drucksatz.`)
      }
      const expectedDate = expectation.cards.get(cardId)
      if (!cardId || !expectedDate)
        throw new Error(`${input.name}: Karte gehoert nicht zur Donnerstagrevision.`)
      if (cardIds.has(cardId))
        throw new Error(`${input.name}: doppelte Kartenidentitaet im Drucksatz.`)
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
      const assigned = allocation.assignments.get(cardId)
      if (
        !currentJobCards.has(cardId) ||
        assigned?.active !== activeTagId ||
        assigned.done !== doneTagId
      ) {
        throw new Error(
          `${input.name}: Kartenpaar ist nicht durch den gebundenen Vergabestand belegt.`,
        )
      }
      cardIds.add(cardId)
      tagIds.add(activeTagId)
      tagIds.add(doneTagId)
      pages.push({
        sourcePlanCardIdSha256: sha256(cardId),
        date: expectedDate,
        activeTagId,
        doneTagId,
      })
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
      fullForecastCardCount: expectation.fullForecastCardCount,
      excludedByExplicitAreaSelection: expectation.fullForecastCardCount - pages.length,
      selection: expectation.selection,
      selectionSha256: expectation.selectionSha256,
      allocation: allocation.manifest,
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
  for (const name of [
    "output",
    "forecast-start",
    "forecast-end",
    "as-of",
    "revision",
    "journal",
    "witness",
  ]) {
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
  const selection = values.selection
    ? (JSON.parse(await readFile(values.selection, "utf8")) as unknown)
    : undefined
  const result = await mergePilotPrintPdfs(source, {
    forecastStart: values["forecast-start"]!,
    forecastEnd: values["forecast-end"]!,
    asOf: values["as-of"]!,
    revision,
    selection,
    allocation: {
      journal: await readFile(values.journal!),
      witness: JSON.parse(await readFile(values.witness!, "utf8")) as unknown,
    },
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
