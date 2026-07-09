// @ts-check
/**
 * <primer-geometry scene="name"> — a themed JSXGraph GEOMETRY figure (lines, angles, polygons,
 * Greek-letter labels) with a steppable **waypoint timeline**: a student can play a proof/construction
 * forwards and backwards, or expand it to see every step at once.
 *
 *   <primer-geometry scene="pythagoras"></primer-geometry>
 *
 *   <script type="module">
 *     import { registerGeometryScene } from "primer";
 *     registerGeometryScene("pythagoras", ({ board, colors, step, sceneStrings }) => {
 *       const A = board.create("point", [0,0], { fixed:true, name:"A" });
 *       step(sceneStrings("triangle"), () => board.create("polygon", [A,B,C], { strokeColor: colors.line }));
 *       step(sceneStrings("rightAngle"), () => board.create("angle", [B,A,C], { orthoType:"square" }));
 *     }, { boundingbox:[-1,5,6,-1] });
 *   </script>
 *
 * The builder gets a manim-style toolkit `{ board, JXG, step, sliders, colors, sceneStrings,
 * parallelMark, crossing }`. It creates EVERY element up front; each `step(caption, fn)` tags what it drew (see
 * js/geometry.js). The timeline reveals steps by a `i < current` threshold, so forward/back/jump are
 * idempotent. Step reveals fade in (JSXGraph `transitionDuration`).
 *
 * Interactivity is the timeline plus optional **external sliders**: pass `opts.sliders = "groupName"`
 * (a `registerChartSliders` group rendered by a separate `<primer-chart-sliders>`); the diagram
 * subscribes and re-plots as the sliders move (the builder's functional coords read the live values).
 *
 * External control: the element exposes `goTo(k)`, `next()`, `prev()`, `play()`, `reset()`, and the
 * getters `step`/`stepCount`, and dispatches `primer:geometry-step` on each change — so e.g. a
 * `<primer-manim>` scene can drive a proof in lockstep. Add `no-controls` to hide the built-in bar.
 * @module
 */

import { attachShared, awaitRegistration, PLAY_ICON_SVG, BIG_PLAY_CSS } from "./shared.js";
import { getGeometryScene } from "../scenes.js";
import { themeColors } from "../theme.js";
import { t } from "../i18n.js";
import { makeStrings } from "../scene-strings.js";
import { adoptJsxCss, disposeBoard, wrapBoard, resolveJXG } from "./jsx-board.js";
import { getSliderGroup, subscribeSliders } from "../charts.js";
import { clampStep, createStepCollector, applyStepVisibility } from "../geometry.js";
import { makeGeometryTools } from "../geometry-tools.js";
import { makeRng } from "../rng.js";
import { reportError } from "../report-error.js";

/** Extra pause (ms) after a step's own animation before auto-advancing to the next during Play. */
const AUTOPLAY_HOLD_MS = 750;

export class PrimerGeometry extends HTMLElement {
  /** @type {any} The active JSXGraph board. */
  #board = null;
  /** @type {any} JSXGraph namespace (kept for freeBoard). */
  #jsx = null;
  /** @type {import("../geometry.js").Waypoint[]} */
  #steps = [];
  /** @type {number} Revealed-step count (0…stepCount). */
  #current = 0;
  /** @type {number} Fade duration for a reveal, ms. */
  #stepMs = 450;
  /** @type {(() => void) | null} */
  #onTheme = null;
  /** @type {(() => void) | null} */
  #stopWaiting = null;
  /** @type {(() => void) | null} Unsubscribe from a slider group. */
  #unsubscribe = null;
  /** @type {number} Monotonic build id (abort a build superseded during its async await). */
  #buildGen = 0;
  /** @type {number} Play-mode timer handle. */
  #playTimer = 0;
  /** @type {any[]} Mini boards rendered in the expanded view (freed on collapse). */
  #miniBoards = [];
  /** @type {boolean} */
  #expanded = false;
  /** @type {boolean} Whether the initial step has been chosen (so rebuilds keep the student's place). */
  #started = false;
  /** @type {number | null} Per-run seed for the toolkit `rng` (bumped by Refresh; stable otherwise). */
  #seed = null;
  /** @type {boolean} Whether this scene opted into random (shows the Refresh button). */
  #random = false;
  /** @type {boolean} "Finished-frame-first" mode (the default for any multi-step scene): the figure
   * opens fully revealed with a big Play button over it that rewinds and replays the build-up. False
   * for static (0-step) scenes, `no-controls` scenes, and scenes that opt out with `stepThrough`. */
  #showOverlay = false;
  /** @type {HTMLElement | null} The big-play overlay button (cached: `#build` clears the stage, so the
   * same node — with its listener — is re-appended over the freshly-rendered board each build). */
  #bigPlay = null;

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    adoptJsxCss(root, () => this.isConnected);
    root.innerHTML = `
      <style>
        .geo { padding: 0; }
        .geo-title {
          font-family: var(--primer-font-display, var(--primer-font-body, sans-serif));
          font-size: 1.05rem; font-weight: 600; margin: 0 0 0.5rem; color: var(--primer-ink, #111);
          text-align: center;
        }
        .geo-title[hidden], .bar[hidden], .expanded[hidden], .big-play[hidden] { display: none; }
        /* In the expanded "all steps" view, only the Collapse button (and Refresh, so a random
           figure can be re-rolled while expanded) stay in the bar — the step-nav buttons, counter and
           caption are meaningless when every step is shown at once. */
        .bar.is-expanded > :not(.expand):not(.refresh) { display: none; }
        /* A static (step-less) random figure shows only the Refresh button — the step-nav, Play and
           All-steps controls have nothing to act on. */
        .bar.is-static > :not(.refresh) { display: none; }
        .stage { width: 100%; aspect-ratio: 7 / 4; position: relative; overflow: hidden;
          background: var(--primer-viz-bg, #fff); border-radius: var(--primer-radius, 0.6rem);
          box-shadow: inset 0 0 0 1px var(--primer-border, #e6e0d4); }
        .stage.jxgbox { background: var(--primer-viz-bg, #fff); }
        .stage svg { display: block; width: 100% !important; height: 100% !important; }
        /* Big centred Play button (shared BIG_PLAY_CSS) overlaid on a "play overlay" figure: the
           figure opens fully revealed, and this button rewinds + replays the build-up. Hidden while
           playing and on non-overlay scenes. */
        ${BIG_PLAY_CSS}
        /* "Neon HUD" step bar: a recessed instrument strip of glowing chip buttons + a monospace
           step counter. Colours from --primer-* tokens (glow = the theme's accent/ring). */
        .bar { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; justify-content: center;
          margin-bottom: 0.6rem; padding: 0.45rem 0.6rem; border-radius: 0.5rem;
          background: var(--primer-control-bg, #f1ede4); border: 1px solid var(--primer-control-border, #ccc);
          box-shadow: inset 0 1px 0 var(--primer-ring, rgba(70,90,230,0.2));
          font-family: var(--primer-font-ui, sans-serif); }
        .bar button {
          padding: 0.2rem 0.6rem; border-radius: 0.35rem;
          border: 1px solid var(--primer-control-border, #ccc);
          background: var(--primer-control-bg, #fff); color: var(--primer-ink, #111);
          transition: border-color 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease; }
        .bar button:hover:not(:disabled) { border-color: var(--primer-accent, #46e); }
        .bar button:focus-visible { outline: none; border-color: var(--primer-accent, #46e);
          box-shadow: 0 0 0 2px var(--primer-ring, rgba(70,90,230,0.5)), 0 0 8px var(--primer-ring, rgba(70,90,230,0.4)); }
        .bar button:disabled { opacity: 0.4; box-shadow: none; }
        /* "Next" is the primary step-through action — make it an accent-lit chip. */
        .bar .next:not(:disabled) { font-weight: 800; font-size: 1.15rem; line-height: 1;
          color: var(--primer-accent-ink, #fff); background: var(--primer-accent, #4d5bd1);
          border-color: transparent; box-shadow: 0 0 8px var(--primer-ring, rgba(70,90,230,0.6)); }
        .bar .count { font-family: var(--primer-font-mono, monospace); font-size: 0.85rem; letter-spacing: 0.04em;
          color: var(--primer-ink-soft, #667); min-width: 3.6rem; text-align: center; }
        .bar .caption { flex: 1 1 100%; font-size: 0.92rem; font-weight: 700; color: var(--primer-ink, #111); margin-top: 0.1rem; text-align: center; }
        .expanded { margin-top: 0.6rem; display: grid; gap: 1rem; }
        .expanded .block h4 { font-family: var(--primer-font-ui, sans-serif); font-size: 0.95rem;
          margin: 0 0 0.3rem; color: var(--primer-ink, #111); text-align: center; }
        .expanded .mini { width: 100%; aspect-ratio: 7 / 4; overflow: hidden;
          background: var(--primer-viz-bg, #fff); border-radius: var(--primer-radius, 0.6rem); }
        .expanded .mini svg { display: block; width: 100% !important; height: 100% !important; }
        .meta { display: block; }
      </style>
      <div class="geo">
        <h3 class="geo-title" part="title" hidden></h3>
        <div class="bar" part="controls" hidden>
          <button class="rewind" type="button" aria-label="${t("geometry.rewind")}">«</button>
          <button class="prev" type="button" aria-label="${t("geometry.prev")}">‹</button>
          <span class="count" aria-live="polite">0 / 0</span>
          <button class="next" type="button" aria-label="${t("geometry.next")}">›</button>
          <button class="forward" type="button" aria-label="${t("geometry.forward")}">»</button>
          <button class="play" type="button">${t("geometry.play")}</button>
          <button class="expand" type="button">${t("geometry.expand")}</button>
          <button class="refresh" type="button" hidden>${t("geometry.refresh")}</button>
          <span class="caption"></span>
        </div>
        <div class="stage" part="stage">
          <button class="big-play" type="button" hidden aria-label="${t("geometry.play")}" title="${t("geometry.play")}">
            <span class="disc">${PLAY_ICON_SVG}</span>
          </button>
        </div>
        <div class="expanded" part="expanded" hidden></div>
      </div>`;

    const bar = /** @type {HTMLElement} */ (root.querySelector(".bar"));
    bar.querySelector(".rewind")?.addEventListener("click", () => this.reset());
    bar.querySelector(".prev")?.addEventListener("click", () => this.prev());
    bar.querySelector(".next")?.addEventListener("click", () => this.next());
    bar.querySelector(".forward")?.addEventListener("click", () => this.goTo(this.#steps.length));
    bar.querySelector(".play")?.addEventListener("click", () => this.#togglePlay());
    bar.querySelector(".refresh")?.addEventListener("click", () => void this.#refresh());
    bar.querySelector(".expand")?.addEventListener("click", () => this.#toggleExpand());

    // The big-play overlay (cached so it survives the stage being cleared on each build). Pressing it
    // rewinds + replays — play() already does `if (current >= steps.length) goTo(0)` first.
    this.#bigPlay = /** @type {HTMLElement} */ (root.querySelector(".big-play"));
    this.#bigPlay?.addEventListener("click", () => this.play());

    this.#onTheme = () => void this.#build(root);
    document.addEventListener("theme-change", this.#onTheme);
    void this.#build(root);
  }

  disconnectedCallback() {
    if (this.#onTheme) document.removeEventListener("theme-change", this.#onTheme);
    this.#onTheme = null;
    this.#cancelWait();
    this.#stopPlay();
    this.#dispose();
  }

  get #root() {
    return /** @type {ShadowRoot} */ (this.shadowRoot);
  }

  /**
   * (Re)build the figure: dispose, lazy-load JSXGraph, run the builder, wire the timeline.
   * @param {ShadowRoot} root
   */
  async #build(root) {
    const stage = /** @type {HTMLElement} */ (root.querySelector(".stage"));
    const name = this.getAttribute("scene") ?? "";
    const entry = getGeometryScene(name);
    if (!entry) {
      this.#awaitRegistration(root, stage, name);
      return;
    }
    this.#cancelWait();
    // Whether this scene opted into random initial conditions (shows the Refresh button), and a
    // per-run seed for the toolkit `rng` — chosen once (so each page load is a fresh example, but a
    // theme-change rebuild reuses it), then bumped only by Refresh.
    this.#random = Boolean(entry.opts.random);
    if (this.#seed === null) this.#seed = (Math.random() * 0x100000000) >>> 0;
    const gen = ++this.#buildGen;
    this.#collapse(); // a rebuild (e.g. theme change) returns to the single board
    this.#dispose();
    stage.replaceChildren();
    stage.removeAttribute("style");
    try {
      const mod = await import("jsxgraph");
      if (!this.isConnected || gen !== this.#buildGen) return; // superseded → abort
      const JXG = resolveJXG(mod);
      this.#stepMs = Number.isFinite(entry.opts.stepMs) ? /** @type {number} */ (entry.opts.stepMs) : 450;

      const { board, steps } = this.#runBuilder(stage, JXG, entry, name);
      this.#board = board;
      this.#jsx = JXG.JSXGraph;
      this.#steps = steps;
      // Re-append the cached big-play overlay over the freshly-rendered board (initBoard injects the
      // SVG; appending after it puts the absolutely-positioned button on top). #renderBar toggles it.
      if (this.#bigPlay) stage.append(this.#bigPlay);

      // Title (may be a thunk so a localized title reflects the active locale).
      const rawTitle = entry.opts.title;
      const title = (typeof rawTitle === "function" ? rawTitle() : rawTitle) ?? "";
      const heading = /** @type {HTMLElement} */ (root.querySelector(".geo-title"));
      heading.textContent = title;
      heading.hidden = !title;

      // "Finished-frame-first" is the DEFAULT for any multi-step scene: it opens fully revealed (the
      // completed figure on load) with the big-play button to rewind + replay. Exceptions: a static
      // (0-step) figure, a `no-controls` scene (externally driven), or a scene that opts out with
      // `stepThrough: true` — those open at the first step. An explicit POSITIVE `opts.start` is always
      // honored (an author pinning a specific frame); a redundant `start: 0` does NOT block the reveal.
      // A rebuild (e.g. theme change) keeps the student's current position (the #started flag
      // distinguishes "first build" from "rewound to 0"). Apply instantly, THEN enable fades so the
      // first hide doesn't flash a fade-out.
      this.#showOverlay =
        this.#steps.length > 0 && !this.hasAttribute("no-controls") && !entry.opts.stepThrough;
      if (!this.#started) {
        const start = entry.opts.start;
        const opening = Number.isFinite(start) && /** @type {number} */ (start) > 0
          ? /** @type {number} */ (start)
          : this.#showOverlay ? this.#steps.length : 0;
        this.#current = clampStep(opening, this.#steps.length);
        this.#started = true;
      } else {
        this.#current = clampStep(this.#current, this.#steps.length);
      }
      applyStepVisibility(this.#steps, this.#current);
      board.update();
      for (const s of this.#steps) for (const { el } of s.els) el.setAttribute?.({ transitionDuration: this.#stepMs });

      this.#renderBar();
      this.#emit();

      // External sliders: subscribe so the figure re-plots on change (functional coords read live).
      const group = entry.opts.sliders;
      if (group) {
        this.#unsubscribe = subscribeSliders(group, () => {
          try {
            this.#board?.update();
          } catch {
            /* ignore a transient bad value */
          }
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      reportError(`primer-geometry:${name}`, err);
      stage.innerHTML = `<span class="meta">${t("manim.runError", { error })}</span>`;
    }
  }

  /**
   * Init a themed equal-aspect grid-less board into `host`, run the geometry builder against it with a
   * step collector, and return the board + collected steps. Reused for the main board and each
   * expanded mini board.
   * @param {HTMLElement} host
   * @param {Record<string, any>} JXG
   * @param {import("../scenes.js").GeometryEntry} entry
   * @param {string} name  The scene name (scopes the localized strings).
   */
  #runBuilder(host, JXG, entry, name) {
    const colors = themeColors();
    const { boundingbox = [-5, 5, 5, -5], keepAspect = true } = entry.opts;
    let board = null;
    const wrapped = wrapBoard(JXG, colors, (b) => {
      board = b;
    });
    // Geometry wants equal aspect and NO grid/axis (override the chart faint-grid default).
    board = wrapped.JSXGraph.initBoard(host, { boundingbox, keepaspectratio: keepAspect, axis: false, grid: false });
    // A segment/line/arrow built from coordinates auto-creates its endpoint POINTS, which show as
    // dots. For teaching figures we draw lines, not points, so hide those endpoints by default —
    // an author who wants a visible dot creates an explicit `point` (unaffected by this default).
    board.options.line.point1 = { ...board.options.line.point1, visible: false, withLabel: false };
    board.options.line.point2 = { ...board.options.line.point2, visible: false, withLabel: false };
    const { step, steps } = createStepCollector(board);
    const sliders = entry.opts.sliders ? (getSliderGroup(entry.opts.sliders)?.values ?? {}) : {};
    // The toolkit, manim-style: the board + palette, the step collector, live slider values, the
    // scene-scoped localized strings, and the drawing tools.
    const sceneStrings = makeStrings(name);
    const tools = makeGeometryTools(board, colors);
    // A seeded RNG for random scenes: built from the same per-run #seed for the main board AND every
    // mini-board of the "All steps" view, so a single run is internally coherent; Refresh bumps the
    // seed for a fresh example. Builders use rng()/rng.int/rng.pick instead of Math.random().
    const rng = makeRng(/** @type {number} */ (this.#seed ?? 0));
    entry.builder({ board, JXG, step, sliders, colors, sceneStrings, rng, ...tools });
    // Read-only: a teaching figure isn't a manipulable construction. Free points (created from
    // coordinates) are draggable by default — fix EVERY element and drop hover highlighting so the
    // mouse can't move anything. (Slider-driven points use functional coords, so they still update
    // on board.update(); `fixed` only stops dragging.)
    for (const el of board.objectsList) el.setAttribute?.({ fixed: true, highlight: false });
    return { board, steps };
  }

  /* ---- timeline state + UI ---- */

  /** @returns {number} */
  get stepCount() {
    return this.#steps.length;
  }
  /** @returns {number} */
  get step() {
    return this.#current;
  }

  /** @param {number} n */
  goTo(n) {
    const next = clampStep(n, this.#steps.length);
    if (next === this.#current) return;
    this.#current = next;
    applyStepVisibility(this.#steps, this.#current);
    this.#board?.update();
    this.#renderBar();
    this.#emit();
  }
  next() {
    this.goTo(this.#current + 1);
  }
  prev() {
    this.goTo(this.#current - 1);
  }
  reset() {
    this.#stopPlay();
    this.goTo(0);
  }
  /** Auto-advance to the end (from the start if already there). */
  play() {
    if (!this.#steps.length) return;
    if (this.#current >= this.#steps.length) this.goTo(0);
    this.#stopPlay();
    const tick = () => {
      if (this.#current >= this.#steps.length) {
        this.#stopPlay();
        return;
      }
      this.next();
      this.#playTimer = window.setTimeout(tick, this.#stepMs + AUTOPLAY_HOLD_MS);
    };
    this.#playTimer = window.setTimeout(tick, 0);
    this.#setPlayLabel(true);
  }

  #togglePlay() {
    if (this.#playTimer) this.#stopPlay();
    else this.play();
  }
  #stopPlay() {
    if (this.#playTimer) {
      clearTimeout(this.#playTimer);
      this.#playTimer = 0;
    }
    this.#setPlayLabel(false);
    // Re-show the big-play overlay now that playback has stopped (the play loop ends at current===n).
    this.#renderBar();
  }
  /** @param {boolean} playing */
  #setPlayLabel(playing) {
    const btn = this.#root?.querySelector(".play");
    if (btn) btn.textContent = playing ? t("geometry.pause") : t("geometry.play");
  }

  /** Update the control bar (counter, caption, enabled state, visibility). */
  #renderBar() {
    const root = this.#root;
    if (!root) return;
    const bar = /** @type {HTMLElement} */ (root.querySelector(".bar"));
    const n = this.#steps.length;
    // No steps (a purely static figure) or opted out → no bar — UNLESS the scene is random, which
    // still wants its Refresh button (then the bar collapses to just that, via `.is-static`).
    bar.hidden = (n === 0 && !this.#random) || this.hasAttribute("no-controls");
    bar.classList.toggle("is-static", n === 0 && this.#random);
    /** @type {HTMLElement} */ (root.querySelector(".refresh")).hidden = !this.#random;
    const count = /** @type {HTMLElement} */ (root.querySelector(".count"));
    count.textContent = `${this.#current} / ${n}`;
    const caption = /** @type {HTMLElement} */ (root.querySelector(".caption"));
    caption.textContent = this.#current > 0 ? `${this.#current}. ${this.#steps[this.#current - 1]?.caption ?? ""}` : "";
    /** @type {HTMLButtonElement} */ (root.querySelector(".rewind")).disabled = this.#current <= 0;
    /** @type {HTMLButtonElement} */ (root.querySelector(".prev")).disabled = this.#current <= 0;
    /** @type {HTMLButtonElement} */ (root.querySelector(".next")).disabled = this.#current >= n;
    /** @type {HTMLButtonElement} */ (root.querySelector(".forward")).disabled = this.#current >= n;
    // The big-play overlay: only in finished-frame-first mode, only at the final frame, and not while
    // playing (it auto-hides the instant play advances, since every goTo re-runs #renderBar).
    if (this.#bigPlay) this.#bigPlay.hidden = !(this.#showOverlay && n > 0 && this.#current >= n && !this.#playTimer);
  }

  #emit() {
    this.dispatchEvent(
      new CustomEvent("primer:geometry-step", {
        bubbles: true,
        detail: { name: this.getAttribute("scene") ?? "", step: this.#current, stepCount: this.#steps.length },
      }),
    );
  }

  /* ---- expanded "all steps" view ---- */

  #toggleExpand() {
    if (this.#expanded) this.#collapse();
    else void this.#expand();
  }

  /**
   * Refresh a random scene: bump the seed, re-run the builder (new random values), reset to the
   * figure's start, and restore the "All steps" view if it was open. Reuses the #build rebuild path.
   */
  async #refresh() {
    this.#stopPlay();
    this.#seed = ((this.#seed ?? 0) + 0x9e3779b1) >>> 0; // a fresh seed → a fresh-but-coherent example
    const wasExpanded = this.#expanded;
    this.#started = false; // so the rebuild resets to opts.start rather than keeping the place
    await this.#build(this.#root);
    if (wasExpanded) await this.#expand();
  }

  /** Render one captioned mini board per step, each cumulative through that step. */
  async #expand() {
    if (this.#expanded || !this.#steps.length) return;
    const name = this.getAttribute("scene") ?? "";
    const entry = getGeometryScene(name);
    if (!entry) return;
    const root = this.#root;
    const expandedEl = /** @type {HTMLElement} */ (root.querySelector(".expanded"));
    const stage = /** @type {HTMLElement} */ (root.querySelector(".stage"));
    this.#stopPlay();
    try {
      const mod = await import("jsxgraph");
      if (!this.isConnected) return;
      const JXG = resolveJXG(mod);
      expandedEl.replaceChildren();
      for (let i = 1; i <= this.#steps.length; i++) {
        const block = document.createElement("div");
        block.className = "block";
        const h = document.createElement("h4");
        h.textContent = `${i}. ${this.#steps[i - 1].caption}`;
        const mini = document.createElement("div");
        mini.className = "mini";
        block.append(h, mini);
        expandedEl.append(block);
        const { board, steps } = this.#runBuilder(mini, JXG, entry, name);
        applyStepVisibility(steps, i); // cumulative through step i
        board.update();
        this.#miniBoards.push(board);
      }
      stage.hidden = true;
      expandedEl.hidden = false;
      // Collapse the bar down to just the Collapse button (CSS hides the rest); each mini board
      // carries its own heading, so the step-nav buttons, counter and caption are redundant here.
      root.querySelector(".bar")?.classList.add("is-expanded");
      this.#expanded = true;
      this.#setExpandLabel(true);
    } catch {
      /* best-effort: leave the single view in place */
    }
  }

  #collapse() {
    const root = this.#root;
    if (!root) return;
    for (const b of this.#miniBoards) {
      disposeBoard(this.#jsx, b);
    }
    this.#miniBoards = [];
    const expandedEl = /** @type {HTMLElement} */ (root.querySelector(".expanded"));
    expandedEl.replaceChildren();
    expandedEl.hidden = true;
    const stage = /** @type {HTMLElement} */ (root.querySelector(".stage"));
    if (stage) stage.hidden = false;
    // Restore the full control bar (the step-nav buttons, counter and caption hidden while expanded).
    root.querySelector(".bar")?.classList.remove("is-expanded");
    this.#expanded = false;
    this.#setExpandLabel(false);
  }
  /** @param {boolean} expanded */
  #setExpandLabel(expanded) {
    const btn = this.#root?.querySelector(".expand");
    if (btn) btn.textContent = expanded ? t("geometry.collapse") : t("geometry.expand");
  }

  /* ---- registration wait + teardown ---- */

  /**
   * @param {ShadowRoot} root
   * @param {HTMLElement} stage
   * @param {string} name
   */
  #awaitRegistration(root, stage, name) {
    if (this.#stopWaiting) return;
    this.#stopWaiting = awaitRegistration("primer:geometry-registered", name, {
      onReady: () => {
        this.#cancelWait();
        void this.#build(root);
      },
      onTimeout: () => {
        this.#cancelWait();
        stage.innerHTML = `<span class="meta">${t("manim.noScene", { name })}</span>`;
      },
    });
  }

  #cancelWait() {
    if (this.#stopWaiting) {
      this.#stopWaiting();
      this.#stopWaiting = null;
    }
  }

  #dispose() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#collapse();
    const board = this.#board;
    this.#board = null;
    disposeBoard(this.#jsx, board);
  }
}

if (!customElements.get("primer-geometry")) {
  customElements.define("primer-geometry", PrimerGeometry);
}
