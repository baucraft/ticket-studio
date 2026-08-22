import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const MANIFEST_SHA256 = "51d5b532702e288927f77a2a5c24414fbfbe481a16c40d16a091aebd5367c8a9"
const ASSET_COMMIT = "f3fd9a7add5bfd82a886fc65240fdb8e3c9ac5a1"
const FAMILY_TREE = "52cc190bc5d2824afd5f3fb908283d71de86fc6a"
const assetDir = resolve("public/ana09c4")

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

const manifestBytes = readFileSync(resolve(assetDir, "manifest.json"))
if (sha256(manifestBytes) !== MANIFEST_SHA256) {
  throw new Error("Tag-only asset manifest differs from the pinned SHA-256")
}

const manifest = JSON.parse(manifestBytes.toString("ascii"))
if (
  manifest.schemaVersion !== "demo04-tag-only-assets-v1" ||
  manifest.family !== "tagCircle49h12" ||
  manifest.quietZoneModulesPerSide !== 1 ||
  manifest.officialProvenance?.assetCommit !== ASSET_COMMIT ||
  manifest.officialProvenance?.assetFamilyTreeGitSha1 !== FAMILY_TREE ||
  manifest.assets?.length !== 19
) {
  throw new Error("Tag-only asset manifest has an unexpected contract")
}

const manifestFiles = new Set()
for (const asset of manifest.assets) {
  if (
    !Number.isInteger(asset.tagId) ||
    !["card", "board"].includes(asset.role) ||
    !/^[0-9a-f]{64}$/.test(asset.sourcePngSha256) ||
    !/^[0-9a-f]{64}$/.test(asset.svgSha256) ||
    manifestFiles.has(asset.filename)
  ) {
    throw new Error(`Invalid tag-only asset manifest entry: ${asset.filename}`)
  }
  const expectedFilename =
    asset.role === "card"
      ? `tagCircle49h12_id${String(asset.tagId).padStart(5, "0")}_card_${asset.status}_18mm.svg`
      : `tagCircle49h12_id${String(asset.tagId).padStart(5, "0")}_board_36mm.svg`
  if (asset.filename !== expectedFilename) {
    throw new Error(`Unexpected tag-only asset filename: ${asset.filename}`)
  }
  const svgBytes = readFileSync(resolve(assetDir, asset.filename))
  if (sha256(svgBytes) !== asset.svgSha256) {
    throw new Error(`Tag-only asset SHA-256 mismatch: ${asset.filename}`)
  }
  manifestFiles.add(asset.filename)
}

const directoryFiles = readdirSync(assetDir).filter((filename) => filename.endsWith(".svg"))
if (
  directoryFiles.length !== manifestFiles.size ||
  directoryFiles.some((filename) => !manifestFiles.has(filename))
) {
  throw new Error("Tag-only asset directory contains missing or unbound SVG files")
}

console.log("Verified 19 pinned tagCircle49h12 assets for the production build")
