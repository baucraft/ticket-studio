import Mustache from "mustache"

// We render into plain text (React text nodes, PDF text), not HTML.
// Disable Mustache HTML-escaping to avoid turning `&` into `&amp;`.
Mustache.escape = (value: string) => value

export function renderTemplateString(template: string, view: unknown) {
  try {
    return Mustache.render(template, view ?? {})
  } catch {
    return template
  }
}
