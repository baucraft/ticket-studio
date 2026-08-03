import { datamatrix, drawingSVG } from "@bwip-js/generic"

import { HausmesseDemoError } from "@/lib/hausmesse-demo"

function extractBarcodePath(svg: string): { path: string; size: number } {
  const viewBox = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)
  const path = /<path d="([^"]+)"/.exec(svg)
  if (!viewBox || viewBox[1] !== viewBox[2] || !path) {
    throw new HausmesseDemoError("DataMatrix generator returned unsupported SVG geometry")
  }
  return { path: path[1], size: Number(viewBox[1]) }
}

export function createDataMatrixPaths(payload: string) {
  const matrix = extractBarcodePath(
    datamatrix({ bcid: "datamatrix", text: payload, scale: 1 }, drawingSVG()),
  )
  const rotatedMatrix = extractBarcodePath(
    datamatrix({ bcid: "datamatrix", text: payload, scale: 1, rotate: "I" }, drawingSVG()),
  )
  if (matrix.size !== 28 || rotatedMatrix.size !== 28) {
    throw new HausmesseDemoError("Frozen payloads must produce a 28 by 28 DataMatrix raster")
  }
  return { normalPath: matrix.path, rotatedPath: rotatedMatrix.path }
}
