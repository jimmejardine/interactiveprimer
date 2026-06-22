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
 *  - `<primer-ref todo to="X">` is the escape hatch for a concept you intend to write but haven't
 *    yet: it adds **NO edge** and is **NEVER validated** (so it can't fail the build), and renders
 *    as a muted "todo" placeholder. `X` is just a label (need not name a real page). Surfaced by
 *    {@link extractTodoRefs}.
 *
 * The control renders identically for all of them (the attributes are build-only). Precedence when
 * combined: `todo` wins (edgeless + unvalidated), then `soft` (edgeless), then `forward`.
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
/** A standalone `todo` boolean attribute — a placeholder for a not-yet-written concept. */
const TODO_ATTR = /(?:^|\s)todo(?![\w-])/i;

/**
 * Parse every `<primer-ref>` in the HTML to `{ id, forward, soft, todo }` (in first-seen order).
 * Empty `to` values are dropped; comments are ignored. Precedence: `todo` wins (edgeless), then
 * `soft` (edgeless), then `forward` — so a flagged ref is never also counted as a backward edge.
 * @param {string} html
 * @returns {{ id: string, forward: boolean, soft: boolean, todo: boolean }[]}
 */
function parseRefs(html) {
  const body = html.replace(COMMENT, "");
  /** @type {{ id: string, forward: boolean, soft: boolean, todo: boolean }[]} */
  const out = [];
  for (const m of body.matchAll(PRIMER_REF_TAG)) {
    const attrs = m[1];
    const toM = attrs.match(TO_ATTR);
    const id = (toM ? (toM[1] ?? toM[2] ?? "") : "").trim();
    if (id) {
      const todo = TODO_ATTR.test(attrs);
      const soft = !todo && SOFT_ATTR.test(attrs);
      out.push({ id, todo, soft, forward: !todo && !soft && FORWARD_ATTR.test(attrs) });
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
  return [...new Set(parseRefs(html).filter((r) => !r.forward && !r.soft && !r.todo).map((r) => r.id))];
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

/**
 * The de-duped ids referenced by a `<primer-ref todo to="…">` placeholder, in first-seen order.
 * These add no edge and are never validated — they just track concepts an author intends to write.
 * @param {string} html
 * @returns {string[]}
 */
export function extractTodoRefs(html) {
  return [...new Set(parseRefs(html).filter((r) => r.todo).map((r) => r.id))];
}
