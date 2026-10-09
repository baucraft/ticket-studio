import { readFile, writeFile, unlink } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { parsePilotPrintPreparation, type PilotPrintPreparation } from "../src/lib/pilot-api"
import { createPilotCardsPdf, pilotMarkerAssetFromCodebook } from "../src/lib/pilot-print-pdf"
import { mergePilotPrintPdfs, pilotPrintExpectation } from "./merge-pilot-print-pdfs"
import { canonical, verifyPrintAllocation } from "./pilot-print-allocation"

type Contract = Parameters<typeof pilotPrintExpectation>[0]

export async function generatePilotPrintPackage(
  preparations: readonly PilotPrintPreparation[],
  contract: Contract,
  codebook: Uint8Array,
) {
  const expectation = pilotPrintExpectation(contract)
  const allocation = verifyPrintAllocation(
    contract.allocation.journal,
    contract.allocation.witness,
    expectation.sourceProjectId,
  )
  const revision = contract.revision as { source: { cards: Array<Record<string, unknown>> } }
  const sourceCards = new Map(revision.source.cards.map((card) => [card.sourcePlanCardId, card]))
  const inputs: Array<{ name: string; bytes: Uint8Array }> = []
  for (const preparation of preparations) {
    const journalJob = allocation.jobs.get(preparation.requestId)
    if (
      !journalJob ||
      canonical(parsePilotPrintPreparation(journalJob)) !== canonical(preparation)
    ) {
      throw new Error("Druckvorbereitung ist nicht identisch zum gebundenen Journalauftrag.")
    }
    if (
      preparation.sourceProjectId !== expectation.sourceProjectId ||
      preparation.revisionHash !== expectation.revisionHash
    ) {
      throw new Error("Druckvorbereitung passt nicht zur finalen Projekt-/Revisionsbindung.")
    }
    if (preparation.cards.length > 900)
      throw new Error("Druckvorbereitung ueberschreitet die Softwaregrenze von 900 Karten.")
    const ids = preparation.cards
      .filter((card) => expectation.cards.has(card.sourcePlanCardId))
      .map((card) => card.sourcePlanCardId)
    if (!ids.length) continue
    for (const card of preparation.cards.filter((item) =>
      expectation.cards.has(item.sourcePlanCardId),
    )) {
      const source = sourceCards.get(card.sourcePlanCardId)!
      for (const field of [
        "sourceActivityId",
        "date",
        "activity",
        "task",
        "trade",
        "company",
        "area",
        "sourceStatus",
        "tradeColor",
        "cardNumber",
        "cardCount",
      ] as const) {
        if ((card[field] ?? null) !== (source[field] ?? null)) {
          throw new Error(
            "Druckkartentext oder Quellidentitaet weicht von der finalen Revision ab.",
          )
        }
      }
    }
    inputs.push({
      name: `${preparation.requestId}.pdf`,
      bytes: await createPilotCardsPdf(preparation, ids, async (filename) =>
        pilotMarkerAssetFromCodebook(codebook, filename),
      ),
    })
  }
  return mergePilotPrintPdfs(inputs, contract)
}

async function main() {
  const args = process.argv.slice(2)
  const values: Record<string, string> = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]!
    const value = args[index + 1]
    if (!key.startsWith("--") || !value) throw new Error("Argumente als --name wert angeben.")
    values[key.slice(2)] = value
  }
  for (const key of ["output", "revision", "preparations", "as-of", "journal", "witness"]) {
    if (!values[key]) throw new Error(`--${key} ist erforderlich.`)
  }
  const revision = JSON.parse(await readFile(values.revision!, "utf8"))
  const rawPreparations: unknown = JSON.parse(await readFile(values.preparations!, "utf8"))
  if (!Array.isArray(rawPreparations))
    throw new Error("Druckvorbereitungen muessen eine JSON-Liste sein.")
  const preparations = rawPreparations.map(parsePilotPrintPreparation)
  const selection: unknown = values.selection
    ? JSON.parse(await readFile(values.selection, "utf8"))
    : undefined
  const codebook = await readFile(
    new URL("../public/pilot-assets/tagCircle49h12.bits", import.meta.url),
  )
  const result = await generatePilotPrintPackage(
    preparations,
    {
      forecastStart: revision.source.forecastStart,
      forecastEnd: revision.source.forecastEnd,
      asOf: values["as-of"]!,
      revision,
      selection,
      allocation: {
        journal: await readFile(values.journal!),
        witness: JSON.parse(await readFile(values.witness!, "utf8")) as unknown,
      },
    },
    codebook,
  )
  const output = path.resolve(values.output!)
  const manifest = `${output.replace(/\.pdf$/i, "")}.manifest.json`
  // Reserve manifest first; either pre-existing path rejects without replacement.
  await writeFile(manifest, `${JSON.stringify(result.manifest, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  })
  try {
    await writeFile(output, result.bytes, { flag: "wx", mode: 0o600 })
  } catch (error) {
    await unlink(manifest)
    throw error
  }
  console.log(
    JSON.stringify({
      result: "pass",
      output,
      manifest,
      pageCount: result.manifest.pageCount,
      outputSha256: result.manifest.outputSha256,
    }),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
