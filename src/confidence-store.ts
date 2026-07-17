/**
 * The single accessor for a concept's self-attested confidence in localStorage.
 *
 * A score is stored under `primer:confidence:<id>` as a JSON **`[stars, first, last]` tuple**,
 * e.g. `[5,"2026-05-01","2026-06-18"]` — `first` is when the concept was first rated and
 * `last` is when the score was most recently changed (both ISO `YYYY-MM-DD`). `last` lets the
 * save/restore feature merge two snapshots by "later date wins". Reads are backward-compatible:
 * a legacy bare number (`"5"`) is treated as an **undated** score (`first`/`last` === ""),
 * which loses every merge tie to a dated value.
 *
 * This is the one place that knows the storage shape; both src/components/primer-concept.ts
 * (the star control) and src/confidence-color.ts (the pathway/ref colouring) go through it.
 * DOM-aware (touches localStorage), hence its own module separate from the pure maths in
 * src/confidence.ts.
 * @module
 */

import { MAX_STARS } from "./progress-core.ts";
import { safeGet, safeSet, safeRemove } from "./storage.ts";

/** Confidence storage key prefix. */
export const CONFIDENCE_PREFIX = "primer:confidence:";

// `MAX_STARS` lives in the shared pure core (src/progress-core.ts); re-export it here so existing
// `import { MAX_STARS } from "./confidence-store.ts"` call-sites keep working unchanged.
export { MAX_STARS };

export interface ConfidenceEntry {
  stars: number;
  first: string;
  last: string;
}

/** Today as an ISO `YYYY-MM-DD` string (the `first`-rated date stamped onto a new score). */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The current instant as a full millisecond ISO string, e.g. `2026-07-07T09:15:03.123Z`. Stamped as
 * a score's `last`, so two edits to the same concept on the same day still order correctly when
 * merging across devices — a date-only `last` sorts before any same-day instant, so the precise one
 * wins the tie. Compared as an opaque string by mergeProgress (src/progress-core.ts).
 */
export function nowISO() {
  return new Date().toISOString();
}

/**
 * Coerce a raw localStorage value (tuple JSON or a legacy bare number) into a clean entry.
 * Returns null when the value is absent or unparseable. Stars are clamped to [0, MAX_STARS].
 * A legacy bare number, or a tuple missing dates, yields empty `first`/`last`.
 */
function parseEntry(raw: string | null): ConfidenceEntry | null {
  if (raw === null) return null;
  let stars;
  let first = "";
  let last = "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      stars = Number(parsed[0]);
      first = typeof parsed[1] === "string" ? parsed[1] : "";
      last = typeof parsed[2] === "string" ? parsed[2] : first;
    } else {
      stars = Number(parsed); // legacy bare number, undated
    }
  } catch {
    stars = Number(raw); // not even JSON — tolerate a bare numeric string
  }
  if (!Number.isFinite(stars)) return null;
  return { stars: Math.min(MAX_STARS, Math.max(0, Math.round(stars))), first, last };
}

/**
 * The stored confidence for a concept, or null if never rated.
 */
export function readEntry(id: string): ConfidenceEntry | null {
  // safeGet returns null when localStorage is unavailable, and parseEntry(null) → null.
  return parseEntry(safeGet(CONFIDENCE_PREFIX + id));
}

/**
 * Persist a concept's score as a `[stars, first, last]` tuple. By default `last` is the current
 * instant (millisecond ISO) and `first` is preserved from any existing score (or set to today's
 * date on the first rating) — so a normal star change keeps the original "first rated" date. Pass
 * `first`/`last` explicitly (e.g. when restoring a backup or a cloud pull) to set both verbatim.
 */
export function writeEntry(id: string, stars: number, first?: string, last: string = nowISO()) {
  const clamped = Math.min(MAX_STARS, Math.max(0, Math.round(stars)));
  const firstDate = first ?? (readEntry(id)?.first || todayISO());
  safeSet(CONFIDENCE_PREFIX + id, JSON.stringify([clamped, firstDate, last]));
}

/**
 * Remove a concept's score.
 */
export function removeEntry(id: string) {
  safeRemove(CONFIDENCE_PREFIX + id);
}

/**
 * Every stored confidence score, as `{ id, stars, date }` entries.
 */
export function allEntries(): Array<{ id: string } & ConfidenceEntry> {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith(CONFIDENCE_PREFIX)) continue;
      const entry = parseEntry(localStorage.getItem(key));
      if (entry) out.push({ id: key.slice(CONFIDENCE_PREFIX.length), ...entry });
    }
  } catch {
    /* localStorage unavailable */
  }
  return out;
}

/** Delete every stored confidence score (used by an "overwrite" restore). */
export function clearAll() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith(CONFIDENCE_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* localStorage unavailable */
  }
}
