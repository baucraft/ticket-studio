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

// Derived from rasterization of Karten_Layout_Blank.pdf at 300 DPI.
export const DEFAULT_TICKET_SIZE_MM = {
  width: 70.19,
  height: 123.11,
} as const
