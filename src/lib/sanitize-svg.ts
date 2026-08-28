import DOMPurify from "dompurify"

const SAFE_STYLE_PROPERTIES = new Set([
  "dominant-baseline",
  "fill",
  "fill-opacity",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "text-align",
  "text-anchor",
  "visibility",
  "word-spacing",
])
const FORBIDDEN_CSS_SYNTAX = /(?:\\|\/\*|\*\/)/
const FORBIDDEN_STYLE_VALUE = /(?:@|data:|expression|https?:|javascript:|var\s*\()/i

export function isLocalSvgReference(value: string) {
  return /^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(value.trim())
}

function hasOnlyLocalCssUrls(value: string) {
  if (FORBIDDEN_CSS_SYNTAX.test(value)) return false
  if (!/url\s*\(/i.test(value)) return true
  const withoutLocalReferences = value.replace(
    /url\s*\(\s*(['"]?)#[A-Za-z_][A-Za-z0-9_.:-]*\1\s*\)/gi,
    "",
  )
  return !/url\s*\(/i.test(withoutLocalReferences)
}

export function sanitizeSvgStyle(style: string) {
  return style
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .flatMap((declaration) => {
      const separator = declaration.indexOf(":")
      if (separator < 1) return []
      const property = declaration.slice(0, separator).trim().toLowerCase()
      const value = declaration.slice(separator + 1).trim()
      if (
        !SAFE_STYLE_PROPERTIES.has(property) ||
        !value ||
        FORBIDDEN_STYLE_VALUE.test(value) ||
        !hasOnlyLocalCssUrls(value)
      ) {
        return []
      }
      return [`${property}:${value}`]
    })
    .join(";")
}

export function sanitizeSvgMarkup(svg: string) {
  const sanitized = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
    ADD_ATTR: ["xlink:href", "href", "viewBox", "preserveAspectRatio"],
    FORBID_TAGS: ["style"],
  })

  const document = new DOMParser().parseFromString(sanitized, "image/svg+xml")
  if (document.querySelector("parsererror")) return ""

  for (const element of document.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (["href", "xlink:href", "src"].includes(name)) {
        if (!isLocalSvgReference(attribute.value)) element.removeAttribute(attribute.name)
        continue
      }
      if (name === "style") {
        const style = sanitizeSvgStyle(attribute.value)
        if (style) element.setAttribute("style", style)
        else element.removeAttribute("style")
        continue
      }
      if (!hasOnlyLocalCssUrls(attribute.value)) element.removeAttribute(attribute.name)
    }
  }

  return new XMLSerializer().serializeToString(document.documentElement)
}
