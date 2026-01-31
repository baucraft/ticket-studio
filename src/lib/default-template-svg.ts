/**
 * Default ticket template as SVG with Mustache placeholders.
 * Dimensions are in mm, matching the original DEFAULT_TEMPLATE.
 * Coordinates derived from Karten_Layout_Blank.pdf rasterization.
 */

export const DEFAULT_TEMPLATE_WIDTH_MM = 70.19
export const DEFAULT_TEMPLATE_HEIGHT_MM = 123.11

// Convert mm to SVG units (1:1 mapping, SVG viewBox in mm)
export const DEFAULT_TEMPLATE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70.19 123.11" width="70.19mm" height="123.11mm">
  <!-- Outer border -->
  <rect x="0" y="0" width="70.19" height="123.11" fill="none" stroke="#111111" stroke-width="0.4"/>
  
  <!-- Inner border -->
  <rect x="4.49" y="4.32" width="61.04" height="114.47" fill="none" stroke="#111111" stroke-width="0.4"/>
  
  <!-- Side strip (purple) -->
  <rect x="4.74" y="4.49" width="7.11" height="36.83" fill="#cbbfd7" stroke="none"/>
  
  <!-- Header divider line -->
  <line x1="4.49" y1="41.66" x2="65.53" y2="41.66" stroke="#111111" stroke-width="0.5"/>
  
  <!-- Notes bar (gray) -->
  <rect x="4.83" y="41.99" width="60.36" height="5.51" fill="#d8d8d8" stroke="none"/>
  
  <!-- Notes bar bottom line -->
  <line x1="4.49" y1="47.67" x2="65.53" y2="47.67" stroke="#111111" stroke-width="0.4"/>
  
  <!-- Notes divider line -->
  <line x1="4.49" y1="73.15" x2="65.53" y2="73.15" stroke="#111111" stroke-width="0.5"/>
  
  <!-- Bottom fill (green) -->
  <rect x="4.49" y="73.32" width="61.04" height="45.47" fill="#9dbb61" stroke="none"/>
  
  <!-- Bottom notch (white cutout) -->
  <rect x="4.49" y="106.43" width="34.46" height="12.36" fill="#ffffff" stroke="none"/>
  
  <!-- Bottom triangle (purple) -->
  <polygon points="65.53,90 65.53,118.79 45.64,118.79" fill="#cbbfd7" stroke="none"/>
  
  <!-- Notes label -->
  <text x="5.5" y="45.5" font-family="Helvetica, Arial, sans-serif" font-size="3.6" font-weight="600" fill="#111111">Anmerkungen:</text>
  
  <!-- Task name (template placeholder) -->
  <text x="13.2" y="13" font-family="Helvetica, Arial, sans-serif" font-size="5.2" font-weight="600" fill="#111111">{{taskName}}</text>
  
  <!-- Task ID (template placeholder) -->
  <text x="13.2" y="25.5" font-family="Helvetica, Arial, sans-serif" font-size="3.6" font-weight="500" fill="#111111">ID: {{taskId}}</text>
  
  <!-- Date (template placeholder) -->
  <text x="13.2" y="33" font-family="Helvetica, Arial, sans-serif" font-size="3.4" font-weight="500" fill="#111111">{{date}}</text>
  
  <!-- Logo placeholder in top of side strip (square ~7x7mm) -->
  <rect x="5" y="4.75" width="6.6" height="6.6" fill="none" stroke="#999999" stroke-width="0.2" stroke-dasharray="1,1"/>
  <text x="8.3" y="8.5" font-family="Helvetica, Arial, sans-serif" font-size="2" fill="#999999" text-anchor="middle">LOGO</text>
  
  <!-- Company / Trade (vertical text in side strip, below logo with padding, text-anchor=end so text extends downward) -->
  <!-- Strip center=8.3, with dy=2.6 between lines: x=8.3-1.3=7.0 to center both lines -->
  <text x="7.5" y="12.5" font-family="Helvetica, Arial, sans-serif" font-size="2.4" font-weight="600" fill="#111111" text-anchor="end" transform="rotate(-90, 7.5, 12.5)"><tspan>{{company}}</tspan><tspan x="7.5" dy="2.6">{{trade}}</tspan></text>
</svg>`

export const DEFAULT_SVG_TEMPLATE = {
  id: "default",
  name: "Default (Karten Layout)",
  widthMm: DEFAULT_TEMPLATE_WIDTH_MM,
  heightMm: DEFAULT_TEMPLATE_HEIGHT_MM,
  svg: DEFAULT_TEMPLATE_SVG,
}
