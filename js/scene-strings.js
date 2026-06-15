// @ts-check
/**
 * Per-page scene narration strings — the language-specific words a manim scene speaks or
 * renders, kept OUT of the (language-independent) scene logic so the SAME scene JS can run
 * in any language. Authored as an inline JSON block, keyed by versioned scene name:
 *
 *   <script type="application/json" class="scene-strings">
 *     { "addNumberLine@1": { "start": "Let's start at {a}, and add {b}.", "equation": "{a} + {b} = {sum}" } }
 *   </script>
 *
 * The English canonical page carries the English strings; a translation overlay carries its
 * own. `getSceneStrings()` reads the block from the CURRENT document, so when render.js swaps
 * a translated overlay's content in, the scene reads the translated words. A scene should
 * always pass a sensible English fallback to `fmt(...)` in case the block is absent.
 * @module
 */

/**
 * Read the page's scene-strings block, keyed by versioned scene name. Returns {} if the
 * block is absent or malformed (so a scene falls back to its inline defaults).
 * @param {Document} [doc]
 * @returns {Record<string, Record<string, string>>}
 */
export function getSceneStrings(doc = document) {
  const el = doc.querySelector("script.scene-strings");
  if (!el || !el.textContent) return {};
  try {
    const parsed = JSON.parse(el.textContent);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Interpolate `{name}` placeholders in a template from `vars` (leaves unknown ones intact).
 * @param {string} template
 * @param {Record<string, string | number>} vars
 * @returns {string}
 */
export function fmt(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
