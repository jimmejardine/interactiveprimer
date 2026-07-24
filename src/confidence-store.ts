/**
 * The single accessor for a concept's confidence + lifetime quiz counters in localStorage.
 *
 * A score is stored under `primer:confidence:<id>` as a JSON
 * **`[stars, first, last, answered, correct]` tuple**, e.g. `[6.67,"2026-05-01","2026-06-18",3,2]`.
 * `first` is when the concept was first rated and `last` when it most recently changed (ISO;
 * `last` may be a full instant). `answered`/`correct` are the LIFETIME quiz counters — every quiz
 * answer anywhere (the lesson's own quiz or the /course-quiz stream) increments them, and
 * quiz-derived stars are the ratio `10 × correct / max(answered, 3)` (min denominator 3, so one
 * lucky answer gives 3.33 stars, never 10; see {@link starsFromCounters}). Stars may therefore be
 * FRACTIONAL (stored to 2 dp); star rows simply fill ⌊stars⌋. Keeping the counters inside this one
 * tuple means save/restore and cloud sync carry them with no new syncing machinery.
 *
 * Reads are backward-compatible: a legacy 3-tuple reads as counters 0/0, and a legacy bare number
 * (`"5"`) as an undated score (which loses every merge tie to a dated value).
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
  /** Lifetime quiz answers attempted for this concept (any quiz, anywhere). */
  answered: number;
  /** Lifetime correct quiz answers (⊆ answered). */
  correct: number;
}

/** Clamp + round a stars value to the stored precision (2 dp, within [0, MAX_STARS]). */
function roundStars(stars: number): number {
  return Math.min(MAX_STARS, Math.max(0, Math.round(stars * 100) / 100));
}

/** A non-negative integer counter, or 0 for anything malformed. */
function toCount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Quiz-derived stars from the lifetime counters: `10 × correct / max(answered, 3)`, clamped and
 * 2-dp rounded. The minimum denominator of 3 stops a single lucky answer from reaching 10 stars —
 * 1/1 → 3.33, 2/2 → 6.67, 3/3 → 10, 2/3 → 6.67. Pure, exported for tests and the course quiz.
 */
export function starsFromCounters(answered: number, correct: number): number {
  const a = toCount(answered);
  const c = Math.min(toCount(correct), a);
  return roundStars((MAX_STARS * c) / Math.max(a, 3));
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
 * Returns null when the value is absent or unparseable. Stars are clamped to [0, MAX_STARS]
 * (fractional kept, 2 dp). A legacy bare number, or a tuple missing dates, yields empty
 * `first`/`last`; a tuple missing counters yields `answered`/`correct` 0.
 */
function parseEntry(raw: string | null): ConfidenceEntry | null {
  if (raw === null) return null;
  let stars;
  let first = "";
  let last = "";
  let answered = 0;
  let correct = 0;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      stars = Number(parsed[0]);
      first = typeof parsed[1] === "string" ? parsed[1] : "";
      last = typeof parsed[2] === "string" ? parsed[2] : first;
      answered = toCount(parsed[3]);
      correct = Math.min(toCount(parsed[4]), answered);
    } else {
      stars = Number(parsed); // legacy bare number, undated
    }
  } catch {
    stars = Number(raw); // not even JSON — tolerate a bare numeric string
  }
  if (!Number.isFinite(stars)) return null;
  return { stars: roundStars(stars), first, last, answered, correct };
}

/**
 * The stored confidence for a concept, or null if never rated.
 */
export function readEntry(id: string): ConfidenceEntry | null {
  // safeGet returns null when localStorage is unavailable, and parseEntry(null) → null.
  return parseEntry(safeGet(CONFIDENCE_PREFIX + id));
}

/**
 * Persist a concept's score as a `[stars, first, last, answered, correct]` tuple. By default
 * `last` is the current instant (millisecond ISO), `first` is preserved from any existing score
 * (or set to today's date on the first rating), and the lifetime quiz COUNTERS are preserved from
 * the existing entry — so a manual star change never erases quiz history. Pass `first`/`last`
 * explicitly (e.g. when restoring a backup or a cloud pull), and `counters` to set both counts
 * verbatim (a restore/pull carrying its own).
 */
export function writeEntry(
  id: string,
  stars: number,
  first?: string,
  last: string = nowISO(),
  counters?: { answered: number; correct: number },
) {
  const existing = readEntry(id);
  const firstDate = first ?? (existing?.first || todayISO());
  const answered = toCount(counters ? counters.answered : existing?.answered);
  const correct = Math.min(toCount(counters ? counters.correct : existing?.correct), answered);
  safeSet(CONFIDENCE_PREFIX + id, JSON.stringify([roundStars(stars), firstDate, last, answered, correct]));
}

/**
 * Record quiz answers for a concept: add `answered`/`correct` to the lifetime counters and set the
 * stars to the counter-derived value ({@link starsFromCounters}). Returns the new entry. This is
 * THE quiz→stars path — both the lesson quiz fold (primer-concept) and the /course-quiz stream go
 * through it. The caller dispatches `confidence-change` (this module stays event-free).
 */
export function recordAnswers(id: string, answered: number, correct: number): ConfidenceEntry {
  const existing = readEntry(id);
  const a = toCount(existing?.answered) + toCount(answered);
  const c = Math.min(toCount(existing?.correct) + toCount(correct), a);
  const stars = starsFromCounters(a, c);
  writeEntry(id, stars, undefined, nowISO(), { answered: a, correct: c });
  return { stars, first: existing?.first || todayISO(), last: nowISO(), answered: a, correct: c };
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
