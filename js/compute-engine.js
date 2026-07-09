// @ts-check
/**
 * Lazily load the CortexJS Compute Engine (mathlive.io/compute-engine) from a CDN, so a page
 * only pays for it when it actually grades a symbolic math answer — mirroring loadMathLive().
 * The pinned version lives here. Used by the quiz to grade free-text math answers by
 * algebraic equivalence (see js/grade-math.js); when it can't load, grading falls back to the
 * simple comparator in js/poly.js.
 * @module
 */

import { importUrl } from "./import-url.js";

// Compute Engine 0.59.0 — vendored under /3rdparty/compute-engine (see scripts/vendor.mjs).
const URL = "/3rdparty/compute-engine/compute-engine.mjs";

/** @type {Promise<any> | null} */
let pending = null;

/**
 * Load the Compute Engine once (cached). Resolves a ready `ComputeEngine` instance, or `null`
 * if the import fails — callers then fall back to the simple comparator.
 * @returns {Promise<any>}
 */
export function loadComputeEngine() {
  if (!pending) {
    // Absolute CDN URL — tsc can't follow it (like loadMathLive / the manim-web import).
    pending = importUrl(`${URL}`)
      .then((mod) => (mod.ComputeEngine ? new mod.ComputeEngine() : null))
      .catch(() => null);
  }
  return pending;
}
