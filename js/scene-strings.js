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
 * own. At runtime render.js KEEPS the English block (untagged) and appends the active locale's
 * block tagged `data-locale="<locale>"` — so both can coexist. A scene receives a scene-scoped
 * accessor (see {@link makeSceneStrings}, supplied in the scene toolkit) called as
 * `sceneStrings(key, vars?)`: it resolves the key locale → English → a visible `$$scene.key$$`
 * placeholder, then interpolates any `{name}` placeholders from `vars` — so the English block is
 * the single source of the English words (no inline literal fallback needed).
 * @module
 */

import { parseJsonc } from "./jsonc.js";
import { fillVars } from "./i18n.js";

/**
 * Parse the scene-strings block matched by `selector` into its keyed object. Returns {} when the
 * block is absent or malformed.
 * @param {Document} doc
 * @param {string} selector
 * @returns {Record<string, Record<string, string>>}
 */
function readBlock(doc, selector) {
  const el = doc.querySelector(selector);
  if (!el || !el.textContent) return {};
  try {
    const parsed = parseJsonc(el.textContent);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Read the page's ACTIVE scene-strings block (the locale overlay if present, else the English
 * canonical), keyed by versioned scene name. Returns {} if absent or malformed. Kept for
 * back-compat; scenes should use the {@link makeSceneStrings} accessor passed to the builder.
 * @param {Document} [doc]
 * @returns {Record<string, Record<string, string>>}
 */
export function getSceneStrings(doc = document) {
  const locale = readBlock(doc, "script.scene-strings[data-locale]");
  return Object.keys(locale).length ? locale : readBlock(doc, "script.scene-strings:not([data-locale])");
}

/**
 * Build a scene-scoped strings accessor for `sceneName`. Call it as `sceneStrings(key, vars?)`:
 *   1. the key resolves against the active locale block (`script.scene-strings[data-locale]`),
 *      then the English block (`script.scene-strings:not([data-locale])`), then a
 *      `"$$<scene>.<key>$$"` placeholder (logging an error) when neither defines it;
 *   2. when `vars` is given, `{name}` placeholders in the resolved string are interpolated.
 * Both blocks are read once here; the returned function just looks keys up + fills.
 * @param {string} sceneName Versioned scene name, e.g. "addNumberLine@1".
 * @param {Document} [doc]
 * @returns {(key: string, vars?: Record<string, string | number>) => string}
 */
export function makeSceneStrings(sceneName, doc = document) {
  const locale = readBlock(doc, "script.scene-strings[data-locale]")[sceneName] ?? {};
  const english = readBlock(doc, "script.scene-strings:not([data-locale])")[sceneName] ?? {};
  return (key, vars) => {
    let template;
    if (key in locale) template = locale[key];
    else if (key in english) template = english[key];
    else {
      console.error(`[primer] missing scene string "${sceneName}.${key}"`);
      template = `$$${sceneName}.${key}$$`;
    }
    return vars ? fillVars(template, vars) : template;
  };
}
