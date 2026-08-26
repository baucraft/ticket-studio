import { lstat, mkdir, mkdtemp, open, rename, rm } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"

import {
  createHausmesseDemoPackage,
  HAUSMESSE_FILES,
  type HausmesseDemoPackage,
} from "../src/lib/hausmesse-demo-package"

const FILES: Array<[keyof HausmesseDemoPackage, string]> = [
  ["plan", HAUSMESSE_FILES.plan],
  ["pdf", HAUSMESSE_FILES.pdf],
  ["printPdf", HAUSMESSE_FILES.printPdf],
  ["manifest", HAUSMESSE_FILES.manifest],
  ["csv", HAUSMESSE_FILES.csv],
  ["checksums", HAUSMESSE_FILES.checksums],
]

async function assertAbsent(path: string) {
  try {
    await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
  throw new Error(`Demo output directory already exists: ${path}`)
}

export async function writeHausmesseDemoPackage(outputValue: string) {
  const outputDir = resolve(outputValue)
  const parent = dirname(outputDir)
  await mkdir(parent, { recursive: true })
  await assertAbsent(outputDir)
  const stagingDir = await mkdtemp(join(parent, `.${basename(outputDir)}.tmp-`))
  try {
    const demoPackage = await createHausmesseDemoPackage()
    for (const [key, fileName] of FILES) {
      const handle = await open(join(stagingDir, fileName), "wx")
      try {
        await handle.writeFile(demoPackage[key])
        await handle.sync()
      } finally {
        await handle.close()
      }
    }
    await assertAbsent(outputDir)
    await rename(stagingDir, outputDir)
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true })
    throw error
  }
  return outputDir
}
