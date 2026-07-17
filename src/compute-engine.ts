/**
 * Lazily load the CortexJS Compute Engine (mathlive.io/compute-engine) from a CDN, so a page
 * only pays for it when it actually grades a symbolic math answer — mirroring loadMathLive().
 * The pinned version lives here. Used by the quiz to grade free-text math answers by
 * algebraic equivalence (see src/grade-math.ts); when it can't load, grading falls back to the
 * simple comparator in src/poly.ts.
 * @module
 */

let pending: Promise<any> | null = null;

/**
 * Load the Compute Engine once (cached). Resolves a ready `ComputeEngine` instance, or `null`
 * if the import fails — callers then fall back to the simple comparator.
 */
export function loadComputeEngine(): Promise<any> {
  if (!pending) {
    // @ts-ignore — static specifier; esbuild emits compute-engine as its own lazy chunk.
    pending = import("@cortex-js/compute-engine")
      .then((mod) => (mod.ComputeEngine ? new mod.ComputeEngine() : null))
      .catch(() => null);
  }
  return pending;
}
