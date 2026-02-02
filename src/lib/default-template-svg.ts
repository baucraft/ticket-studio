/**
 * Default ticket template as SVG with Mustache placeholders.
 * Dimensions are in mm, matching the original DEFAULT_TEMPLATE.
 * Coordinates derived from Karten_Layout_Blank.pdf rasterization.
 */

import defaultTemplateSvg from "@/assets/default-template.svg?raw"

export const DEFAULT_TEMPLATE_WIDTH_MM = 70.19
export const DEFAULT_TEMPLATE_HEIGHT_MM = 123.11

export const DEFAULT_TEMPLATE_SVG = defaultTemplateSvg

export const DEFAULT_SVG_TEMPLATE = {
  id: "default",
  name: "Default (Karten Layout)",
  widthMm: DEFAULT_TEMPLATE_WIDTH_MM,
  heightMm: DEFAULT_TEMPLATE_HEIGHT_MM,
  svg: DEFAULT_TEMPLATE_SVG,
}
