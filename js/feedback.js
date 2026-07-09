// @ts-check
/**
 * Lightweight per-page feedback: a "this page needs attention" flag that fires a GoatCounter
 * **event** (loaded site-wide by js/analytics.js in production). The event's `path` carries the
 * concept id, so the GoatCounter dashboard lists one row per page sorted by count — a backend-free
 * way to see which lessons need work. A localStorage gate limits a browser to one flag per page
 * per day, so the count stays meaningful rather than spammable.
 * @module
 */

import { todayISO } from "./confidence-store.js";
import { safeGet, safeSet } from "./storage.js";

/** localStorage key prefix for the per-page "last flagged" date. */
export const FEEDBACK_PREFIX = "primer:feedback:";

/**
 * The GoatCounter `count()` payload for flagging a concept as needing attention. The id rides in
 * the event `path` (`needs-attention/<id>`) so each page is its own dashboard row.
 * @param {string} id     Concept id (full path under concepts/).
 * @param {string} [title]  Human title for the event (falls back to the id).
 * @returns {{ path: string, title: string, event: true }}
 */
export function attentionEvent(id, title) {
  return { path: `needs-attention/${id}`, title: `Needs attention: ${title || id}`, event: true };
}

/**
 * Has this browser already flagged `id` today? (So the button stays disabled until tomorrow.)
 * @param {string} id
 * @returns {boolean}
 */
export function flaggedToday(id) {
  // safeGet returns null when localStorage is unavailable — never equal to a date, so false.
  return safeGet(FEEDBACK_PREFIX + id) === todayISO();
}

/**
 * Record that this browser flagged `id` today.
 * @param {string} id
 */
export function markFlagged(id) {
  safeSet(FEEDBACK_PREFIX + id, todayISO());
}
