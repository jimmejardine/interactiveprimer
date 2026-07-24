/**
 * Pure, DOM-free core of the progress model: the conflict-resolution merge, import validation, and
 * the shared constants/typedef. Extracted from src/progress.ts so BOTH the browser (src/progress.ts
 * re-exports everything here) AND the Cloudflare sync Worker (which does the same server-side merge
 * on PUT) share a single source of truth for how two progress snapshots reconcile. This module
 * imports nothing, so it loads cleanly inside a Worker.
 * @module
 */

/** Stars at full mastery — must match src/confidence-store.ts / src/components/primer-concept.ts. */
export const MAX_STARS = 10;

/** Marker + version stamped into an exported file / cloud doc, so a restore can sanity-check it. */
export const FILE_TYPE = "primer-progress";
export const FILE_VERSION = 1;

export interface ProgressEntry {
  id: string;
  stars: number;
  first: string;
  last: string;
  /** Lifetime quiz answers attempted (optional — entries from before the counters era omit it). */
  answered?: number;
  /** Lifetime correct quiz answers (⊆ answered; optional, as above). */
  correct?: number;
}

/**
 * Combine two progress snapshots.
 * - `overwrite` → `incoming` replaces everything (the caller wipes local scores first).
 * - `merge` → union by id; for an id in both, the score (`stars`) comes from whichever side has
 *   the later `last` stamp (an empty stamp is oldest; on a tie, `incoming` wins as the deliberate
 *   import), while the dates span both: `first` = the earliest first-rated date and `last` = the
 *   latest updated stamp of the two. `last` is compared as an opaque string, which stays
 *   chronological whether it is a `YYYY-MM-DD` date or a full millisecond ISO instant (a date-only
 *   value sorts before any same-day instant, so precise timestamps win same-day ties).
 */
export function mergeProgress(
  existing: ProgressEntry[],
  incoming: ProgressEntry[],
  mode: "merge" | "overwrite",
): ProgressEntry[] {
  if (mode === "overwrite") return incoming.slice();
  const byId: Map<string, ProgressEntry> = new Map();
  for (const e of existing) byId.set(e.id, e);
  for (const inc of incoming) {
    const cur = byId.get(inc.id);
    if (!cur) {
      byId.set(inc.id, inc);
      continue;
    }
    const winner = inc.last >= cur.last ? inc : cur; // later `last` wins its stars; tie → incoming
    byId.set(inc.id, {
      id: inc.id,
      stars: winner.stars,
      first: minDate(cur.first, inc.first), // earliest first-rated date across both
      last: maxDate(cur.last, inc.last), // latest updated stamp across both
      // The quiz counters travel with the same winner whose stars won (they're the basis of those
      // stars — summing both sides would double-count shared history).
      answered: winner.answered ?? 0,
      correct: winner.correct ?? 0,
    });
  }
  return [...byId.values()];
}

/**
 * The earliest of two ISO stamps, ignoring empty strings. Returns "" only if both are empty.
 */
export function minDate(a: string, b: string) {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

/**
 * The latest of two ISO stamps, ignoring empty strings. Returns "" only if both are empty.
 */
export function maxDate(a: string, b: string) {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * Validate a parsed import object and return its clean entries, or throw on a bad shape.
 * Tolerates missing dates (→ ""); rejects a wrong type or malformed entries.
 */
export function validateImport(obj: any): ProgressEntry[] {
  if (!obj || typeof obj !== "object" || obj.type !== FILE_TYPE) {
    throw new Error("Not a Primer progress file.");
  }
  if (!Array.isArray(obj.entries)) throw new Error("Progress file has no entries.");
  return obj.entries.map((e: any, i: number) => {
    if (!e || typeof e.id !== "string" || !e.id) {
      throw new Error(`Entry ${i} has no id.`);
    }
    const stars = Number(e.stars);
    if (!Number.isFinite(stars) || stars < 0 || stars > MAX_STARS) {
      throw new Error(`Entry "${e.id}" has an invalid score.`);
    }
    // Counters are optional (older files omit them); malformed values coerce to 0, and `correct`
    // can never exceed `answered`. Stars may be fractional (quiz-derived) — keep 2 dp.
    const answered = Number.isFinite(Number(e.answered)) && Number(e.answered) > 0 ? Math.round(Number(e.answered)) : 0;
    const correct = Math.min(
      Number.isFinite(Number(e.correct)) && Number(e.correct) > 0 ? Math.round(Number(e.correct)) : 0,
      answered,
    );
    return {
      id: e.id,
      stars: Math.round(stars * 100) / 100,
      first: typeof e.first === "string" ? e.first : "",
      last: typeof e.last === "string" ? e.last : "",
      answered,
      correct,
    };
  });
}
