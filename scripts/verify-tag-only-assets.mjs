import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

const MANIFEST_SHA256 = "6dbb2a5adcd58212d151ef1b9a99400337cfb686c1ac9ff8131d55aabaa9f7f4"
const CANONICAL_SOURCE_PATH = resolve("src/data/demo-04-synthetic-activities.v1.json")
const CANONICAL_SOURCE_SHA256 = "4f165dcdffb1b0659670b0f83208a367ee0b428b5daa132e53e971e0aa13896f"
const ASSET_COMMIT = "f3fd9a7add5bfd82a886fc65240fdb8e3c9ac5a1"
const FAMILY_TREES = {
  tagCircle49h12: "52cc190bc5d2824afd5f3fb908283d71de86fc6a",
  tagStandard52h13: "eddc1dd85b74f711d8a07b82e326f12d00bf155c",
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

export function verifyTagOnlyAssets(assetDirValue = resolve("public/ana09c4")) {
  const fixtureBytes = readFileSync(CANONICAL_SOURCE_PATH)
  if (sha256(fixtureBytes) !== CANONICAL_SOURCE_SHA256) {
    throw new Error("Canonical DEMO-04 source differs from the pinned SHA-256")
  }
  return verifyTagOnlyAssetsAgainstSource(assetDirValue, fixtureBytes)
}

export function verifyTagOnlyAssetsAgainstSource(assetDirValue, fixtureBytesValue) {
  const assetDir = resolve(assetDirValue)
  const fixtureBytes = Buffer.from(fixtureBytesValue)
  const fixture = JSON.parse(fixtureBytes.toString("utf8"))
  const manifestBytes = readFileSync(resolve(assetDir, "manifest.json"))
  if (sha256(manifestBytes) !== MANIFEST_SHA256) {
    throw new Error("Tag-only asset manifest differs from the pinned SHA-256")
  }

  const manifest = JSON.parse(manifestBytes.toString("ascii"))
  if (
    manifest.schemaVersion !== "demo04-tag-only-assets-v2" ||
    manifest.scope !== "synthetic_non_product_preflight" ||
    manifest.fixtureVersion !== fixture.fixtureVersion ||
    manifest.fixtureSha256 !== sha256(fixtureBytes) ||
    manifest.canonicalSource?.path !== "src/data/demo-04-synthetic-activities.v1.json" ||
    manifest.canonicalSource?.sha256 !== sha256(fixtureBytes) ||
    manifest.quietZoneModulesPerSide !== 1 ||
    manifest.officialProvenance?.assetCommit !== ASSET_COMMIT ||
    JSON.stringify(manifest.officialProvenance?.assetFamilyTreeGitSha1) !==
      JSON.stringify(FAMILY_TREES) ||
    manifest.assets?.length !== 105
  ) {
    throw new Error("Tag-only asset manifest has an unexpected contract")
  }

  const expectedCardIds = new Set(
    fixture.activities.flatMap((activity) => [activity.activeTagId, activity.doneTagId]),
  )
  const expectedBoardIds = new Set(fixture.boards.map((board) => board.boardMarkerId))
  const manifestCardIds = new Set()
  const manifestBoardIds = new Set()
  const manifestFiles = new Set()
  const verifiedSvgBytes = new Map()
  let referenceCount = 0
  for (const asset of manifest.assets) {
    if (
      !Number.isInteger(asset.tagId) ||
      !["card", "board", "reference"].includes(asset.role) ||
      !/^[0-9a-f]{64}$/.test(asset.sourcePngSha256) ||
      !/^[0-9a-f]{64}$/.test(asset.svgSha256) ||
      manifestFiles.has(asset.filename)
    ) {
      throw new Error(`Invalid tag-only asset manifest entry: ${asset.filename}`)
    }
    let expectedFilename
    if (asset.role === "card") {
      const expectedStatus = asset.tagId % 2 === 0 ? "active" : "done"
      expectedFilename = `tagCircle49h12_id${String(asset.tagId).padStart(5, "0")}_card_${expectedStatus}_18mm.svg`
      if (
        asset.family !== "tagCircle49h12" ||
        asset.status !== expectedStatus ||
        asset.markerOuterEdgeMm !== 18 ||
        !expectedCardIds.has(asset.tagId) ||
        manifestCardIds.has(asset.tagId)
      ) {
        throw new Error(`Unexpected card asset binding: ${asset.filename}`)
      }
      manifestCardIds.add(asset.tagId)
    } else if (asset.role === "board") {
      expectedFilename = `tagCircle49h12_id${String(asset.tagId).padStart(5, "0")}_board_36mm.svg`
      if (
        asset.family !== "tagCircle49h12" ||
        asset.status !== null ||
        asset.markerOuterEdgeMm !== 36 ||
        !expectedBoardIds.has(asset.tagId) ||
        manifestBoardIds.has(asset.tagId)
      ) {
        throw new Error(`Unexpected board asset binding: ${asset.filename}`)
      }
      manifestBoardIds.add(asset.tagId)
    } else {
      const referenceNames = new Set([
        "tagStandard52h13_id00000_reference_18mm.svg",
        "tagStandard52h13_id00000_reference_module_matched.svg",
      ])
      expectedFilename = asset.filename
      if (
        asset.family !== "tagStandard52h13" ||
        asset.tagId !== 0 ||
        asset.status !== null ||
        !referenceNames.has(asset.filename)
      ) {
        throw new Error(`Unexpected calibration reference: ${asset.filename}`)
      }
      referenceCount += 1
    }
    if (asset.filename !== expectedFilename) {
      throw new Error(`Unexpected tag-only asset filename: ${asset.filename}`)
    }
    const svgBytes = readFileSync(resolve(assetDir, asset.filename))
    if (sha256(svgBytes) !== asset.svgSha256) {
      throw new Error(`Tag-only asset SHA-256 mismatch: ${asset.filename}`)
    }
    verifiedSvgBytes.set(asset.filename, svgBytes)
    manifestFiles.add(asset.filename)
  }

  if (
    manifestCardIds.size !== 100 ||
    manifestBoardIds.size !== 3 ||
    referenceCount !== 2 ||
    [...expectedCardIds].some((id) => !manifestCardIds.has(id)) ||
    [...expectedBoardIds].some((id) => !manifestBoardIds.has(id))
  ) {
    throw new Error("Tag-only asset bindings are incomplete")
  }
  const directoryFiles = readdirSync(assetDir).filter((filename) => filename.endsWith(".svg"))
  if (
    directoryFiles.length !== manifestFiles.size ||
    directoryFiles.some((filename) => !manifestFiles.has(filename))
  ) {
    throw new Error("Tag-only asset directory contains missing or unbound SVG files")
  }
  return { manifest, verifiedSvgBytes }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyTagOnlyAssets()
  console.log("Verified 100 card, 3 board and 2 calibration-reference marker assets")
}
