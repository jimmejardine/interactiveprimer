/**
 * Lazy loader for the **QuickJS-WASM** sandbox (`quickjs-emscripten-core` + an inline-WASM singlefile
 * browser variant), from a CDN on first use — the cached-promise pattern used by js/mathfield.js. The
 * singlefile variant embeds the WASM (one request, no separate `.wasm` to resolve), so it fits the
 * no-build/pinned-CDN site. Guest code runs inside the WASM interpreter: no DOM, no network, no `eval`.
 * @module
 */

let pending: Promise<{ QuickJS: any, shouldInterruptAfterDeadline: any } | null> | null = null;

/**
 * Load (once) and return the ready QuickJS module + the deadline-interrupt helper. Resolves to `null`
 * if loading fails (offline / CDN down) — callers should show a friendly message and leave the code
 * block usable.
 */
export function getQuickJs(): Promise<{ QuickJS: any, shouldInterruptAfterDeadline: any } | null> {
  if (!pending) {
    pending = (async () => {
      // Static specifiers so esbuild bundles quickjs-emscripten-core into the core chunk and the
      // wasmfile variant into its own lazy chunk (its .wasm is emitted as a hashed asset by the build).
      const [core, variantMod] = await Promise.all([
        // @ts-ignore — resolved from node_modules by the bundler.
        import("quickjs-emscripten-core"),
        // @ts-ignore — the wasmfile variant (separate .wasm; bundleable, unlike the singlefile variant).
        import("@jitl/quickjs-wasmfile-release-sync"),
      ]);
      const variant = (variantMod.default ?? variantMod) as any;
      const QuickJS = await core.newQuickJSWASMModuleFromVariant(variant);
      return { QuickJS, shouldInterruptAfterDeadline: core.shouldInterruptAfterDeadline };
    })().catch(() => {
      pending = null; // allow a retry
      return null;
    });
  }
  return pending;
}
