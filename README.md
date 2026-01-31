# Ticket Studio

Local-first ticket generator for planning boards.

## Features

- Import `.xlsx` exports (supports both provided export formats)
- Auto-detect + column mapping UI
- Ticket list with thumbnails, grouping (company → trade → task), and preview
- Template editor (simple WYSIWYG) with `{{tokens}}`
- Export multi-page A4 PDF (2×2 tickets per page)

## Tech

- Vite + React + TypeScript
- Tailwind CSS v4 + shadcn/ui
- ESLint (flat config) + Prettier

## SheetJS / XLSX parsing

We use SheetJS CE `0.20.3` via a vendored ESM build:

- `public/vendor/xlsx-0.20.3.mjs`

At runtime the app prefers the vendored file and falls back to the official CDN.

## Dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Tests

```bash
npm run test
```

Coverage:

```bash
npm run test:coverage
```
