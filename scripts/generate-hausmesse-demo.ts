import { writeHausmesseDemoPackage } from "./hausmesse-demo-writer"

const outputFlag = process.argv.indexOf("--output-dir")
const outputValue = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined
if (!outputValue || outputFlag !== process.argv.length - 2) {
  throw new Error("Usage: npm run demo:generate -- --output-dir <new-directory>")
}

const outputDir = await writeHausmesseDemoPackage(outputValue)
console.log(`Generated Hausmesse demo package in ${outputDir}`)
