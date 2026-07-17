/**
 * Per-page localized strings — the language-specific words a widget speaks or renders, kept OUT
 * of the (language-independent) logic so the SAME JS can run in any language. Used by both manim
 * scenes (narration) and charts (title + slider labels). Authored as an inline JSON block, keyed
 * by a namespace (a versioned scene name, or a chart family name):
 *
 *   <script type="application/json" class="scene-strings">
 *     { "addNumberLine@1": { "start": "Let's start at {a}, and add {b}." },
 *       "sinLab": { "amplitude": "Amplitude (A)" } }
 *   </script>
 *
 * The English canonical page carries the English strings; a translation overlay carries its
 * own. At runtime render.js KEEPS the English block (untagged) and appends the active locale's
 * block tagged `data-locale="<locale>"` — so both can coexist. {@link makeStrings} builds a
 * namespace-scoped accessor called as `strings(key, vars?)`: it resolves the key locale →
 * English → a visible `$$ns.key$$` placeholder, then interpolates any `{name}` placeholders from
 * `vars` — so the English block is the single source of the English words (no inline literal
 * fallback needed). It reads the blocks at CALL time, so a chart that creates its accessor at
 * registration (before render.js applies the overlay) still resolves the active locale when its
 * labels render. Scenes get `makeStrings(sceneName)` in their toolkit as `sceneStrings`.
 * @module
 */

import { parseJsonc } from "./jsonc.ts";
import { fillVars } from "./i18n.ts";

/**
 * Parse ALL scene-strings blocks matched by `selector` into one keyed object, merged by namespace.
 * A page may carry several blocks (e.g. quiz strings kept separate from scene/chart strings); their
 * top-level namespaces are combined and, where two blocks share a namespace, its keys are merged
 * (a later block wins per-key). Malformed or empty blocks are skipped. Returns {} when none match.
 */
function readBlock(doc: Document, selector: string): Record<string, Record<string, string>> {
  const merged: Record<string, Record<string, string>> = {};
  for (const el of doc.querySelectorAll(selector)) {
    if (!el.textContent) continue;
    let parsed;
    try {
      parsed = parseJsonc(el.textContent);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    for (const [ns, kv] of Object.entries(parsed)) {
      if (kv && typeof kv === "object") merged[ns] = { ...merged[ns], ...kv };
    }
  }
  return merged;
}

/**
 * Read the page's ACTIVE scene-strings block (the locale overlay if present, else the English
 * canonical), keyed by namespace. Returns {} if absent or malformed. Kept for back-compat;
 * scenes/charts should use the {@link makeStrings} accessor instead.
 */
export function getSceneStrings(doc: Document = document): Record<string, Record<string, string>> {
  const locale = readBlock(doc, "script.scene-strings[data-locale]");
  return Object.keys(locale).length ? locale : readBlock(doc, "script.scene-strings:not([data-locale])");
}

/**
 * Build a namespace-scoped strings accessor. Call it as `strings(key, vars?)`:
 *   1. the key resolves against the active locale block (`script.scene-strings[data-locale]`),
 *      then the English block (`script.scene-strings:not([data-locale])`), then a
 *      `"$$<ns>.<key>$$"` placeholder (logging an error) when neither defines it;
 *   2. when `vars` is given, `{name}` placeholders in the resolved string are interpolated.
 * The blocks are read at CALL time (not cached at creation), so an accessor created before the
 * translation overlay is applied — e.g. a chart's, built at registration — still resolves the
 * active locale once its labels actually render.
 * @param namespace Strings namespace, e.g. a scene name "addNumberLine@1" or "sinLab".
 */
export function makeStrings(
  namespace: string,
  doc: Document = document,
): (key: string, vars?: Record<string, string | number>) => string {
  return (key, vars) => {
    const locale = readBlock(doc, "script.scene-strings[data-locale]")[namespace] ?? {};
    const english = readBlock(doc, "script.scene-strings:not([data-locale])")[namespace] ?? {};
    let template;
    if (key in locale) template = locale[key];
    else if (key in english) template = english[key];
    else {
      console.error(`[primer] missing scene string "${namespace}.${key}"`);
      template = `$$${namespace}.${key}$$`;
    }
    return vars ? fillVars(template, vars) : template;
  };
}
