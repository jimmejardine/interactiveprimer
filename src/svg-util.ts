/**
 * Tiny shared SVG/number helpers used by the SVG-drawing modules (the concept-graph explorer, the
 * pathway strip, …). Kept in one place so `createElementNS` boilerplate and `clamp` aren't re-inlined
 * per file.
 * @module
 */

export const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Create an SVG element with attributes set from a plain object (values stringified).
 */
export function mk(tag: string, attrs?: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
  return e as SVGElement;
}

/**
 * Clamp `v` into the inclusive range `[lo, hi]`.
 */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
