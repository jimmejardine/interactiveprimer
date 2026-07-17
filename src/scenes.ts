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
 *
 * The other registries here (charts, 3D charts, geometry scenes/problems, programs, quizzes) follow
 * the same register/get shape, built by the private {@link makeRegistry} factory. Each of those
 * announces a registration via a `primer:<kind>-registered` CustomEvent (so a component that
 * connected before the page's deferred module script ran can finish building); the manim registry
 * deliberately does not — a manim scene is only built on click, so no announce is needed.
 * @module
 */

import type { AuthoredQuestion, QuizConfig } from "./types/domain.ts";
import type { Rng } from "./rng.ts";

/**
 * A name→value registry: `register` stores (overwriting any same-named entry) and, when the
 * registry has an announce event, dispatches it on `document` with `detail: { name }`; `get`
 * looks a value up by name (undefined if not registered).
 */
export type Registry<T> = { register: (name: string, value: T) => void; get: (name: string) => T | undefined };

/**
 * Build a registry. Pass the `primer:<kind>-registered` event name to announce each registration
 * on `document` (guarded for non-DOM environments, e.g. unit tests), or null for a silent
 * registry (manim). Cast the result to `Registry<T>` at the call site to type the entries.
 */
function makeRegistry(eventName: string | null): Registry<any> {
  const map = new Map();
  return {
    register(name, value) {
      map.set(name, value);
      if (eventName && typeof document !== "undefined") {
        document.dispatchEvent(new CustomEvent(eventName, { detail: { name } }));
      }
    },
    get(name) {
      return map.get(name);
    },
  };
}

/**
 * The single argument passed to a {@link ManimSceneBuilder}. Bundles a ready-built scene, the
 * manim-web namespace, the localized narration strings, and the on-theme/narration helpers.
 */
export interface ManimSceneToolkit {
  /**
   * The manim Scene, already created on the stage (with the theme backdrop)
   * and captured for pause/resume — just call `scene.play(...)`. No need to `new Scene(...)`.
   */
  scene: any;
  /** The imported manim-web module namespace. */
  manim: Record<string, any>;
  /**
   * Scene-scoped localized strings: `sceneStrings(key, vars?)` resolves the key locale → English →
   * a `"$$scene.key$$"` placeholder, then interpolates any `{name}` placeholders from `vars`
   * (see js/scene-strings.js).
   */
  sceneStrings: (key: string, vars?: Record<string, string | number>) => string;
  /** Narrate text aloud in the active locale's voice (see js/speech.js). */
  speak: (text: string, opts?: { rate?: number; pitch?: number; lang?: string }) => Promise<void>;
  /** Stop any in-progress/queued narration. */
  cancelSpeech: () => void;
  /** The live theme palette (see js/theme.js). */
  themeColors: (count?: number) => { bg: string; ink: string; line: string; cat: string[] };
}

/**
 * @param toolkit  Everything the scene needs, in one object.
 */
export type ManimSceneBuilder = (toolkit: ManimSceneToolkit) => void | Promise<void>;

const scenes: Registry<ManimSceneBuilder> = makeRegistry(null); // no announce — manim scenes build on click

/**
 * Register a named manim scene. Re-registering a name overwrites it.
 */
export function registerManimScene(name: string, builder: ManimSceneBuilder) {
  scenes.register(name, builder);
}

/**
 * Look up a manim scene by name (or undefined if not registered).
 */
export function getManimScene(name: string): ManimSceneBuilder | undefined {
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
 * @param host       Element to mount the chart (board) into.
 * @param JXG  The imported JSXGraph namespace.
 * @returns Re-plot for the given param values.
 */
export type ChartBuilder = (host: HTMLElement, JXG: Record<string, any>) => (params: Record<string, number>) => void;

const charts: Registry<ChartBuilder> = makeRegistry("primer:chart-registered");

/**
 * Register a named chart builder. Re-registering a name overwrites it.
 *
 * A page's inline `registerChart(...)` (a deferred module script) can run AFTER a
 * `<primer-chart>` element has already connected and looked the name up — render.js may
 * start building the page the moment parsing finishes, before that deferred script executes.
 * So we announce each registration; <primer-chart> waits for this when its scene is missing.
 */
export function registerChart(name: string, builder: ChartBuilder) {
  charts.register(name, builder);
}

/**
 * Look up a chart builder by name (or undefined if not registered).
 */
export function getChart(name: string): ChartBuilder | undefined {
  return charts.get(name);
}

/**
 * A 3D-chart builder, used by <primer-chart-3d>. It draws into a JSXGraph **View3D** (a 3D scene
 * projected to SVG) that the component creates and themes from `themeColors()`. Unlike a 2D
 * {@link ChartBuilder} it does NOT return an update — like a geometry scene it reads live slider
 * values in *functional coordinates* (e.g. `() => sliders.x`) and the component calls
 * `board.update()` whenever the sliders change. The toolkit is `{ view, JXG, board, colors,
 * sliders }`: `view` the themed View3D (author calls `view.create('point3d' | 'line3d' | 'curve3d' |
 * 'functiongraph3d' | 'scatter3d', …)`), `colors` the resolved palette, `board` the underlying 2D
 * board, `sliders` the live values of the `opts.sliders` group. See js/components/primer-chart-3d.js.
 */
export type Chart3dBuilder = (toolkit: {
  view: any;
  JXG: Record<string, any>;
  board: any;
  colors: { bg: string; ink: string; line: string; cat: string[] };
  sliders: Record<string, number>;
}) => void;

export interface Chart3dOptions {
  /**
   * Extent
   * `[[xmin,xmax],[ymin,ymax],[zmin,zmax]]` (default all `[-5,5]`).
   */
  bounds?: [[number, number], [number, number], [number, number]];
  /** X-axis label. */
  xName?: string;
  /** Y-axis label. */
  yName?: string;
  /** Z-axis label. */
  zName?: string;
  title?: string | (() => string);
  /** Name of a registered slider group the view listens to. */
  sliders?: string;
  /** Initial azimuth (degrees). */
  az?: number;
  /** Initial elevation (degrees). */
  el?: number;
}

export interface Chart3dEntry {
  builder: Chart3dBuilder;
  opts: Chart3dOptions;
}

const charts3d: Registry<Chart3dEntry> = makeRegistry("primer:chart3d-registered");

/**
 * Register a named 3D chart. Re-registering a name overwrites it. Announces the registration (like
 * {@link registerChart}) so a `<primer-chart-3d>` that connected before this deferred script ran can
 * finish building.
 */
export function register3dChart(name: string, builder: Chart3dBuilder, opts: Chart3dOptions = {}) {
  charts3d.register(name, { builder, opts });
}

/**
 * Look up a 3D chart entry by name (or undefined if not registered).
 */
export function get3dChart(name: string): Chart3dEntry | undefined {
  return charts3d.get(name);
}

/**
 * A geometry-scene builder, used by <primer-geometry>. It draws a figure (lines, angles, polygons,
 * Greek-letter text) into a JSXGraph board, declaring ordered "waypoints" via `step(caption, fn)` so the
 * figure can be played forwards/backwards. Like a manim scene it receives a single TOOLKIT object — see
 * js/components/primer-geometry.js for assembly.
 * @param toolkit  `{ board, JXG, step, sliders, colors, sceneStrings, parallelMark,
 *   crossing, makeGraph, tickMark, angleMark, rightAngle, extend, label, rng }` — the drawing tools
 *   (js/geometry-tools.js): `parallelMark`/`crossing` (parallel + crossing-angle marks), `tickMark`
 *   (equal-length side hatches), `angleMark` (equal-angle arcs + label), `rightAngle` (the square),
 *   `extend` (an auxiliary/extension line), `label` (themed given/unknown text). `board` the JSXGraph
 *   board, `colors` the resolved `themeColors()`
 *   palette, `step` the waypoint collector, `sliders` live values of the `opts.sliders` group,
 *   `sceneStrings(key, vars?)` the scene-scoped localized strings (js/scene-strings.js), `parallelMark` /
 *   `crossing` the drawing tools, `makeGraph(opts?)` which draws standardized Cartesian axes
 *   (themed lines, arrowheads, tick numbers, "x"/"y" labels) auto-spanning the board — the same axes the
 *   `registerCharts` charts use (js/geometry-tools.js, js/graph-axes.js) — and `rng` a seeded random
 *   (`rng()` → [0,1), `rng.int(lo,hi)`, `rng.pick(arr)`) to use INSTEAD of `Math.random()` for a
 *   `random: true` scene, so the Refresh button gives a fresh, internally-coherent example.
 */
export type GeometryBuilder = (toolkit: Record<string, any>) => void;

export interface GeometryOptions {
  boundingbox?: [number, number, number, number];
  keepAspect?: boolean;
  title?: string | (() => string);
  /** Name of a registered slider group the diagram listens to. */
  sliders?: string;
  /**
   * Initial revealed-step count. A multi-step scene is "finished-frame-first"
   * by DEFAULT (opens fully revealed with a big Play button to replay), so the default opening is
   * `steps.length`; pass an explicit POSITIVE `start` to pin a specific frame, or use `stepThrough` to
   * open collapsed at the first step.
   */
  start?: number;
  /** Fade duration for a step reveal in ms (default 450). */
  stepMs?: number;
  /**
   * This scene draws random initial conditions (via the toolkit `rng`):
   * shows a "Refresh" button that re-draws a fresh example.
   */
  random?: boolean;
  /**
   * Opt OUT of the finished-frame-first default: open collapsed at the
   * first step and play through forward (no big-play overlay). For a genuine discover-it-yourself
   * exercise where revealing the final frame on load would spoil it.
   */
  stepThrough?: boolean;
}

export interface GeometryEntry {
  builder: GeometryBuilder;
  opts: GeometryOptions;
}

const geometries: Registry<GeometryEntry> = makeRegistry("primer:geometry-registered");

/**
 * Register a named geometry scene. Re-registering a name overwrites it. Announces the registration
 * (like {@link registerChart}) so a `<primer-geometry>` that connected before this deferred script ran
 * can finish building.
 */
export function registerGeometryScene(name: string, builder: GeometryBuilder, opts: GeometryOptions = {}) {
  geometries.register(name, { builder, opts });
}

/**
 * Look up a geometry entry by name (or undefined if not registered).
 */
export function getGeometryScene(name: string): GeometryEntry | undefined {
  return geometries.get(name);
}

/**
 * A geometry-PROBLEM config, used by `<primer-geometry-problem name="…">` — the interactive figure
 * where the learner fills quantities in **on the diagram** (boxes sit on the angles/sides). Two sources:
 *
 *  - **`generate`** (the theorem engine, js/geometry-engine/*): picks a scaffold, gates the theorem pool
 *    by the page's prerequisite DAG, and synthesises a fresh angle chase + ordered solution chain each
 *    Refresh; the toolbar offers construction tools and Check walks the chain.
 *  - **`authored`**: YOU draw the figure and declare the fill-in blanks. The `build(toolkit)` runs each
 *    Refresh (with a fresh seeded `rng`, so it can randomise) and returns `{ blanks, goal }`. Each blank
 *    `{ pos:[x,y], answer:number, kind?:"angle"|"length", target?:boolean, hint?:string }` becomes an
 *    on-figure box (angles → the `geometry-angles` keyboard, lengths → `geometry-lengths`). The figure is
 *    static (no construction tools by default). The toolkit is `{ board, JXG, colors, rng, …drawing
 *    tools }` — the same `parallelMark`/`tickMark`/`angleMark`/`rightAngle`/`extend`/`label` a geometry
 *    scene gets.
 */
export interface GeometryProblemConfig {
  /**
   * Engine config (see above). `tools` is the toolbar
   * subset of `"line"`/`"parallel"`/`"equal"`/`"right"` (default all).
   */
  generate?: {
    scaffolds: string[];
    minSteps?: number;
    maxSteps?: number;
    theorems?: string[];
    pageId?: string;
    tools?: string[];
  };
  /**
   * Authored config (see above).
   */
  authored?: {
    boundingbox: [number, number, number, number];
    tools?: string[];
    build: (toolkit: Record<string, any>) => {
      blanks: Array<{ pos: [number, number]; answer: number; kind?: "angle" | "length"; target?: boolean; hint?: string }>;
      goal?: string;
    };
  };
}

export type GeometryProblemEntry = { config: GeometryProblemConfig };

const geometryProblems: Registry<GeometryProblemConfig> = makeRegistry("primer:geometry-problem-registered");

/**
 * Register a named geometry problem. Re-registering overwrites. Announces the registration (like
 * {@link registerChart}) so a `<primer-geometry-problem>` that connected before this deferred script
 * ran can finish building.
 */
export function registerGeometryProblem(name: string, config: GeometryProblemConfig) {
  geometryProblems.register(name, config);
}

/**
 * Look up a geometry problem config by name (or undefined if not registered).
 */
export function getGeometryProblem(name: string): GeometryProblemConfig | undefined {
  return geometryProblems.get(name);
}

/**
 * A "write a program" exercise, used by `<primer-program name="…">` (standalone, or embedded in a
 * `<primer-quiz>` as a `{ program: "name" }` question). Each attempt draws a fresh random INPUT: the
 * learner writes TypeScript that reads the global `INPUT` and assigns the global `ANSWER`, which is run
 * in the QuickJS sandbox and graded against the reference `solution`. See js/components/primer-program.js.
 */
export interface ProgramConfig {
  /**
   * The task description (may contain inline `$…$` LaTeX).
   * A function to localize it (e.g. `() => makeStrings("myProg")("task")`).
   */
  prompt?: string | (() => string);
  /**
   * Optional `variables` spec (see js/quiz-vars.js) drawn each attempt;
   * the bindings are passed to `input`/`solution` so the INPUT can scale with them.
   */
  variables?: string;
  /**
   * Build the INPUT value from the drawn `bindings` (and a seeded `rng` for arrays/strings). Returns a
   * number, string, array, object, … — whatever the exercise supplies as the global `INPUT`.
   */
  input: (bindings: Record<string, string | number>, rng: Rng) => unknown;
  /**
   * The reference
   * solution: compute the correct `ANSWER` from the INPUT (and bindings). Its return value is what the
   * learner's `ANSWER` is graded against (numbers with tolerance; arrays/objects structurally).
   */
  solution: (input: any, bindings: Record<string, string | number>) => unknown;
  /** Starter TypeScript shown in the editor (language-neutral; keep inline). */
  starter?: string;
}

const programs: Registry<ProgramConfig> = makeRegistry("primer:program-registered");

/**
 * Register a named program exercise. Re-registering overwrites. Announces the registration (like
 * {@link registerQuiz}) so a `<primer-program>` that connected before this deferred script ran can
 * finish building.
 */
export function registerProgram(name: string, config: ProgramConfig) {
  programs.register(name, config);
}

/**
 * Look up a program config by name (or undefined if not registered).
 */
export function getProgram(name: string): ProgramConfig | undefined {
  return programs.get(name);
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
 * @returns The question bank (optional leading config).
 */
export type QuizBuilder = (toolkit: {
  sceneStrings: (key: string, vars?: Record<string, string | number>) => string;
}) => Array<AuthoredQuestion | QuizConfig>;

const quizzes: Registry<QuizBuilder> = makeRegistry("primer:quiz-registered");

/**
 * Register a named quiz builder. Re-registering a name overwrites it. Announces the registration
 * (like {@link registerChart}) so a `<primer-quiz>` that connected before this deferred script ran
 * can finish building.
 */
export function registerQuiz(name: string, builder: QuizBuilder) {
  quizzes.register(name, builder);
}

/**
 * Look up a quiz builder by name (or undefined if not registered).
 */
export function getQuiz(name: string): QuizBuilder | undefined {
  return quizzes.get(name);
}
