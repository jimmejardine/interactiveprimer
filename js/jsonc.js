// @ts-check
/**
 * Tolerant parser for the AUTHORED inline JSON blocks (quiz banks, concept-meta,
 * scene-strings). Authors annotate these with `//` and `/* … *\/` comments and leave trailing
 * commas; plain `JSON.parse` rejects both. We delegate to JSON5, which allows them (it's also
 * string-aware, so a `//` inside a string value is preserved).
 *
 * `json5` resolves as a bare specifier in both environments: via the import map in js/boot.js
 * in the browser, and from node_modules (a devDependency) in the Node tooling.
 * @module
 */

import JSON5 from "json5";

/**
 * Parse JSON that may contain comments and trailing commas (JSON5). A drop-in for
 * `JSON.parse` (returns `any`); use it for any hand-authored inline JSON. Generated files can
 * stay on plain `JSON.parse`.
 * @param {string} text
 * @returns {any}
 */
export function parseJsonc(text) {
  return JSON5.parse(text);
}
