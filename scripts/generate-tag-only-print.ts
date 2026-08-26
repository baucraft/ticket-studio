import { writeTagOnlyPrintPackage } from "./tag-only-print-package"

const outputIndex = process.argv.indexOf("--output-dir")
const outputDir = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined
const replace = process.argv.includes("--replace")
if (
  !outputDir ||
  ![4, 5].includes(process.argv.length) ||
  (process.argv.length === 5 && !replace)
) {
  throw new Error("Usage: npm run target:print -- --output-dir <directory> [--replace]")
}

const written = await writeTagOnlyPrintPackage(outputDir, { replace })
console.log(`Generated deterministic DEMO-04 print package in ${written}`)
