// @ts-check
/**
 * Registry of manim-web scenes, keyed by name. Concept pages register a scene
 * (a function that builds/plays an animation) and reference it from a
 * <primer-manim scene="..."> element.
 *
 * A scene receives the host element to draw into and the imported manim-web module
 * namespace, so scene authors write directly against whatever manim-web exposes —
 * this keeps the registry independent of manim-web's exact API.
 * @module
 */

/**
 * @callback SceneBuilder
 * @param {HTMLElement} host       Element to mount the animation into.
 * @param {Record<string, any>} manim  The imported manim-web module namespace.
 * @returns {void | Promise<void>}
 */

/** @type {Map<string, SceneBuilder>} */
const scenes = new Map();

/**
 * Register a named scene. Re-registering a name overwrites it.
 * @param {string} name
 * @param {SceneBuilder} builder
 */
export function registerScene(name, builder) {
  scenes.set(name, builder);
}

/**
 * Look up a scene by name (or undefined if not registered).
 * @param {string} name
 * @returns {SceneBuilder | undefined}
 */
export function getScene(name) {
  return scenes.get(name);
}

/**
 * A chart builder, used by <primer-chart>. Unlike a {@link SceneBuilder} (which plays an
 * animation once), a chart builder sets up its Scene + Axes ONCE and returns an `update`
 * function the component calls — initially, on every control change, and again after a
 * theme change. So the same manim Scene is reused (no WebGL-context churn) and only the
 * plotted curve is re-drawn.
 *
 * `params` is the current control values keyed by name (e.g. `{ A: 2, f: 1, phi: 0 }`);
 * for a static chart (no controls) it is `{}`.
 * @callback ChartBuilder
 * @param {HTMLElement} host       Element to mount the chart into.
 * @param {Record<string, any>} manim  The imported manim-web module namespace.
 * @returns {(params: Record<string, number>) => void}  Re-plot for the given param values.
 */

/** @type {Map<string, ChartBuilder>} */
const charts = new Map();

/**
 * Register a named chart builder. Re-registering a name overwrites it.
 * @param {string} name
 * @param {ChartBuilder} builder
 */
export function registerChart(name, builder) {
  charts.set(name, builder);
}

/**
 * Look up a chart builder by name (or undefined if not registered).
 * @param {string} name
 * @returns {ChartBuilder | undefined}
 */
export function getChart(name) {
  return charts.get(name);
}
