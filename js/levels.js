// @ts-check
/**
 * Levels of knowledge as REAL numbers.
 *
 * A level is usually an integer that roughly equates to a stage of education, but
 * fractional values are allowed so concepts can be squeezed between existing levels.
 * Levels implicitly start at 0 when nothing in a concept's ancestry declares one.
 * @module
 */

/** @typedef {import("./types/domain.js").Level} Level */

/** The implicit base level used when no level is declared anywhere up the chain. */
export const BASE_LEVEL = 0;

/**
 * The higher of two levels. `null` represents "no level"; a real level always beats
 * `null`, and `null` vs `null` stays `null`.
 * @param {Level | null} a
 * @param {Level | null} b
 * @returns {Level | null}
 */
export function maxLevel(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * Format a level for display, at most two decimal places (2 → "2", 2.5 → "2.5").
 * @param {Level} level
 * @returns {string}
 */
export function formatLevel(level) {
  return String(Math.round(level * 100) / 100);
}
