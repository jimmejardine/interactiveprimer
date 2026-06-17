// @ts-check
/**
 * Pure-ish helpers for the `<primer-geometry>` waypoint timeline.
 *
 * The timeline model is **build-all, reveal-by-threshold**: the geometry builder creates every
 * element up front, and each `step(caption, drawFn)` tags the elements that step created. The
 * timeline state is one integer `current` (= number of revealed steps, 0…stepCount); a step `i` is
 * visible iff `i < current`. Stepping forward/back/jumping is then just changing `current` and
 * re-applying visibility — idempotent, no undo bookkeeping.
 *
 * These helpers are DOM-free (they only call `el.setAttribute`, easily mocked) so they unit-test.
 * @module
 */

/**
 * Clamp a step index to the valid range [0, stepCount].
 * @param {number} n
 * @param {number} stepCount
 * @returns {number}
 */
export function clampStep(n, stepCount) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(stepCount, Math.round(n)));
}

/**
 * @typedef {{ caption: string, els: any[] }} Waypoint
 */

/**
 * A waypoint collector over a JSXGraph board. `step(caption, drawFn)` runs `drawFn` immediately and
 * records the elements it created — by diffing `board.objectsList` before/after — together with the
 * caption. Elements created OUTSIDE any `step()` (before/between calls) are "base": never recorded,
 * so they stay visible at every step.
 * @param {{ objectsList: any[] }} board
 * @returns {{ step: (caption: string, drawFn: () => void) => void, steps: Waypoint[] }}
 */
export function createStepCollector(board) {
  /** @type {Waypoint[]} */
  const steps = [];
  /** @param {string} caption @param {() => void} drawFn */
  const step = (caption, drawFn) => {
    const before = board.objectsList.length;
    drawFn();
    const els = board.objectsList.slice(before);
    steps.push({ caption, els });
  };
  return { step, steps };
}

/**
 * Apply the reveal-by-threshold rule: step `i` is visible iff `i < current`. Toggles each recorded
 * element's `visible` attribute (JSXGraph hides the element and its label together). The caller calls
 * `board.update()` afterwards. Base elements are untouched (always visible).
 * @param {Waypoint[]} steps
 * @param {number} current
 */
export function applyStepVisibility(steps, current) {
  steps.forEach((s, i) => {
    const visible = i < current;
    for (const el of s.els) el.setAttribute?.({ visible });
  });
}
