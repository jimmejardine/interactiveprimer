/**
 * Build the "freshen-up" list for `scripts/build-graph.js --stale`: the teaching concept pages
 * ordered by how long ago each was last edited (its filesystem mtime), oldest first — so an author
 * can walk the list top-down and refresh the stalest lessons.
 *
 * Pure data-in / rows-out (no filesystem, no I/O): the caller (the build script) owns collecting the
 * per-id mtimes via `statSync`, and this module just filters, sorts and formats. That keeps the
 * ordering/formatting logic unit-testable without touching disk.
 *
 * Scope is **lessons only** — the following non-lesson pages are excluded:
 *  - `course: true` pages (course + topic-hub scaffolding);
 *  - the course-*tree* navigation hubs, which are NOT `course: true` but live under a `courses/`
 *    path segment (e.g. `mathematics/courses/secondary-school/uk/uk`, `physics/courses/courses`);
 *  - the `root` landing page and the `orphans` maintenance node.
 * @module
 */

export type StaleConcept = { id: string, title?: string | null, course?: boolean };
export type StaleRow = { id: string, title: string, date: string };

/** Ids that are structural, not lessons. */
const NON_LESSON_IDS = new Set(["root", "orphans"]);
/** A `courses/` path segment marks a course-tree page (year/grade pages are also `course: true`,
 * but the country/stage/root hubs under `courses/` are not — this catches both). */
const COURSES_SEGMENT = /(^|\/)courses(\/|$)/;

/**
 * Is this a teaching lesson (vs. course/hub/maintenance scaffolding)?
 */
function isLesson(c: StaleConcept): boolean {
  return c.course !== true && !NON_LESSON_IDS.has(c.id) && !COURSES_SEGMENT.test(c.id);
}

/**
 * Format a mtime (ms since epoch) as a `YYYY-MM-DD` day. UTC so it's deterministic across machines
 * — this is a coarse freshness signal, not a precise local timestamp.
 */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Turn the scanned concepts + their mtimes into display rows, oldest-edited first.
 *
 * Keeps lessons only (see {@link isLesson}). A concept absent from `mtimeById` (no stat available)
 * is skipped rather than guessed. Ties on mtime break by id, so the order is stable/reproducible.
 *
 * @param concepts The concepts the build scanned (each carrying id/title/course).
 * @param mtimeById id → last-modified time (ms since epoch, or a Date).
 * @returns `{ id, title, date }` rows, ascending by mtime then id.
 */
export function buildStaleRows(concepts: StaleConcept[], mtimeById: Map<string, number | Date>): StaleRow[] {
  const rows: (StaleRow & { _ms: number })[] = [];
  for (const c of concepts) {
    if (!isLesson(c)) continue;
    const raw = mtimeById.get(c.id);
    if (raw == null) continue;
    const ms = Number(raw); // a Date coerces to ms; a number passes through
    if (!Number.isFinite(ms)) continue;
    rows.push({ id: c.id, title: c.title ?? c.id, date: isoDay(ms), _ms: ms });
  }
  rows.sort((a, b) => a._ms - b._ms || a.id.localeCompare(b.id));
  return rows.map(({ id, title, date }) => ({ id, title, date }));
}

/**
 * Render one row as a display line: `${date}  ${id}  ${title}`. Two-space separators keep it
 * readable and pipeable (the id — field 2 — maps directly to `concepts/<id>.html`).
 */
export function formatStaleRow(row: StaleRow): string {
  return `${row.date}  ${row.id}  ${row.title}`;
}
