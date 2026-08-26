import { writeLcmdDemoBinding } from "./lcmd-demo-xlsx-adapter"

const flags = ["--processes", "--cards", "--selection", "--output"] as const
const values = Object.fromEntries(
  flags.map((flag) => {
    const index = process.argv.indexOf(flag)
    return [flag, index >= 0 ? process.argv[index + 1] : undefined]
  }),
) as Record<(typeof flags)[number], string | undefined>

if (
  process.argv.length !== 10 ||
  flags.some((flag) => !values[flag]) ||
  new Set(process.argv.slice(2).filter((value) => value.startsWith("--"))).size !== flags.length
) {
  throw new Error(
    "Usage: npm run demo:lcmd-bind -- --processes <xlsx> --cards <xlsx> --selection <json.local> --output <json.local>",
  )
}

const outputPath = await writeLcmdDemoBinding({
  processesPath: values["--processes"]!,
  cardsPath: values["--cards"]!,
  selectionPath: values["--selection"]!,
  outputPath: values["--output"]!,
})
console.log(`Generated local read-only DEMO-04 LCMD binding in ${outputPath}`)
