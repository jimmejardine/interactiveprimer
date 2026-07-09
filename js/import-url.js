// @ts-check
/**
 * A single typed wrapper around a dynamic `import()` of a runtime URL specifier (a vendored path like
 * `/3rdparty/…`). tsc can't resolve such specifiers, so the one `@ts-ignore` lives here instead of
 * being re-stamped in every lazy-loader (quickjs, transpile, mathfield, compute-engine, …).
 * @param {string} url
 * @returns {Promise<any>}
 */
export function importUrl(url) {
  // @ts-ignore — runtime URL specifier; tsc can't follow it, the browser/import-map can.
  return import(/* @vite-ignore */ url);
}
