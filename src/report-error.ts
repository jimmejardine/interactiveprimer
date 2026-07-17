/**
 * Central error reporting for the Primer front-end.
 *
 * Interactive components (`<primer-geometry>`, `<primer-chart>`, `<primer-quiz>`, `<primer-manim>`,
 * `<primer-program>`) catch errors thrown by their scene/quiz builders and show a small message inside the
 * widget — but that failure is otherwise invisible (never logged, never thrown on `window`). `reportError`
 * makes those swallowed errors observable: it logs to the console AND records them on `window.__primerErrors`
 * so an out-of-page harness (see `scripts/smoke-pages.mjs`) can detect a broken page.
 *
 * @module
 */

/**
 * The shared error bucket on `window`, created lazily. Typed loosely because it is an ad-hoc global.
 */
function bucket(): { source: string; message: string; stack?: string }[] {
  const w = globalThis as any;
  return (w.__primerErrors ??= []);
}

/**
 * Record a caught (or global) front-end error: log it, and push it onto `window.__primerErrors`.
 * Best-effort and never throws.
 * @param source  a short label for where it came from, e.g. "primer-geometry:cancelFactor@1"
 */
export function reportError(source: string, err: unknown): void {
  try {
    const error = err instanceof Error ? err : new Error(String(err));
    // Visible in the console during development (these failures were previously silent).
    console.error(`[primer] ${source}:`, error);
    bucket().push({ source, message: error.message, stack: error.stack });
  } catch {
    /* reporting must never itself break a page */
  }
}
