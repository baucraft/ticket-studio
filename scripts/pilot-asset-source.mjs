import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { inflateSync } from "node:zlib"

import { readGitObjectBytes } from "./git-object.mjs"

const SOURCE_COMMIT = "f3fd9a7add5bfd82a886fc65240fdb8e3c9ac5a1"
const FAMILY_TREE = "52cc190bc5d2824afd5f3fb908283d71de86fc6a"
const PINNED_GIT_ENV = { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" }

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function filesFromTar(archive) {
  const files = new Map()
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const text = (start, length) =>
      header
        .subarray(start, start + length)
        .toString("utf8")
        .replace(/\0.*$/s, "")
    const name = [text(345, 155), text(0, 100)].filter(Boolean).join("/")
    const size = Number.parseInt(text(124, 12).trim() || "0", 8)
    const type = text(156, 1)
    const dataOffset = offset + 512
    if (type === "" || type === "0")
      files.set(name, archive.subarray(dataOffset, dataOffset + size))
    offset = dataOffset + Math.ceil(size / 512) * 512
  }
  return files
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
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Source asset is not a PNG")
  }
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
  if (width !== 11 || height !== 11 || compressed.length === 0) {
    throw new Error("Official tagCircle49h12 source must be 11 x 11 RGBA PNG")
  }
  const raw = inflateSync(Buffer.concat(compressed))
  const stride = width * 4
  const pixels = Buffer.alloc(stride * height)
  let rawOffset = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++]
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
  const canvasModules = 13
  const canvasEdgeMm = Number(((spec.markerOuterEdgeMm * canvasModules) / 11).toFixed(6))
  return Buffer.from(
    [
      '<?xml version="1.0" encoding="ASCII"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasEdgeMm}mm" height="${canvasEdgeMm}mm" viewBox="0 0 13 13" shape-rendering="crispEdges">`,
      `  <title>tagCircle49h12 ID ${spec.tagId}</title>`,
      '  <rect width="13" height="13" fill="#fff"/>',
      '  <g transform="translate(1 1)" fill="#000">',
      ...modules.map(([x, y]) => `    <rect x="${x}" y="${y}" width="1" height="1"/>`),
      "  </g>",
      "</svg>",
      "",
    ].join("\n"),
    "ascii",
  )
}

export function generatePinnedCircle49h12Assets(sourceDir, specs) {
  const source = resolve(sourceDir)
  const commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
    encoding: "ascii",
    env: PINNED_GIT_ENV,
  }).trim()
  const tree = execFileSync("git", ["-C", source, "rev-parse", "HEAD:tagCircle49h12"], {
    encoding: "ascii",
    env: PINNED_GIT_ENV,
  }).trim()
  if (commit !== SOURCE_COMMIT || tree !== FAMILY_TREE) {
    throw new Error("Official AprilTag asset checkout differs from pinned provenance")
  }
  const assets = new Map()
  const provenance = []
  for (const spec of specs) {
    const validRole =
      (spec.role === "card" &&
        ["active", "done"].includes(spec.status) &&
        spec.markerOuterEdgeMm === 18) ||
      (spec.role === "board" && spec.status === null && spec.markerOuterEdgeMm === 36)
    const validId =
      (spec.role === "card" && spec.tagId >= 0 && spec.tagId <= 63_485) ||
      (spec.role === "board" && spec.tagId >= 63_486 && spec.tagId <= 64_509)
    if (!Number.isInteger(spec.tagId) || !validRole || !validId) {
      throw new Error(`Invalid pilot marker specification ${spec.tagId}`)
    }
    const paddedId = String(spec.tagId).padStart(5, "0")
    const sourcePng = `tagCircle49h12/tag49_12_${paddedId}.png`
    const sourceBytes = readGitObjectBytes(source, SOURCE_COMMIT, sourcePng)
    const suffix = spec.role === "board" ? "board_36mm" : `card_${spec.status}_18mm`
    const filename = `tagCircle49h12_id${paddedId}_${suffix}.svg`
    if (assets.has(filename)) throw new Error(`Duplicate pilot marker specification ${filename}`)
    const bytes = svgBytes(spec, blackModules(decodeRgbaPng(sourceBytes)))
    assets.set(filename, bytes)
    provenance.push({
      ...spec,
      filename,
      sourcePng,
      sourcePngSha256: sha256(sourceBytes),
      svgSha256: sha256(bytes),
    })
  }
  return {
    assets,
    provenance,
    officialProvenance: {
      assetRepository: "https://github.com/AprilRobotics/apriltag-imgs",
      assetCommit: SOURCE_COMMIT,
      assetFamilyTreeGitSha1: FAMILY_TREE,
      license: "BSD-2-Clause",
    },
  }
}

export function generatePinnedCircle49h12Codebook(sourceDir) {
  const source = resolve(sourceDir)
  const commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
    encoding: "ascii",
    env: PINNED_GIT_ENV,
  }).trim()
  const tree = execFileSync("git", ["-C", source, "rev-parse", "HEAD:tagCircle49h12"], {
    encoding: "ascii",
    env: PINNED_GIT_ENV,
  }).trim()
  if (commit !== SOURCE_COMMIT || tree !== FAMILY_TREE) {
    throw new Error("Official AprilTag asset checkout differs from pinned provenance")
  }
  const tagCount = 65_535
  const bytesPerTag = 16
  const codebook = Buffer.alloc(tagCount * bytesPerTag)
  const sources = filesFromTar(
    execFileSync(
      "git",
      ["-C", source, "archive", "--format=tar", SOURCE_COMMIT, "tagCircle49h12"],
      { env: PINNED_GIT_ENV, maxBuffer: 128 * 1024 * 1024 },
    ),
  )
  for (let tagId = 0; tagId < tagCount; tagId += 1) {
    const filename = `tag49_12_${String(tagId).padStart(5, "0")}.png`
    const sourceBytes = sources.get(`tagCircle49h12/${filename}`)
    if (!sourceBytes) throw new Error(`Pinned official source is missing ${filename}`)
    for (const [x, y] of blackModules(decodeRgbaPng(sourceBytes))) {
      const bit = y * 11 + x
      codebook[tagId * bytesPerTag + Math.floor(bit / 8)] |= 1 << (7 - (bit % 8))
    }
  }
  return {
    codebook,
    tagCount,
    bytesPerTag,
    sha256: sha256(codebook),
    officialProvenance: {
      assetRepository: "https://github.com/AprilRobotics/apriltag-imgs",
      assetCommit: SOURCE_COMMIT,
      assetFamilyTreeGitSha1: FAMILY_TREE,
      license: "BSD-2-Clause",
    },
  }
}
