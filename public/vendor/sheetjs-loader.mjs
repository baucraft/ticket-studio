// Loads SheetJS CE (0.20.3) before the app boots.
// This file lives in /public and is served as-is by Vite.

const SHEETJS_VERSION = "0.20.3"
const LOCAL = new URL(`./xlsx-${SHEETJS_VERSION}.mjs`, import.meta.url).href

globalThis.__sheetjsPromise = import(LOCAL)
