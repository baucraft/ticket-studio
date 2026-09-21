import { createHash } from "node:crypto"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const directory = resolve("public/pilot-assets")
const manifestBytes = readFileSync(resolve(directory, "manifest.json"))
const codebook = readFileSync(resolve(directory, "tagCircle49h12.bits"))
const sumsBytes = readFileSync(resolve(directory, "SHA256SUMS"))
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
const manifest = JSON.parse(manifestBytes.toString("ascii"))

if (
  manifest.schema !== "pilot-tag-codebook-v1" ||
  manifest.scope !== "complete-official-family-for-backend-bound-ids-only" ||
  manifest.family !== "tagCircle49h12" ||
  manifest.tagCount !== 65_535 ||
  manifest.bytesPerTag !== 16 ||
  manifest.quietZoneModulesPerSide !== 1 ||
  manifest.codebookSha256 !== digest(codebook) ||
  codebook.length !== manifest.tagCount * manifest.bytesPerTag ||
  manifest.officialProvenance?.assetCommit !== "f3fd9a7add5bfd82a886fc65240fdb8e3c9ac5a1" ||
  manifest.officialProvenance?.assetFamilyTreeGitSha1 !== "52cc190bc5d2824afd5f3fb908283d71de86fc6a"
) {
  throw new Error("Pilot tag codebook has an unexpected contract")
}

const files = readdirSync(directory).sort()
if (
  JSON.stringify(files) !==
    JSON.stringify([
      "APRILTAG_ASSET_LICENSE.md",
      "SHA256SUMS",
      "manifest.json",
      "tagCircle49h12.bits",
    ]) ||
  sumsBytes.toString("ascii") !== `${digest(codebook)}  tagCircle49h12.bits\n`
) {
  throw new Error("Pilot tag codebook directory contains missing or unbound files")
}

// These pins are filled from a complete regeneration against the repository/tree above.
if (
  digest(manifestBytes) !== "0002fff93aab07fd0583576d5f05a960e08c6ec31ef5d0c6d9199d416a6ce45a" ||
  digest(sumsBytes) !== "c9c912d5064b44c6d0fbe9cf8c444e82f454f2593d87983f2d047634eaccb640" ||
  digest(codebook) !== "1dc1820062286679af9ba90bee19704a31a45e62ce2538ab1a368024c86a8587"
) {
  throw new Error("Pilot tag codebook differs from the pinned build")
}

console.log("Verified all 65535 tagCircle49h12 IDs from pinned official assets")
