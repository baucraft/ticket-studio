import { writeLcmdDemoSelectionReview } from "./lcmd-demo-xlsx-adapter"

const flags = ["--processes", "--cards", "--output"] as const
const values = Object.fromEntries(
  flags.map((flag) => {
    const index = process.argv.indexOf(flag)
    return [flag, index >= 0 ? process.argv[index + 1] : undefined]
  }),
) as Record<(typeof flags)[number], string | undefined>

if (
  process.argv.length !== 8 ||
  flags.some((flag) => !values[flag]) ||
  new Set(process.argv.slice(2).filter((value) => value.startsWith("--"))).size !== flags.length
) {
  throw new Error(
    "Usage: npm run demo:lcmd-review -- --processes <xlsx> --cards <xlsx> --output <json.local>",
  )
}

const outputPath = await writeLcmdDemoSelectionReview({
  processesPath: values["--processes"]!,
  cardsPath: values["--cards"]!,
  outputPath: values["--output"]!,
})
console.log(`Generated local DEMO-04 LCMD selection review in ${outputPath}`)
