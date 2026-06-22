// @ts-check
/**
 * A tiny seeded pseudo-random generator (mulberry32) — deterministic for a given seed, so a scene
 * can draw "random" values that stay the SAME across every re-run within one run (the main board
 * and each mini-board of the geometry "All steps" view), yet change when the seed is bumped (the
 * Refresh button). Pure + DOM-free, hence unit-testable.
 * @module
 */

/**
 * @typedef {(() => number) & {
 *   int: (lo: number, hi: number) => number,
 *   pick: <T>(arr: readonly T[]) => T,
 * }} Rng
 */

/**
 * Make a seeded RNG. `rng()` returns a float in `[0, 1)`; `rng.int(lo, hi)` an integer in `[lo, hi]`
 * (inclusive); `rng.pick(arr)` a random element. The same `seed` always yields the same sequence.
 * @param {number} seed
 * @returns {Rng}
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = /** @type {Rng} */ (
    () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  );
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}
