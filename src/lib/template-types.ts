export type TemplateElementBase = {
  id: string
  name: string
  locked?: boolean
  hidden?: boolean
}

export type TemplateRectElement = TemplateElementBase & {
  type: "rect"
  xMm: number
  yMm: number
  wMm: number
  hMm: number
  fill?: string
  stroke?: string
  strokeWidthMm?: number
}

export type TemplateLineElement = TemplateElementBase & {
  type: "line"
  x1Mm: number
  y1Mm: number
  x2Mm: number
  y2Mm: number
  stroke?: string
  strokeWidthMm?: number
}

export type TemplateTriangleElement = TemplateElementBase & {
  type: "triangle"
  xMm: number
  yMm: number
  wMm: number
  hMm: number
  corner: "br" | "bl" | "tr" | "tl"
  fill?: string
  stroke?: string
  strokeWidthMm?: number
}

export type TemplateTextElement = TemplateElementBase & {
  type: "text"
  xMm: number
  yMm: number
  wMm: number
  hMm: number
  text: string
  color?: string
  fontSizeMm: number
  fontWeight?: 400 | 500 | 600 | 700
  align?: "left" | "center" | "right"
  valign?: "top" | "middle" | "bottom"
  rotateDeg?: number
  writingMode?: "horizontal" | "vertical-rl"
  letterSpacingMm?: number
}

export type TemplateImageElement = TemplateElementBase & {
  type: "image"
  xMm: number
  yMm: number
  wMm: number
  hMm: number
  src: string
  fit?: "cover" | "contain"
  rotateDeg?: number
}

export type TemplateElement =
  | TemplateRectElement
  | TemplateLineElement
  | TemplateTriangleElement
  | TemplateTextElement
  | TemplateImageElement

export type TicketTemplate = {
  id: string
  name: string
  widthMm: number
  heightMm: number
  elements: TemplateElement[]
}

export type TemplateToken = {
  key: string
  label: string
}
