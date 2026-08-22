import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { inflateSync } from "node:zlib"

const FAMILY = "tagCircle49h12"
const SOURCE_COMMIT = "f3fd9a7add5bfd82a886fc65240fdb8e3c9ac5a1"
const SOURCE_TREE = "52cc190bc5d2824afd5f3fb908283d71de86fc6a"
const CARD_IDS = [
  0, 1, 74, 75, 1024, 1025, 4096, 4097, 8192, 8193, 24000, 24001, 40000, 40001, 63484, 63485,
]
const BOARD_IDS = [63486, 63487, 63488]

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

function decodeRgbaPng(bytes) {
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
    } else if (type === "IDAT") {
      compressed.push(data)
    } else if (type === "IEND") {
      break
    }
    offset += length + 12
  }
  if (width !== 11 || height !== 11 || compressed.length === 0) {
    throw new Error("Official tagCircle49h12 source must be an 11 x 11 RGBA PNG")
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

function svgBytes(tagId, markerEdgeMm, modules) {
  const canvasEdgeMm = Number(((markerEdgeMm * 13) / 11).toFixed(6))
  const lines = [
    '<?xml version="1.0" encoding="ASCII"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasEdgeMm}mm" height="${canvasEdgeMm}mm" viewBox="0 0 13 13" shape-rendering="crispEdges">`,
    `  <title>${FAMILY} ID ${tagId}</title>`,
    '  <rect width="13" height="13" fill="#fff"/>',
    '  <g transform="translate(1 1)" fill="#000">',
    ...modules.map(([x, y]) => `    <rect x="${x}" y="${y}" width="1" height="1"/>`),
    "  </g>",
    "</svg>",
    "",
  ]
  return Buffer.from(lines.join("\n"), "ascii")
}

const sourceDir = option("--source-dir")
const outputDir = option("--output-dir")
if (!sourceDir || !outputDir || process.argv.length !== 6) {
  throw new Error(
    "Usage: node scripts/generate-tag-only-assets.mjs --source-dir <apriltag-imgs-checkout> --output-dir <directory>",
  )
}

const resolvedSource = resolve(sourceDir)
const resolvedOutput = resolve(outputDir)
const sourceCommit = execFileSync("git", ["-C", resolvedSource, "rev-parse", "HEAD"], {
  encoding: "ascii",
}).trim()
const sourceTree = execFileSync("git", ["-C", resolvedSource, "rev-parse", `HEAD:${FAMILY}`], {
  encoding: "ascii",
}).trim()
if (sourceCommit !== SOURCE_COMMIT || sourceTree !== SOURCE_TREE) {
  throw new Error("Official AprilTag asset checkout differs from the pinned ANA-09C4 provenance")
}

const expectedSvgFiles = new Set([
  ...CARD_IDS.map((tagId) => {
    const status = tagId % 2 === 0 ? "active" : "done"
    return `${FAMILY}_id${String(tagId).padStart(5, "0")}_card_${status}_18mm.svg`
  }),
  ...BOARD_IDS.map((tagId) => `${FAMILY}_id${String(tagId).padStart(5, "0")}_board_36mm.svg`),
])
const staleSvgFiles = readdirSync(resolvedOutput).filter(
  (filename) => filename.endsWith(".svg") && !expectedSvgFiles.has(filename),
)
if (staleSvgFiles.length > 0) {
  throw new Error(`Output directory contains unbound SVG assets: ${staleSvgFiles.join(", ")}`)
}

const assets = []
for (const tagId of [...CARD_IDS, ...BOARD_IDS]) {
  const role = tagId >= 63486 ? "board" : "card"
  const status = role === "card" ? (tagId % 2 === 0 ? "active" : "done") : null
  const markerEdgeMm = role === "card" ? 18 : 36
  const paddedId = String(tagId).padStart(5, "0")
  const sourceRelative = `${FAMILY}/tag49_12_${paddedId}.png`
  const filename =
    role === "card"
      ? `${FAMILY}_id${paddedId}_card_${status}_18mm.svg`
      : `${FAMILY}_id${paddedId}_board_36mm.svg`
  const sourceBytes = readFileSync(resolve(resolvedSource, sourceRelative))
  const generatedBytes = svgBytes(tagId, markerEdgeMm, blackModules(decodeRgbaPng(sourceBytes)))
  writeFileSync(resolve(resolvedOutput, filename), generatedBytes)
  assets.push({
    tagId,
    role,
    status,
    markerOuterEdgeMm: markerEdgeMm,
    filename,
    sourcePng: sourceRelative,
    sourcePngSha256: sha256(sourceBytes),
    svgSha256: sha256(generatedBytes),
  })
}

const manifest = {
  schemaVersion: "demo04-tag-only-assets-v1",
  scope: "synthetic_non_product_target_picture",
  family: FAMILY,
  format: "deterministic_svg_1_1",
  markerSizeDefinition: "outer_edge_of_official_family_raster_excluding_external_quiet_zone",
  quietZoneModulesPerSide: 1,
  officialProvenance: {
    assetRepository: "https://github.com/AprilRobotics/apriltag-imgs",
    assetCommit: SOURCE_COMMIT,
    assetFamilyTreeGitSha1: SOURCE_TREE,
    license: "BSD-2-Clause",
  },
  assets,
}
writeFileSync(
  resolve(resolvedOutput, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "ascii",
)
console.log(`Generated ${assets.length} pinned ${FAMILY} vectors in ${resolvedOutput}`)
