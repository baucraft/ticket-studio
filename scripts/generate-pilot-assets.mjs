import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { generatePinnedCircle49h12Codebook } from "./pilot-asset-source.mjs"

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

const sourceDir = process.argv[2]
const outputDir = resolve(process.argv[3] ?? "public/pilot-assets")
if (!sourceDir || process.argv.length > 4) {
  throw new Error(
    "Usage: node scripts/generate-pilot-assets.mjs <pinned-apriltag-imgs-checkout> [output-directory]",
  )
}

const generated = generatePinnedCircle49h12Codebook(sourceDir)
if (existsSync(outputDir)) rmSync(outputDir, { recursive: true })
mkdirSync(outputDir, { recursive: true })
writeFileSync(resolve(outputDir, "tagCircle49h12.bits"), generated.codebook)
copyFileSync(
  "public/ana09c4/APRILTAG_ASSET_LICENSE.md",
  resolve(outputDir, "APRILTAG_ASSET_LICENSE.md"),
)
const manifest = {
  schema: "pilot-tag-codebook-v1",
  scope: "complete-official-family-for-backend-bound-ids-only",
  family: "tagCircle49h12",
  tagCount: generated.tagCount,
  bytesPerTag: generated.bytesPerTag,
  codebookSha256: generated.sha256,
  quietZoneModulesPerSide: 1,
  officialProvenance: generated.officialProvenance,
}
writeFileSync(
  resolve(outputDir, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "ascii",
)
writeFileSync(
  resolve(outputDir, "SHA256SUMS"),
  `${sha256(generated.codebook)}  tagCircle49h12.bits\n`,
  "ascii",
)
