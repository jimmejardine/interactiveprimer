/**
 * Pure helper for the interactive `<primer-chart>` sliders' "anchor" points — interesting
 * values (integer amplitudes, multiples of 90° for phase, …) that a slider snaps onto when
 * dragged near them. Kept free of the DOM so it can be unit-tested; primer-chart.js computes
 * the pixel-derived `threshold` and applies the result.
 * @module
 */

/**
 * Snap a value to the nearest anchor within `threshold`, else leave it unchanged.
 *
 * @param value Current slider value.
 * @param anchors The "interesting" values to snap to.
 * @param threshold Max distance (in value units) at which snapping engages.
 * @returns The nearest anchor if one is within `threshold`, otherwise `value`.
 */
export function snapToAnchor(value: number, anchors: number[] | undefined | null, threshold: number): number {
  if (!Array.isArray(anchors) || anchors.length === 0) return value;
  if (!Number.isFinite(value) || !(threshold >= 0)) return value;
  let best = value;
  let bestDist = Infinity;
  for (const a of anchors) {
    if (!Number.isFinite(a)) continue;
    const dist = Math.abs(value - a);
    // Only anchors within `threshold` snap; strict `<` keeps the first (nearest) anchor on a tie.
    if (dist <= threshold && dist < bestDist) {
      best = a;
      bestDist = dist;
    }
  }
  return best;
}
