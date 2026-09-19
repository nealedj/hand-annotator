export const SVG_NS = 'http://www.w3.org/2000/svg';

/** System font stack: no font files, so no network and nothing for the export to fetch. */
export const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

type Attrs = Record<string, string | number>;

/**
 * Creates an SVG element. Styling goes in presentation attributes, never `style`,
 * because the CSP blocks inline styles and the PNG export must not depend on CSS.
 */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}
