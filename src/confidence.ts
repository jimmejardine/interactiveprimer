/**
 * Confidence-rating maths — pure, DOM-free, so it's unit-testable. Used by
 * js/components/primer-concept.js to fold a quiz result into the star rating.
 * @module
 */

/**
 * Combine the current star rating with a quiz result. The test fraction (0–1) is scaled to
 * the star range and then **averaged** with the current rating — except when there is no
 * rating yet (current is 0), in which case the test result is used on its own. The result is
 * rounded to a whole number of stars and clamped to [0, max].
 * @param current   Current star rating (0 = none/unrated).
 * @param fraction  Fraction of the test answered correctly, 0–1.
 * @param max       Maximum stars (e.g. 10).
 */
export function combineRating(current: number, fraction: number, max: number): number {
  const pct = Math.max(0, Math.min(1, fraction)) * max;
  const next = current > 0 ? (current + pct) / 2 : pct;
  return Math.max(0, Math.min(max, Math.round(next)));
}
