// @ts-check
/**
 * Harvest the concept ids that a page references inline via `<primer-ref to="id">`. These are
 * structural cross-references that the graph build (scripts/build-graph.js) turns into DAG edges:
 *
 *  - a plain `<primer-ref to="X">` is a **backward** edge — X is a prerequisite of *this* page
 *    (unioned into this concept's `prerequisites`);
 *  - `<primer-ref forward to="X">` is the **reverse** — *this* page becomes a prerequisite of X
 *    (the build adds it to X's prerequisites instead).
 *  - `<primer-ref soft to="X">` adds **no edge at all** — just the styled cross-link (and the
 *    confidence dot). For an incidental "see also" between concepts with no learning dependency
 *    either way (e.g. two peers). The build still checks X names a real concept.
 *
 * The control renders identically for all three (the attributes are build-only). `soft` takes
 * precedence over `forward` if both are somehow present (no edge wins).
 *
 * Pure string-in / ids-out (no DOM), so it runs in the Node build and is unit-testable. The
 * caller owns policy (self-exclusion, union with the header, reversing forward refs, validating soft).
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
/** A standalone `soft` boolean attribute — the "no edge, link only" variant. */
const SOFT_ATTR = /(?:^|\s)soft(?![\w-])/i;

/**
 * Parse every `<primer-ref>` in the HTML to `{ id, forward, soft }` (in first-seen order). Empty
 * `to` values are dropped; comments are ignored. `soft` wins over `forward` (a soft ref is edgeless).
 * @param {string} html
 * @returns {{ id: string, forward: boolean, soft: boolean }[]}
 */
function parseRefs(html) {
  const body = html.replace(COMMENT, "");
  /** @type {{ id: string, forward: boolean, soft: boolean }[]} */
  const out = [];
  for (const m of body.matchAll(PRIMER_REF_TAG)) {
    const attrs = m[1];
    const toM = attrs.match(TO_ATTR);
    const id = (toM ? (toM[1] ?? toM[2] ?? "") : "").trim();
    if (id) {
      const soft = SOFT_ATTR.test(attrs);
      // soft wins: an edgeless ref is never also a forward edge.
      out.push({ id, soft, forward: !soft && FORWARD_ATTR.test(attrs) });
    }
  }
  return out;
}

/**
 * The de-duped concept ids referenced by a plain (backward) `<primer-ref to="…">`, in first-seen
 * order — each is a prerequisite of THIS page. `forward` and `soft` refs are excluded (they're not
 * backward prerequisites; see {@link extractForwardRefs} / {@link extractSoftRefs}).
 * @param {string} html
 * @returns {string[]}
 */
export function extractConceptRefs(html) {
  return [...new Set(parseRefs(html).filter((r) => !r.forward && !r.soft).map((r) => r.id))];
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

/**
 * The de-duped concept ids referenced by an edgeless `<primer-ref soft to="…">`, in first-seen
 * order. These create NO graph edge; the caller validates only that each names a real concept.
 * @param {string} html
 * @returns {string[]}
 */
export function extractSoftRefs(html) {
  return [...new Set(parseRefs(html).filter((r) => r.soft).map((r) => r.id))];
}
