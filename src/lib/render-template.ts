import Mustache from "mustache"

// We render into plain text (React text nodes, PDF text), not HTML.
// Disable Mustache HTML-escaping to avoid turning `&` into `&amp;`.
Mustache.escape = (value: string) => value

/** Default trade color (light purple) when not provided */
const DEFAULT_TRADE_COLOR = "#cbbfd7"

/**
 * Render a mustache template with ticket data.
 * Provides default values for certain fields to ensure valid SVG output.
 */
export function renderTemplateString(template: string, view: unknown) {
  try {
    // Add default values for color fields to ensure valid SVG attributes
    const viewObj =
      typeof view === "object" && view !== null ? (view as Record<string, unknown>) : {}

    const viewWithDefaults = {
      ...viewObj,
      // Ensure tradeColor has a default so fill="{{tradeColor}}" is valid SVG
      tradeColor: (viewObj.tradeColor as string) || DEFAULT_TRADE_COLOR,
    }

    return Mustache.render(template, viewWithDefaults)
  } catch {
    return template
  }
}
