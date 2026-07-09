// @ts-check
/**
 * Safe localStorage access: tiny try/catch wrappers shared by every module that persists a
 * setting or score. localStorage can throw — private/incognito modes, `file://` pages, quota
 * exhaustion, or storage disabled by policy — and the Primer treats persistence as strictly
 * best-effort, so each helper swallows the failure: reads report "nothing stored" (`null`) and
 * writes/removals silently no-op. Key iteration (`localStorage.length` / `key(i)`) is NOT
 * covered here — the rare module that scans keys (js/confidence-store.js) guards its own loop.
 * @module
 */

/**
 * Read a stored value, or null when absent OR when localStorage is unavailable.
 * @param {string} key
 * @returns {string | null}
 */
export function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Store a value (best-effort; a storage failure is swallowed).
 * @param {string} key
 * @param {string} value
 */
export function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* best-effort */
  }
}

/**
 * Remove a stored value (best-effort; a storage failure is swallowed).
 * @param {string} key
 */
export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* best-effort */
  }
}
