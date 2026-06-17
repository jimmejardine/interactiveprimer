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
 * @typedef {{ el: any, vis: boolean }} StepEl  An element + the visibility the author gave it at
 *   creation (so a deliberately-hidden helper — e.g. a line's auto-endpoint, or an invisible
 *   construction point — is NOT forced visible when its step is revealed).
 * @typedef {{ caption: string, els: StepEl[] }} Waypoint
 */

/**
 * Read an element's intended visibility (JSXGraph stores it on `visProp.visible`); defaults true.
 * @param {any} el
 * @returns {boolean}
 */
function intendedVisible(el) {
  return el?.visProp ? el.visProp.visible !== false : true;
}

/**
 * A waypoint collector over a JSXGraph board. `step(caption, drawFn)` runs `drawFn` immediately and
 * records the elements it created — by diffing `board.objectsList` before/after — together with the
 * caption and each element's intended visibility. Elements created OUTSIDE any `step()`
 * (before/between calls) are "base": never recorded, so they stay as drawn at every step.
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
    const els = board.objectsList.slice(before).map((el) => ({ el, vis: intendedVisible(el) }));
    steps.push({ caption, els });
  };
  return { step, steps };
}

/**
 * Apply the reveal-by-threshold rule: step `i` is revealed iff `i < current`. A revealed element is
 * shown only to its *intended* visibility (so endpoints/helpers an author created hidden stay
 * hidden); a not-yet-revealed step's elements are hidden. The caller calls `board.update()` after.
 * @param {Waypoint[]} steps
 * @param {number} current
 */
export function applyStepVisibility(steps, current) {
  steps.forEach((s, i) => {
    const reveal = i < current;
    for (const { el, vis } of s.els) el.setAttribute?.({ visible: reveal && vis });
  });
}
