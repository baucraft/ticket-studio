export const PX_PER_MM = 96 / 25.4
export const PT_PER_MM = 72 / 25.4

export function mmToPx(mm: number, scale = 1) {
  return mm * PX_PER_MM * scale
}

export function pxToMm(px: number, scale = 1) {
  return px / (PX_PER_MM * scale)
}

export function mmToPt(mm: number) {
  return mm * PT_PER_MM
}

export const A4_SIZE_MM = {
  width: 210,
  height: 297,
} as const

// Derived from rasterization of Karten_Layout_Blank.pdf at 300 DPI.
export const DEFAULT_TICKET_SIZE_MM = {
  width: 70.19,
  height: 123.11,
} as const

export const DEFAULT_A4_2X2_LAYOUT_MM = {
  cols: 2,
  rows: 2,
  ticket: DEFAULT_TICKET_SIZE_MM,
  gap: {
    x: 49.95,
    y: 50.04,
  },
  margin: {
    x: (A4_SIZE_MM.width - (2 * DEFAULT_TICKET_SIZE_MM.width + 49.95)) / 2,
    y: (A4_SIZE_MM.height - (2 * DEFAULT_TICKET_SIZE_MM.height + 50.04)) / 2,
  },
} as const
