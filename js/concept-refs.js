// @ts-check
/**
 * Harvest the concept ids that a page references inline via `<primer-ref to="id">`. These are
 * structural cross-references — each one is a prerequisite (a backward edge to a concept this
 * page builds on) — so the graph build (scripts/build-graph.js) unions them into the concept's
 * `prerequisites`, making the prose the single source of truth alongside the concept-meta header.
 *
 * Pure string-in / ids-out (no DOM), so it runs in the Node build and is unit-testable. The
 * caller owns policy (self-exclusion, union with the header); this only extracts.
 * @module
 */

/** Strip HTML comments so a commented-out `<primer-ref>` example isn't harvested. */
const COMMENT = /<!--[\s\S]*?-->/g;

/** Opening `<primer-ref …>` tag, capturing the `to` value (double- or single-quoted). */
const PRIMER_REF = /<primer-ref\b[^>]*?\bto\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/**
 * The de-duped, trimmed concept ids referenced by `<primer-ref to="…">` in the given HTML,
 * in first-seen order. Empty `to` values are dropped.
 * @param {string} html
 * @returns {string[]}
 */
export function extractConceptRefs(html) {
  const body = html.replace(COMMENT, "");
  /** @type {Set<string>} */
  const ids = new Set();
  for (const m of body.matchAll(PRIMER_REF)) {
    const id = (m[1] ?? m[2] ?? "").trim();
    if (id) ids.add(id);
  }
  return [...ids];
}
