// @ts-check
/**
 * Harvest the concept ids that a page references inline via `<primer-ref to="id">`. These are
 * structural cross-references that the graph build (scripts/build-graph.js) turns into DAG edges:
 *
 *  - a plain `<primer-ref to="X">` is a **backward** edge — X is a prerequisite of *this* page
 *    (unioned into this concept's `prerequisites`);
 *  - `<primer-ref forward to="X">` is the **reverse** — *this* page becomes a prerequisite of X
 *    (the build adds it to X's prerequisites instead). The control renders identically either way.
 *
 * Pure string-in / ids-out (no DOM), so it runs in the Node build and is unit-testable. The
 * caller owns policy (self-exclusion, union with the header, reversing forward refs).
 * @module
 */

/** Strip HTML comments so a commented-out `<primer-ref>` example isn't harvested. */
const COMMENT = /<!--[\s\S]*?-->/g;

/** Each opening `<primer-ref …>` tag, capturing its attribute string. */
const PRIMER_REF_TAG = /<primer-ref\b([^>]*)>/gi;
/** The `to` value (double- or single-quoted) within an attribute string. */
const TO_ATTR = /\bto\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
/** A standalone `forward` boolean attribute — not the substring of a quoted `to` value. */
const FORWARD_ATTR = /(?:^|\s)forward(?![\w-])/i;

/**
 * Parse every `<primer-ref>` in the HTML to `{ id, forward }` (in first-seen order). Empty `to`
 * values are dropped; comments are ignored.
 * @param {string} html
 * @returns {{ id: string, forward: boolean }[]}
 */
function parseRefs(html) {
  const body = html.replace(COMMENT, "");
  /** @type {{ id: string, forward: boolean }[]} */
  const out = [];
  for (const m of body.matchAll(PRIMER_REF_TAG)) {
    const attrs = m[1];
    const toM = attrs.match(TO_ATTR);
    const id = (toM ? (toM[1] ?? toM[2] ?? "") : "").trim();
    if (id) out.push({ id, forward: FORWARD_ATTR.test(attrs) });
  }
  return out;
}

/**
 * The de-duped concept ids referenced by a plain (backward) `<primer-ref to="…">`, in first-seen
 * order — each is a prerequisite of THIS page. `forward` refs are excluded (see {@link extractForwardRefs}).
 * @param {string} html
 * @returns {string[]}
 */
export function extractConceptRefs(html) {
  return [...new Set(parseRefs(html).filter((r) => !r.forward).map((r) => r.id))];
}

/**
 * The de-duped concept ids referenced by a forward `<primer-ref forward to="…">`, in first-seen
 * order — THIS page is a prerequisite of each (the build reverses the edge).
 * @param {string} html
 * @returns {string[]}
 */
export function extractForwardRefs(html) {
  return [...new Set(parseRefs(html).filter((r) => r.forward).map((r) => r.id))];
}
