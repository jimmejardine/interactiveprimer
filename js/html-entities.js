// @ts-check
/**
 * Decode the HTML entities that show up in authored plain text (notably concept titles such as
 * `Forces &amp; Motion`). Pure and DOM-free, so it runs in the Node graph build as well as in the
 * browser. Used by scripts/build-graph.js when turning a `<primer-title>`'s markup into the plain
 * `title` stored in dist/graph.json — without it, a node label renders the literal `&amp;`.
 * @module
 */

/** Named entities that turn up in titles/prose (numeric refs handled below). @type {Record<string, string>} */
const NAMED = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decode named (`&amp;`) and numeric (`&#160;`, `&#xa0;`) HTML entities in `s`. Unknown entities are
 * left as-is. `&amp;` is decoded last (it's matched by the same pass, but because we replace every
 * entity in a single regex sweep, `&amp;lt;` correctly yields `&lt;` rather than `<`).
 * @param {string} s
 * @returns {string}
 */
export function decodeEntities(s) {
  if (typeof s !== "string" || s.indexOf("&") === -1) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/** @type {Record<string, string>} */
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/**
 * Escape the five HTML-special characters so authored/dynamic text is safe to interpolate into an
 * `innerHTML` string. The encode counterpart to {@link decodeEntities}. Pure and DOM-free (runs in the
 * Node build too). Previously copy-pasted (as `esc`/`escapeHtml`) across a dozen components.
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}
