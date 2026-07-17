/**
 * Lazy TypeScript → JavaScript transpile via **sucrase**, loaded from a CDN on first use (matches the
 * site's pinned-CDN + cached-promise pattern in src/mathfield.ts / src/compute-engine.ts). Type-stripping
 * only — no type-checking, no bundling. Used by the runnable `<primer-code>` to turn a TS snippet into
 * runnable JS before the QuickJS sandbox executes it.
 * @module
 */

/** Cached module import (re-tried if it fails). */
let pending: Promise<any> | null = null;

function loadSucrase() {
  if (!pending) {
    // @ts-ignore — static specifier; esbuild emits sucrase as its own lazy chunk.
    pending = import("sucrase").catch((e) => {
      pending = null; // allow a retry after a transient failure
      throw e;
    });
  }
  return pending;
}

/**
 * Strip TypeScript types, returning runnable JavaScript. Avoid `const enum` / `namespace` in sources
 * (sucrase compiles per-file; use plain `enum` / ES modules).
 * @param code TypeScript source
 * @returns JavaScript
 */
export async function transpileTs(code: string): Promise<string> {
  const sucrase = await loadSucrase();
  return sucrase.transform(code, { transforms: ["typescript"], disableESTransforms: true }).code;
}
