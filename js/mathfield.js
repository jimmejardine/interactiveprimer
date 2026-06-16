// @ts-check
/**
 * Lazily load MathLive (mathlive.io) and define its `<math-field>` web component, so a page
 * only pays for it when it actually shows a math input — mirroring how manim-web is imported
 * on demand. MathLive is MIT-licensed; the pinned version lives here (boot.js stays the home
 * for the always-loaded katex/manim pins).
 * @module
 */

const VERSION = "0.110.0";
const BASE = `https://cdn.jsdelivr.net/npm/mathlive@${VERSION}`;

/** @type {Promise<boolean> | null} */
let pending = null;

/**
 * Load MathLive once (cached). Resolves `true` when `<math-field>` is available, `false` if
 * the import fails — callers then fall back to a plain text box.
 * @returns {Promise<boolean>}
 */
export function loadMathLive() {
  if (!pending) {
    // Absolute CDN URL — tsc can't follow it (like the manim-web dynamic import in boot.js).
    // @ts-ignore
    pending = import(`${BASE}/mathlive.min.mjs`)
      .then((mod) => {
        const MFE = mod.MathfieldElement;
        if (MFE) {
          try {
            // Resolve glyph fonts from the CDN, and silence MathLive's own keypress sounds
            // (the quiz plays its own pass/fail sounds).
            MFE.fontsDirectory = `${BASE}/fonts`;
            MFE.soundsDirectory = null;
          } catch {
            /* best-effort config */
          }
        }
        try {
          // Drop the virtual keyboard's edit toolbar (undo/redo/copy/…) — our custom keyboards
          // carry their own backspace + tab keys, so the toolbar is just clutter.
          if (mod.mathVirtualKeyboard) mod.mathVirtualKeyboard.editToolbar = "none";
        } catch {
          /* best-effort config */
        }
        return typeof customElements !== "undefined" && !!customElements.get("math-field");
      })
      .catch(() => false);
  }
  return pending;
}
