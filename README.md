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

## Supported Excel Formats

### Prozessplan (Process Plan)

German columns: `Vorgangsname`, `Anfang`, `Ende`, `Dauer`, `Firma`, `Gewerk`, `Gewerk Hintergrundfarbe`

### Plankarten (Plan Cards)

German columns: `Vorgangsname`, `Datum`, `Firma`, `Gewerk`

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
