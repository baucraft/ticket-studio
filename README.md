# Ticket Studio

Local-first ticket generator for planning boards. Upload Excel exports, customize SVG templates, and export to PDF.

**Live Demo:** https://baucraft.github.io/ticket-studio/

## Features

- **Import Excel files** - Supports two formats:
  - **Prozessplan (Process Plan)** - Tasks with date ranges, generates daily cards
  - **Plankarten (Plan Cards)** - Individual daily cards
- **Auto-detect format** with column mapping UI
- **SVG templates** - Upload custom templates created in Inkscape/Illustrator
  - Mustache tokens: `{{taskName}}`, `{{date}}`, `{{company}}`, `{{trade}}`, `{{taskId}}`, `{{tradeColor}}`
  - Text wrapping via `data-wrap-width` attribute
- **Ticket list** with thumbnails, grouping (company / trade / task), and preview
- **PDF export** - Vector output (1 ticket per page, exact dimensions)

## Hausmesse DEMO-02

The Studio tab contains a controlled `Load demo` path for the wholly synthetic
`hausmesse-demo-v1` data set. It generates exactly 14 cards from three fictional
trades with seven initially active and seven initially finished cards. This path
is a non-product demo field reference and does not freeze the later Gate G4
production layout.

Browser exports include the frozen input plan, exact card pages, an A4 print
sheet, JSON and CSV manifests, and SHA-256 checksums. The same package can be
generated without overwriting existing evidence:

```bash
npm run demo:generate -- --output-dir /tmp/hausmesse-demo-v1
(
  cd /tmp/hausmesse-demo-v1
  sha256sum --check SHA256SUMS
)
```

The output directory must not exist. Files are completed in a sibling staging
directory and published together. The frozen input rejects unknown fields,
changed records, duplicate IDs, invalid references and any card count other
than 14 instead of inventing plausible data.

Use `hausmesse-demo-v1-print-a4.pdf` for printing. Print at actual size (`100%`),
disable `Fit to page`, and first measure the printed card and code dimensions:

- card: `66 x 120 mm`
- AprilTag: `9 mm`
- DataMatrix: `11 mm`
- code gap: `0.7 mm`

The A4 file places up to four cards per page with 20 mm outer margins and crop
marks. A physical printer/card-stock preflight is still required before using
the cards on the demonstration board. The custom-size `cards.pdf` is the exact
vector source and is not the preferred office-printer artifact.

Each visible 30 mm card end uses a 6 mm solid trade-color band plus a 12% tint
across the remaining header. The code label stays fully white, and the trade
name remains visible as text so status interpretation never relies on color
alone.

Only the built-in synthetic plan is approved for this path. The browser
production dependency audit is clean. The local LCMD adapter still uses legacy
`xlsx@0.18.5`; until [issue 3](https://github.com/baucraft/ticket-studio/issues/3)
is closed, it may parse only explicitly approved, access-restricted local
exports and never arbitrary uploads, CI/service inputs, or email attachments.
The development server must not be exposed as a production service.

## Supported Excel Formats

Example files are provided in the [`examples/`](examples/) folder.

### Prozessplan (Process Plan)

Tasks with date ranges. Each task generates daily cards for the date range.

Columns: `Prozessname`, `Startdatum`, `Enddatum`, `Dauer`, `Gewerk`, `Gewerk Hintergrundfarbe`

### Plankarten (Plan Cards)

Individual daily cards (one row per day).

Columns: `Prozessname`, `Datum`, `Gewerk`

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS v4 + shadcn/ui
- jsPDF + svg2pdf.js for vector PDF export
- ESLint (flat config) + Prettier

## Development

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
npm test
npm run test:coverage  # with coverage
```

## Deployment

The app is automatically deployed to GitHub Pages on push to `main` branch.

To deploy manually:

1. Push to `main` branch, or
2. Go to Actions tab and trigger "Deploy to GitHub Pages" workflow

## SheetJS / XLSX Parsing

Uses SheetJS CE `0.20.3` via a vendored ESM build (`public/vendor/xlsx-0.20.3.mjs`). Falls back to official CDN if needed.
