// @ts-check
/**
 * Lazy TypeScript → JavaScript transpile via **sucrase**, loaded from a CDN on first use (matches the
 * site's pinned-CDN + cached-promise pattern in js/mathfield.js / js/compute-engine.js). Type-stripping
 * only — no type-checking, no bundling. Used by the runnable `<primer-code>` to turn a TS snippet into
 * runnable JS before the QuickJS sandbox executes it.
 * @module
 */

const SUCRASE_URL = "/3rdparty/sucrase/sucrase.mjs";

/** @type {Promise<any> | null} Cached module import (re-tried if it fails). */
let pending = null;

function loadSucrase() {
  if (!pending) {
    // @ts-ignore — runtime URL import; tsc can't resolve a CDN specifier
    pending = import(/* @vite-ignore */ `${SUCRASE_URL}`).catch((e) => {
      pending = null; // allow a retry after a transient failure
      throw e;
    });
  }
  return pending;
}

/**
 * Strip TypeScript types, returning runnable JavaScript. Avoid `const enum` / `namespace` in sources
 * (sucrase compiles per-file; use plain `enum` / ES modules).
 * @param {string} code TypeScript source
 * @returns {Promise<string>} JavaScript
 */
export async function transpileTs(code) {
  const sucrase = await loadSucrase();
  return sucrase.transform(code, { transforms: ["typescript"], disableESTransforms: true }).code;
}
