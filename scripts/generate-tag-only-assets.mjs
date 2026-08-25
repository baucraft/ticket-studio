import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { inflateSync } from "node:zlib"

import { readGitObjectBytes } from "./git-object.mjs"
import { acquireTargetLock, recoverTargetArtifacts } from "./target-lock.mjs"

const SOURCE_COMMIT = "f3fd9a7add5bfd82a886fc65240fdb8e3c9ac5a1"
const FAMILY_TREES = {
  tagCircle49h12: "52cc190bc5d2824afd5f3fb908283d71de86fc6a",
  tagStandard52h13: "eddc1dd85b74f711d8a07b82e326f12d00bf155c",
}
const FIXTURE_PATH = resolve("src/data/demo-04-synthetic-activities.v1.json")
const CANONICAL_SOURCE_SHA256 = "4f165dcdffb1b0659670b0f83208a367ee0b428b5daa132e53e971e0aa13896f"
const PINNED_GIT_ENV = { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" }

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft
  const leftDistance = Math.abs(prediction - left)
  const aboveDistance = Math.abs(prediction - above)
  const upperLeftDistance = Math.abs(prediction - upperLeft)
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left
  return aboveDistance <= upperLeftDistance ? above : upperLeft
}

function decodeRgbaPng(bytes, expectedWidth) {
  const signature = bytes.subarray(0, 8).toString("hex")
  if (signature !== "89504e470d0a1a0a") throw new Error("Source asset is not a PNG")
  let offset = 8
  let width = 0
  let height = 0
  const compressed = []
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii")
    const data = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error("Only non-interlaced 8-bit RGBA PNG sources are supported")
      }
    } else if (type === "IDAT") compressed.push(data)
    else if (type === "IEND") break
    offset += length + 12
  }
  if (width !== expectedWidth || height !== expectedWidth || compressed.length === 0) {
    throw new Error(`Official source must be ${expectedWidth} x ${expectedWidth} RGBA PNG`)
  }

  const raw = inflateSync(Buffer.concat(compressed))
  const stride = width * 4
  const pixels = Buffer.alloc(stride * height)
  let rawOffset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset]
    rawOffset += 1
    for (let x = 0; x < stride; x += 1) {
      const value = raw[rawOffset + x]
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0
      const reconstructed =
        filter === 0
          ? value
          : filter === 1
            ? value + left
            : filter === 2
              ? value + above
              : filter === 3
                ? value + Math.floor((left + above) / 2)
                : filter === 4
                  ? value + paeth(left, above, upperLeft)
                  : Number.NaN
      if (!Number.isFinite(reconstructed)) throw new Error(`Unsupported PNG filter ${filter}`)
      pixels[y * stride + x] = reconstructed & 0xff
    }
    rawOffset += stride
  }
  return { width, height, pixels }
}

function blackModules(png) {
  const modules = []
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4
      const [red, green, blue, alpha] = png.pixels.subarray(offset, offset + 4)
      const flattened = [red, green, blue].map((channel) =>
        Math.round((channel * alpha + 255 * (255 - alpha)) / 255),
      )
      if (flattened.every((channel) => channel === 0)) modules.push([x, y])
      else if (!flattened.every((channel) => channel === 255)) {
        throw new Error("Official source contains a non-binary flattened pixel")
      }
    }
  }
  return modules
}

function svgBytes(spec, modules) {
  const canvasModules = spec.familyWidth + 2
  const canvasEdgeMm = Number(
    ((spec.markerOuterEdgeMm * canvasModules) / spec.familyWidth).toFixed(6),
  )
  const lines = [
    '<?xml version="1.0" encoding="ASCII"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasEdgeMm}mm" height="${canvasEdgeMm}mm" viewBox="0 0 ${canvasModules} ${canvasModules}" shape-rendering="crispEdges">`,
    `  <title>${spec.family} ID ${spec.tagId}</title>`,
    `  <rect width="${canvasModules}" height="${canvasModules}" fill="#fff"/>`,
    '  <g transform="translate(1 1)" fill="#000">',
    ...modules.map(([x, y]) => `    <rect x="${x}" y="${y}" width="1" height="1"/>`),
    "  </g>",
    "</svg>",
    "",
  ]
  return Buffer.from(lines.join("\n"), "ascii")
}

function readFixture() {
  const bytes = readFileSync(FIXTURE_PATH)
  const fixture = JSON.parse(bytes.toString("utf8"))
  if (
    sha256(bytes) !== CANONICAL_SOURCE_SHA256 ||
    fixture.schemaVersion !== "demo-04-synthetic-activities-v1" ||
    fixture.provenance?.assetCommit !== SOURCE_COMMIT ||
    fixture.activities?.length !== 50 ||
    fixture.boards?.length !== 3
  ) {
    throw new Error("Canonical DEMO-04 fixture has an unexpected contract")
  }
  const cardIds = fixture.activities.flatMap((item) => [item.activeTagId, item.doneTagId])
  const requiredFeaturedPairs = new Set([
    "0/1",
    "74/75",
    "1024/1025",
    "4096/4097",
    "8192/8193",
    "24000/24001",
    "40000/40001",
    "63484/63485",
  ])
  const featuredPairs = new Set(
    fixture.activities
      .filter((item) => item.featured)
      .map((item) => `${item.activeTagId}/${item.doneTagId}`),
  )
  const additionalSlots = fixture.activities
    .filter((item) => !item.featured)
    .map((item) => item.markerSlot)
    .sort((first, second) => first - second)
  if (
    new Set(cardIds).size !== 100 ||
    featuredPairs.size !== 8 ||
    [...featuredPairs].some((pair) => !requiredFeaturedPairs.has(pair)) ||
    JSON.stringify(additionalSlots) !==
      JSON.stringify(Array.from({ length: 42 }, (_, index) => index + 100)) ||
    JSON.stringify(fixture.boards.map((board) => board.boardMarkerId).sort()) !==
      JSON.stringify([63486, 63487, 63488]) ||
    fixture.activities.some(
      (item) =>
        item.activeTagId !== 2 * item.markerSlot ||
        item.doneTagId !== item.activeTagId + 1 ||
        item.activeTagId < 0 ||
        item.doneTagId > 63485,
    )
  ) {
    throw new Error("Canonical DEMO-04 fixture violates the ANA-09C4 card pool")
  }
  return { fixture, bytes }
}

function assetSpecs(fixture) {
  const cards = fixture.activities.flatMap((item) => [
    {
      family: "tagCircle49h12",
      familyWidth: 11,
      tagId: item.activeTagId,
      role: "card",
      status: "active",
      markerOuterEdgeMm: 18,
      filename: `tagCircle49h12_id${String(item.activeTagId).padStart(5, "0")}_card_active_18mm.svg`,
    },
    {
      family: "tagCircle49h12",
      familyWidth: 11,
      tagId: item.doneTagId,
      role: "card",
      status: "done",
      markerOuterEdgeMm: 18,
      filename: `tagCircle49h12_id${String(item.doneTagId).padStart(5, "0")}_card_done_18mm.svg`,
    },
  ])
  const boards = fixture.boards.map((board) => ({
    family: "tagCircle49h12",
    familyWidth: 11,
    tagId: board.boardMarkerId,
    role: "board",
    status: null,
    markerOuterEdgeMm: 36,
    filename: `tagCircle49h12_id${String(board.boardMarkerId).padStart(5, "0")}_board_36mm.svg`,
  }))
  const references = [
    {
      family: "tagStandard52h13",
      familyWidth: 10,
      tagId: 0,
      role: "reference",
      status: null,
      markerOuterEdgeMm: 18,
      filename: "tagStandard52h13_id00000_reference_18mm.svg",
    },
    {
      family: "tagStandard52h13",
      familyWidth: 10,
      tagId: 0,
      role: "reference",
      status: null,
      markerOuterEdgeMm: 180 / 11,
      filename: "tagStandard52h13_id00000_reference_module_matched.svg",
    },
  ]
  return [...cards, ...boards, ...references]
}

const sourceDir = option("--source-dir")
const outputDir = option("--output-dir")
const replace = process.argv.includes("--replace")
if (
  !sourceDir ||
  !outputDir ||
  ![6, 7].includes(process.argv.length) ||
  (process.argv.length === 7 && !replace)
) {
  throw new Error(
    "Usage: node scripts/generate-tag-only-assets.mjs --source-dir <apriltag-imgs-checkout> --output-dir <directory> [--replace]",
  )
}

const resolvedSource = resolve(sourceDir)
const resolvedOutput = resolve(outputDir)
const sourceCommit = execFileSync("git", ["-C", resolvedSource, "rev-parse", "HEAD"], {
  encoding: "ascii",
  env: PINNED_GIT_ENV,
}).trim()
if (sourceCommit !== SOURCE_COMMIT) {
  throw new Error("Official AprilTag asset checkout differs from the pinned ANA-09C4 provenance")
}
for (const [family, expectedTree] of Object.entries(FAMILY_TREES)) {
  const tree = execFileSync("git", ["-C", resolvedSource, "rev-parse", `HEAD:${family}`], {
    encoding: "ascii",
    env: PINNED_GIT_ENV,
  }).trim()
  if (tree !== expectedTree) throw new Error(`Pinned ${family} source tree differs`)
}

const { fixture, bytes: fixtureBytes } = readFixture()
const specs = assetSpecs(fixture)
const outputParent = dirname(resolvedOutput)
mkdirSync(outputParent, { recursive: true })
const targetLock = acquireTargetLock(resolvedOutput)
try {
  recoverTargetArtifacts(resolvedOutput, { restoreBackup: true })
  if (existsSync(resolvedOutput) && !replace) {
    throw new Error(`Asset output directory already exists: ${resolvedOutput}`)
  }
  const stagingDir = mkdtempSync(join(outputParent, `.${basename(resolvedOutput)}.tmp-`))
  try {
    const assets = []
    for (const spec of specs) {
      const paddedId = String(spec.tagId).padStart(5, "0")
      const sourcePrefix = spec.family === "tagCircle49h12" ? "tag49_12" : "tag52_13"
      const sourceRelative = `${spec.family}/${sourcePrefix}_${paddedId}.png`
      const sourceBytes = readGitObjectBytes(resolvedSource, SOURCE_COMMIT, sourceRelative)
      const generatedBytes = svgBytes(
        spec,
        blackModules(decodeRgbaPng(sourceBytes, spec.familyWidth)),
      )
      writeFileSync(resolve(stagingDir, spec.filename), generatedBytes)
      assets.push({
        family: spec.family,
        tagId: spec.tagId,
        role: spec.role,
        status: spec.status,
        markerOuterEdgeMm: spec.markerOuterEdgeMm,
        filename: spec.filename,
        sourcePng: sourceRelative,
        sourcePngSha256: sha256(sourceBytes),
        svgSha256: sha256(generatedBytes),
      })
    }

    const manifest = {
      schemaVersion: "demo04-tag-only-assets-v2",
      scope: "synthetic_non_product_preflight",
      format: "deterministic_svg_1_1",
      fixtureVersion: fixture.fixtureVersion,
      fixtureSha256: sha256(fixtureBytes),
      canonicalSource: {
        path: "src/data/demo-04-synthetic-activities.v1.json",
        sha256: CANONICAL_SOURCE_SHA256,
      },
      markerSizeDefinition: "outer_edge_of_official_family_raster_excluding_external_quiet_zone",
      quietZoneModulesPerSide: 1,
      officialProvenance: {
        assetRepository: "https://github.com/AprilRobotics/apriltag-imgs",
        assetCommit: SOURCE_COMMIT,
        assetFamilyTreeGitSha1: FAMILY_TREES,
        license: "BSD-2-Clause",
      },
      assets,
    }
    writeFileSync(
      resolve(stagingDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "ascii",
    )
    const licensePath = resolve("public/ana09c4/APRILTAG_ASSET_LICENSE.md")
    if (existsSync(licensePath))
      copyFileSync(licensePath, resolve(stagingDir, basename(licensePath)))

    if (!replace) {
      if (existsSync(resolvedOutput)) {
        throw new Error(`Asset output appeared during generation: ${resolvedOutput}`)
      }
      renameSync(stagingDir, resolvedOutput)
    } else {
      const backupDir = join(outputParent, `.${basename(resolvedOutput)}.backup`)
      if (existsSync(backupDir)) throw new Error(`Asset backup path already exists: ${backupDir}`)
      if (existsSync(resolvedOutput)) renameSync(resolvedOutput, backupDir)
      try {
        renameSync(stagingDir, resolvedOutput)
        rmSync(backupDir, { recursive: true, force: true })
      } catch (error) {
        if (existsSync(backupDir) && !existsSync(resolvedOutput))
          renameSync(backupDir, resolvedOutput)
        throw error
      }
    }
    console.log(`Generated ${assets.length} pinned vectors in ${resolvedOutput}`)
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true })
    throw error
  }
} finally {
  targetLock.release()
}
