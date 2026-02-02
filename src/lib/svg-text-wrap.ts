/**
 * SVG Text Wrapping Utility
 *
 * Wraps text in SVG <text> elements that have a `data-wrap-width` attribute.
 * The attribute value should be the maximum width in the SVG's coordinate units (typically mm).
 *
 * Usage in SVG template:
 *   <text data-wrap-width="50" ...>{{taskName}}</text>
 *
 * This will wrap the text to fit within 50mm width.
 */

/**
 * Approximate character width ratios relative to font size.
 * These are rough estimates for Helvetica/Arial.
 * A more accurate implementation would measure actual glyphs.
 */
const CHAR_WIDTH_RATIO = 0.55 // Average character width as ratio of font size

/**
 * Estimate the width of a text string in SVG units.
 * This is a simplified estimation - for production, you'd want to use
 * actual font metrics or canvas measureText.
 */
function estimateTextWidth(text: string, fontSize: number): number {
  // Simple estimation based on character count and average width
  return text.length * fontSize * CHAR_WIDTH_RATIO
}

/**
 * Split text into words, preserving whitespace information.
 */
function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0)
}

/**
 * Wrap text into lines that fit within the specified width.
 */
function wrapTextToLines(text: string, maxWidth: number, fontSize: number): string[] {
  const words = splitWords(text)
  if (words.length === 0) return []

  const lines: string[] = []
  let currentLine = ""

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const testWidth = estimateTextWidth(testLine, fontSize)

    if (testWidth <= maxWidth) {
      currentLine = testLine
    } else {
      // Current line is full, start a new one
      if (currentLine) {
        lines.push(currentLine)
      }
      // Check if single word is too long
      if (estimateTextWidth(word, fontSize) > maxWidth) {
        // Word is too long, add it anyway (will overflow)
        lines.push(word)
        currentLine = ""
      } else {
        currentLine = word
      }
    }
  }

  // Don't forget the last line
  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

/**
 * Parse font-size from SVG text element.
 * Handles values like "4", "4px", "3.5mm", etc.
 */
function parseFontSize(element: Element): number {
  // Try style attribute first
  const style = element.getAttribute("style") || ""
  const styleMatch = style.match(/font-size:\s*([\d.]+)/)
  if (styleMatch) {
    return parseFloat(styleMatch[1])
  }

  // Then try font-size attribute
  const fontSizeAttr = element.getAttribute("font-size")
  if (fontSizeAttr) {
    // Remove units (px, mm, etc) and parse
    return parseFloat(fontSizeAttr.replace(/[a-z]+$/i, ""))
  }

  // Default font size in mm (approximately 12pt)
  return 4
}

/**
 * Get line height for text element.
 */
function getLineHeight(element: Element, fontSize: number): number {
  // Check for explicit line-height in style
  const style = element.getAttribute("style") || ""
  const match = style.match(/line-height:\s*([\d.]+)/)
  if (match) {
    return parseFloat(match[1])
  }
  // Default to 1.2x font size
  return fontSize * 1.2
}

/**
 * Process an SVG string and wrap text in elements that have data-wrap-width.
 * Returns the modified SVG string.
 */
export function wrapSvgText(svgString: string): string {
  // Parse the SVG
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, "image/svg+xml")

  // Find all text elements with data-wrap-width
  const textElements = doc.querySelectorAll("text[data-wrap-width]")

  for (const textEl of textElements) {
    const wrapWidth = parseFloat(textEl.getAttribute("data-wrap-width") || "0")
    if (wrapWidth <= 0) continue

    // Get the text content (handle both direct text and tspan children)
    let textContent = ""
    if (textEl.childNodes.length === 1 && textEl.childNodes[0].nodeType === Node.TEXT_NODE) {
      textContent = textEl.textContent || ""
    } else {
      // Has tspan children, get their combined text
      textContent = textEl.textContent || ""
    }

    textContent = textContent.trim()
    if (!textContent) continue

    const fontSize = parseFontSize(textEl)
    const lineHeight = getLineHeight(textEl, fontSize)

    // Wrap the text
    const lines = wrapTextToLines(textContent, wrapWidth, fontSize)
    if (lines.length <= 1) continue // No wrapping needed

    // Clear existing content
    textEl.textContent = ""

    // Get x position for tspan elements
    const x = textEl.getAttribute("x") || "0"

    // Create tspan for each line
    lines.forEach((line, index) => {
      const tspan = doc.createElementNS("http://www.w3.org/2000/svg", "tspan")
      tspan.setAttribute("x", x)
      // First line at original position, subsequent lines offset by line height
      if (index === 0) {
        tspan.setAttribute("dy", "0")
      } else {
        tspan.setAttribute("dy", lineHeight.toString())
      }
      tspan.textContent = line
      textEl.appendChild(tspan)
    })

    // Remove the data-wrap-width attribute so it doesn't affect rendering
    textEl.removeAttribute("data-wrap-width")
  }

  // Serialize back to string
  const serializer = new XMLSerializer()
  return serializer.serializeToString(doc)
}
