// @ts-check
/**
 * Lazy loader for the **QuickJS-WASM** sandbox (`quickjs-emscripten-core` + an inline-WASM singlefile
 * browser variant), from a CDN on first use — the cached-promise pattern used by js/mathfield.js. The
 * singlefile variant embeds the WASM (one request, no separate `.wasm` to resolve), so it fits the
 * no-build/pinned-CDN site. Guest code runs inside the WASM interpreter: no DOM, no network, no `eval`.
 * @module
 */

import { importUrl } from "./import-url.js";

const CORE_URL = "/3rdparty/quickjs/core.mjs";
const VARIANT_URL = "/3rdparty/quickjs/singlefile/index.mjs";

/** @type {Promise<{ QuickJS: any, shouldInterruptAfterDeadline: any } | null> | null} */
let pending = null;

/**
 * Load (once) and return the ready QuickJS module + the deadline-interrupt helper. Resolves to `null`
 * if loading fails (offline / CDN down) — callers should show a friendly message and leave the code
 * block usable.
 * @returns {Promise<{ QuickJS: any, shouldInterruptAfterDeadline: any } | null>}
 */
export function getQuickJs() {
  if (!pending) {
    pending = (async () => {
      const [core, variantMod] = await Promise.all([importUrl(`${CORE_URL}`), importUrl(`${VARIANT_URL}`)]);
      const variant = variantMod.default ?? variantMod;
      const QuickJS = await core.newQuickJSWASMModuleFromVariant(variant);
      return { QuickJS, shouldInterruptAfterDeadline: core.shouldInterruptAfterDeadline };
    })().catch(() => {
      pending = null; // allow a retry
      return null;
    });
  }
  return pending;
}
