// Loads SheetJS CE (0.20.3) before the app boots.
// This file lives in /public and is served as-is by Vite.

const SHEETJS_VERSION = "0.20.3"
const LOCAL = `/vendor/xlsx-${SHEETJS_VERSION}.mjs`
const CDN = `https://cdn.sheetjs.com/xlsx-${SHEETJS_VERSION}/package/xlsx.mjs`

globalThis.__sheetjsPromise = import(LOCAL).catch(() => import(CDN))
