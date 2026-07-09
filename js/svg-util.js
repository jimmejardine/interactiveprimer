// @ts-check
/**
 * Tiny shared SVG/number helpers used by the SVG-drawing modules (the concept-graph explorer, the
 * pathway strip, …). Kept in one place so `createElementNS` boilerplate and `clamp` aren't re-inlined
 * per file.
 * @module
 */

export const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Create an SVG element with attributes set from a plain object (values stringified).
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @returns {SVGElement}
 */
export function mk(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
  return /** @type {SVGElement} */ (e);
}

/**
 * Clamp `v` into the inclusive range `[lo, hi]`.
 * @param {number} v @param {number} lo @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
