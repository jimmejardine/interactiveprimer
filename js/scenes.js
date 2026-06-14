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
