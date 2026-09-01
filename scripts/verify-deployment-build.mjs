import { existsSync, readFileSync, readdirSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const dist = resolve("dist")
const indexPath = join(dist, "index.html")
const loaderPath = join(dist, "vendor", "sheetjs-loader.mjs")
const sheetjsPath = join(dist, "vendor", "xlsx-0.20.3.mjs")

if (!existsSync(indexPath) || !existsSync(loaderPath) || !existsSync(sheetjsPath)) {
  throw new Error("Deployment build is missing index.html or vendored SheetJS assets")
}

const index = readFileSync(indexPath, "utf8")
if (!index.includes('src="/assets/')) {
  throw new Error("Deployment build must use root-relative assets")
}

const textExtensions = new Set([".css", ".html", ".js", ".mjs"])
const forbidden = ["cdn.sheetjs.com", "fonts.googleapis.com", "fonts.gstatic.com"]
const pending = [dist]
let hasRootLoaderUrl = false
while (pending.length > 0) {
  const directory = pending.pop()
  if (!directory) continue
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      pending.push(path)
    } else if (textExtensions.has(extname(entry.name))) {
      const text = readFileSync(path, "utf8")
      if (text.includes("/vendor/sheetjs-loader.mjs")) hasRootLoaderUrl = true
      if (text.includes("/ticket-studio/")) {
        throw new Error("Deployment build unexpectedly contains the GitHub Pages base path")
      }
      const match = forbidden.find((value) => text.includes(value))
      if (match) throw new Error(`Deployment build contains forbidden external host ${match}`)
    }
  }
}

if (!hasRootLoaderUrl) {
  throw new Error("Deployment build is missing the root-relative SheetJS loader URL")
}

console.log("Deployment build is root-relative and self-contained")
