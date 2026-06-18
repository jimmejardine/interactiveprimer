// @ts-check
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
 * This is the one place that knows the storage shape; both js/components/primer-concept.js
 * (the star control) and js/confidence-color.js (the pathway/ref colouring) go through it.
 * DOM-aware (touches localStorage), hence its own module separate from the pure maths in
 * js/confidence.js.
 * @module
 */

/** Confidence storage key prefix. */
export const CONFIDENCE_PREFIX = "primer:confidence:";

/** Stars at full mastery — must match js/components/primer-concept.js. */
export const MAX_STARS = 10;

/** @typedef {{ stars: number, first: string, last: string }} ConfidenceEntry */

/** Today as an ISO `YYYY-MM-DD` string (the date stamped onto a score when it's set). */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Coerce a raw localStorage value (tuple JSON or a legacy bare number) into a clean entry.
 * Returns null when the value is absent or unparseable. Stars are clamped to [0, MAX_STARS].
 * A legacy bare number, or a tuple missing dates, yields empty `first`/`last`.
 * @param {string | null} raw
 * @returns {ConfidenceEntry | null}
 */
function parseEntry(raw) {
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
 * @param {string} id
 * @returns {ConfidenceEntry | null}
 */
export function readEntry(id) {
  try {
    return parseEntry(localStorage.getItem(CONFIDENCE_PREFIX + id));
  } catch {
    return null; // localStorage unavailable (private mode, file://)
  }
}

/**
 * Persist a concept's score as a `[stars, first, last]` tuple. By default `last` is today and
 * `first` is preserved from any existing score (or set to today on the first rating) — so a
 * normal star change keeps the original "first rated" date. Pass `first`/`last` explicitly
 * (e.g. when restoring a backup) to set both verbatim.
 * @param {string} id
 * @param {number} stars
 * @param {string} [first]
 * @param {string} [last]
 */
export function writeEntry(id, stars, first, last = todayISO()) {
  const clamped = Math.min(MAX_STARS, Math.max(0, Math.round(stars)));
  const firstDate = first ?? (readEntry(id)?.first || last);
  try {
    localStorage.setItem(CONFIDENCE_PREFIX + id, JSON.stringify([clamped, firstDate, last]));
  } catch {
    /* best-effort persistence */
  }
}

/**
 * Remove a concept's score.
 * @param {string} id
 */
export function removeEntry(id) {
  try {
    localStorage.removeItem(CONFIDENCE_PREFIX + id);
  } catch {
    /* best-effort */
  }
}

/**
 * Every stored confidence score, as `{ id, stars, date }` entries.
 * @returns {Array<{ id: string } & ConfidenceEntry>}
 */
export function allEntries() {
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
