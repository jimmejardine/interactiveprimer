/**
 * Levels of knowledge as REAL numbers.
 *
 * A level is usually an integer that roughly equates to a stage of education, but
 * fractional values are allowed so concepts can be squeezed between existing levels.
 * Levels implicitly start at 0 when nothing in a concept's ancestry declares one.
 * @module
 */

import type { Level } from "./types/domain.ts";

/** The implicit base level used when no level is declared anywhere up the chain. */
export const BASE_LEVEL = 0;

/**
 * The higher of two levels. `null` represents "no level"; a real level always beats
 * `null`, and `null` vs `null` stays `null`.
 */
export function maxLevel(a: Level | null, b: Level | null): Level | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/**
 * Format a level for display, at most two decimal places (2 → "2", 2.5 → "2.5").
 */
export function formatLevel(level: Level): string {
  return String(Math.round(level * 100) / 100);
}
