// @ts-check
/**
 * Registry of manim-web scenes, keyed by name. Concept pages register a manim scene
 * (a function that builds/plays an animation) and reference it from a
 * <primer-manim scene="..."> element.
 *
 * A scene builder receives a single `toolkit` object bundling everything it needs — a ready-built
 * `scene` (the manim Scene, already mounted on the stage with the theme backdrop), the imported
 * manim-web namespace, the localized `sceneStrings`, and the `speak` / `cancelSpeech` /
 * `themeColors` helpers — so a scene's only `primer` import is `registerManimScene` and it
 * destructures what it wants. (The toolkit is assembled by `<primer-manim>`; see
 * js/components/primer-manim.js.)
 * @module
 */

/**
 * The single argument passed to a {@link ManimSceneBuilder}. Bundles a ready-built scene, the
 * manim-web namespace, the localized narration strings, and the on-theme/narration helpers.
 * @typedef {object} ManimSceneToolkit
 * @property {any} scene  The manim Scene, already created on the stage (with the theme backdrop)
 *   and captured for pause/resume — just call `scene.play(...)`. No need to `new Scene(...)`.
 * @property {Record<string, any>} manim  The imported manim-web module namespace.
 * @property {(key: string, vars?: Record<string, string | number>) => string} sceneStrings
 *   Scene-scoped localized strings: `sceneStrings(key, vars?)` resolves the key locale → English →
 *   a `"$$scene.key$$"` placeholder, then interpolates any `{name}` placeholders from `vars`
 *   (see js/scene-strings.js).
 * @property {(text: string, opts?: { rate?: number, pitch?: number, lang?: string }) => Promise<void>} speak
 *   Narrate text aloud in the active locale's voice (see js/speech.js).
 * @property {() => void} cancelSpeech  Stop any in-progress/queued narration.
 * @property {(count?: number) => { bg: string, ink: string, line: string, cat: string[] }} themeColors
 *   The live theme palette (see js/theme.js).
 */

/**
 * @callback ManimSceneBuilder
 * @param {ManimSceneToolkit} toolkit  Everything the scene needs, in one object.
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

/**
 * A geometry-scene builder, used by <primer-geometry>. It draws a figure (lines, angles, polygons,
 * Greek-letter text) into a JSXGraph board, declaring ordered "waypoints" via `step(caption, fn)` so the
 * figure can be played forwards/backwards. Like a manim scene it receives a single TOOLKIT object — see
 * js/components/primer-geometry.js for assembly.
 * @callback GeometryBuilder
 * @param {Record<string, any>} toolkit  `{ board, JXG, step, sliders, colors, sceneStrings, parallelMark,
 *   crossing, makeGraph, rng }` — `board` the JSXGraph board, `colors` the resolved `themeColors()`
 *   palette, `step` the waypoint collector, `sliders` live values of the `opts.sliders` group,
 *   `sceneStrings(key, vars?)` the scene-scoped localized strings (js/scene-strings.js), `parallelMark` /
 *   `crossing` the drawing tools, `makeGraph(opts?)` which draws standardized Cartesian axes
 *   (themed lines, arrowheads, tick numbers, "x"/"y" labels) auto-spanning the board — the same axes the
 *   `registerCharts` charts use (js/geometry-tools.js, js/graph-axes.js) — and `rng` a seeded random
 *   (`rng()` → [0,1), `rng.int(lo,hi)`, `rng.pick(arr)`) to use INSTEAD of `Math.random()` for a
 *   `random: true` scene, so the Refresh button gives a fresh, internally-coherent example.
 * @returns {void}
 *
 * @typedef {object} GeometryOptions
 * @property {[number, number, number, number]} [boundingbox]
 * @property {boolean} [keepAspect]
 * @property {string | (() => string)} [title]
 * @property {string} [sliders]  Name of a registered slider group the diagram listens to.
 * @property {number} [start]    Initial revealed-step count (default: all steps revealed).
 * @property {number} [stepMs]   Fade duration for a step reveal in ms (default 450).
 * @property {boolean} [random]  This scene draws random initial conditions (via the toolkit `rng`):
 *   shows a "Refresh" button that re-draws a fresh example.
 *
 * @typedef {object} GeometryEntry
 * @property {GeometryBuilder} builder
 * @property {GeometryOptions} opts
 */

/** @type {Map<string, GeometryEntry>} */
const geometries = new Map();

/**
 * Register a named geometry scene. Re-registering a name overwrites it. Announces the registration
 * (like {@link registerChart}) so a `<primer-geometry>` that connected before this deferred script ran
 * can finish building.
 * @param {string} name
 * @param {GeometryBuilder} builder
 * @param {GeometryOptions} [opts]
 */
export function registerGeometryScene(name, builder, opts = {}) {
  geometries.set(name, { builder, opts });
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("primer:geometry-registered", { detail: { name } }));
  }
}

/**
 * Look up a geometry entry by name (or undefined if not registered).
 * @param {string} name
 * @returns {GeometryEntry | undefined}
 */
export function getGeometryScene(name) {
  return geometries.get(name);
}

/**
 * A quiz builder, used by <primer-quiz name="…">. It returns the question bank (an array of
 * authored questions) for the named quiz. Authored once, in the (language-independent) page JS —
 * so the bank's logic (variable specs, `correct` flags, expressions) lives in ONE place and is
 * never duplicated across translation overlays. The builder receives a single TOOLKIT object; its
 * `sceneStrings(key, vars?)` accessor (scene-strings, scoped to this quiz's name) resolves localized
 * prose locale → English → a `"$$name.key$$"` placeholder. Route translatable prose through
 * `sceneStrings`; keep language-neutral math as inline literals. A question's `prompt`, an option's
 * `text`, and a free-text `answer` may each be a plain value OR a function of the drawn variable
 * bindings (e.g. `answer: (b) => b.a + b.b`). See js/components/primer-quiz.js for assembly.
 *
 * The OPTIONAL first item may be a config object `{ num_questions, preamble }` (a {@link QuizConfig},
 * recognized by lacking both `options` and `answer`): it sets how many questions to draw (default 5)
 * and an instructions sentence shown under the heading. Keeping it in the builder means the count is
 * common to every locale.
 * @callback QuizBuilder
 * @param {{ sceneStrings: (key: string, vars?: Record<string, string | number>) => string }} toolkit
 * @returns {Array<import("./types/domain.js").AuthoredQuestion | import("./types/domain.js").QuizConfig>}  The question bank (optional leading config).
 */

/** @type {Map<string, QuizBuilder>} */
const quizzes = new Map();

/**
 * Register a named quiz builder. Re-registering a name overwrites it. Announces the registration
 * (like {@link registerChart}) so a `<primer-quiz>` that connected before this deferred script ran
 * can finish building.
 * @param {string} name
 * @param {QuizBuilder} builder
 */
export function registerQuiz(name, builder) {
  quizzes.set(name, builder);
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("primer:quiz-registered", { detail: { name } }));
  }
}

/**
 * Look up a quiz builder by name (or undefined if not registered).
 * @param {string} name
 * @returns {QuizBuilder | undefined}
 */
export function getQuiz(name) {
  return quizzes.get(name);
}
