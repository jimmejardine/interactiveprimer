// @ts-check
/**
 * Registry of manim-web scenes, keyed by name. Concept pages register a manim scene
 * (a function that builds/plays an animation) and reference it from a
 * <primer-manim scene="..."> element.
 *
 * A scene receives the host element to draw into, the imported manim-web module namespace, and a
 * scene-scoped `sceneStrings` accessor (the localized narration words), so scene authors write
 * directly against whatever manim-web exposes — this keeps the registry independent of manim-web's
 * exact API.
 * @module
 */

/**
 * @callback ManimSceneBuilder
 * @param {HTMLElement} host       Element to mount the animation into.
 * @param {Record<string, any>} manim  The imported manim-web module namespace.
 * @param {Record<string, string>} sceneStrings  Scene-scoped localized strings: reading a key
 *   resolves locale → English → a `"$$scene.key$$"` placeholder (see js/scene-strings.js).
 * @returns {void | Promise<void>}
 */

/** @type {Map<string, ManimSceneBuilder>} */
const scenes = new Map();

/**
 * Register a named manim scene. Re-registering a name overwrites it.
 * @param {string} name
 * @param {ManimSceneBuilder} builder
 */
export function registerManimScene(name, builder) {
  scenes.set(name, builder);
}

/**
 * Look up a manim scene by name (or undefined if not registered).
 * @param {string} name
 * @returns {ManimSceneBuilder | undefined}
 */
export function getManimScene(name) {
  return scenes.get(name);
}

/**
 * A chart builder, used by <primer-chart>. Unlike a {@link SceneBuilder} (which plays an
 * animation once), a chart builder sets up its JSXGraph board ONCE (via `JXG.JSXGraph.initBoard`)
 * and returns an `update` function the component calls — initially, on every control change, and
 * again after a theme change. The board is SVG, so re-plotting is cheap and there is no
 * WebGL-context limit: a common pattern is to create the curve once over a closure of the current
 * values, then `board.update()` in the returned function.
 *
 * `params` is the current control values keyed by name (e.g. `{ A: 2, f: 1, phi: 0 }`);
 * for a static chart (no controls) it is `{}`.
 * @callback ChartBuilder
 * @param {HTMLElement} host       Element to mount the chart (board) into.
 * @param {Record<string, any>} JXG  The imported JSXGraph namespace.
 * @returns {(params: Record<string, number>) => void}  Re-plot for the given param values.
 */

/** @type {Map<string, ChartBuilder>} */
const charts = new Map();

/**
 * Register a named chart builder. Re-registering a name overwrites it.
 *
 * A page's inline `registerChart(...)` (a deferred module script) can run AFTER a
 * `<primer-chart>` element has already connected and looked the name up — render.js may
 * start building the page the moment parsing finishes, before that deferred script executes.
 * So we announce each registration; <primer-chart> waits for this when its scene is missing.
 * @param {string} name
 * @param {ChartBuilder} builder
 */
export function registerChart(name, builder) {
  charts.set(name, builder);
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("primer:chart-registered", { detail: { name } }));
  }
}

/**
 * Look up a chart builder by name (or undefined if not registered).
 * @param {string} name
 * @returns {ChartBuilder | undefined}
 */
export function getChart(name) {
  return charts.get(name);
}
