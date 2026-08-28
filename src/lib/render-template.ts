import Mustache from "mustache"

// We render into plain text (React text nodes, PDF text), not HTML.
// Disable Mustache HTML-escaping to avoid turning `&` into `&amp;`.
Mustache.escape = (value: string) => value

/** Default trade color (light purple) when not provided */
const DEFAULT_TRADE_COLOR = "#cbbfd7"
const TEMPLATED_ACTIVE_ATTRIBUTE =
  /\s(?:href|xlink:href|src|style)\s*=\s*(?:"[^"]*\{\{[^}]+\}\}[^"]*"|'[^']*\{\{[^}]+\}\}[^']*')/gi

function withDefaults(view: unknown) {
  const viewObj = typeof view === "object" && view !== null ? (view as Record<string, unknown>) : {}

  return {
    ...viewObj,
    tradeColor: (viewObj.tradeColor as string) || DEFAULT_TRADE_COLOR,
  }
}

function escapeSvgValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    )
  }
  if (Array.isArray(value)) return value.map(escapeSvgValue)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, escapeSvgValue(entry)]),
    )
  }
  return value
}

/**
 * Render a mustache template with ticket data.
 * Provides default values for certain fields to ensure valid SVG output.
 */
export function renderTemplateString(template: string, view: unknown) {
  try {
    return Mustache.render(template, withDefaults(view))
  } catch {
    return template
  }
}

/** Render untrusted ticket values into an SVG without allowing markup injection. */
export function renderSvgTemplateString(template: string, view: unknown) {
  try {
    const safeTemplate = template.replace(TEMPLATED_ACTIVE_ATTRIBUTE, "")
    return Mustache.render(safeTemplate, escapeSvgValue(withDefaults(view)))
  } catch {
    return template
  }
}
