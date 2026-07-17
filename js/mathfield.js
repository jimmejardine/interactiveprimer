// @ts-check
/**
 * Lazily load MathLive (mathlive.io) and define its `<math-field>` web component, so a page
 * only pays for it when it actually shows a math input — mirroring how manim-web is imported
 * on demand. MathLive is MIT-licensed; the pinned version lives here (boot.js stays the home
 * for the always-loaded katex/manim pins).
 * @module
 */

// MathLive's glyph fonts are copied to this stable dir by scripts/build.mjs (from node_modules).
const FONTS_DIR = "/dist/assets/mathlive-fonts";

/** @type {Promise<boolean> | null} */
let pending = null;

/**
 * Load MathLive once (cached). Resolves `true` when `<math-field>` is available, `false` if
 * the import fails — callers then fall back to a plain text box.
 * @returns {Promise<boolean>}
 */
export function loadMathLive() {
  if (!pending) {
    // @ts-ignore — static specifier; esbuild emits mathlive as its own lazy chunk.
    pending = import("mathlive")
      .then((/** @type {any} */ mod) => {
        const MFE = mod.MathfieldElement;
        if (MFE) {
          try {
            // Resolve glyph fonts from the build-emitted dir, and silence MathLive's own keypress
            // sounds (the quiz plays its own pass/fail sounds).
            MFE.fontsDirectory = FONTS_DIR;
            MFE.soundsDirectory = null;
          } catch {
            /* best-effort config */
          }
        }
        try {
          // Drop the virtual keyboard's edit toolbar (undo/redo/copy/…) — our keyboards carry
          // their own keys. Sizing/centring is done in css/primer.css.
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
