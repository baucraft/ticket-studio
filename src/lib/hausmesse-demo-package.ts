import {
  HAUSMESSE_CASE_ID,
  serializeHausmesseDemoPlan,
  serializeHausmesseManifest,
  serializeHausmesseManifestCsv,
} from "@/lib/hausmesse-demo"
import { createHausmesseDemoPdf, createHausmesseDemoPrintPdf } from "@/lib/hausmesse-demo-pdf"

export const HAUSMESSE_FILES = {
  plan: `${HAUSMESSE_CASE_ID}-plan.json`,
  pdf: `${HAUSMESSE_CASE_ID}-cards.pdf`,
  printPdf: `${HAUSMESSE_CASE_ID}-print-a4.pdf`,
  manifest: `${HAUSMESSE_CASE_ID}-manifest.json`,
  csv: `${HAUSMESSE_CASE_ID}-manifest.csv`,
  checksums: "SHA256SUMS",
} as const

export type HausmesseDemoPackage = {
  plan: Uint8Array
  pdf: Uint8Array
  printPdf: Uint8Array
  manifest: Uint8Array
  csv: Uint8Array
  checksums: Uint8Array
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const safeBytes = new Uint8Array(bytes)
  const digest = await crypto.subtle.digest("SHA-256", safeBytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")
}

export async function createHausmesseDemoPackage(input?: unknown): Promise<HausmesseDemoPackage> {
  const plan = serializeHausmesseDemoPlan(input)
  const pdf = await createHausmesseDemoPdf(input)
  const printPdf = await createHausmesseDemoPrintPdf(input)
  const manifest = serializeHausmesseManifest(input)
  const csv = serializeHausmesseManifestCsv(input)
  const checksums = new TextEncoder().encode(
    `${await sha256(plan)}  ${HAUSMESSE_FILES.plan}\n${await sha256(pdf)}  ${HAUSMESSE_FILES.pdf}\n${await sha256(printPdf)}  ${HAUSMESSE_FILES.printPdf}\n${await sha256(manifest)}  ${HAUSMESSE_FILES.manifest}\n${await sha256(csv)}  ${HAUSMESSE_FILES.csv}\n`,
  )
  return { plan, pdf, printPdf, manifest, csv, checksums }
}
