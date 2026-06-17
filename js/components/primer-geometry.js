// @ts-check
/**
 * <primer-geometry scene="name"> — a themed JSXGraph GEOMETRY figure (lines, angles, polygons,
 * Greek-letter labels) with a steppable **waypoint timeline**: a student can play a proof/construction
 * forwards and backwards, or expand it to see every step at once.
 *
 *   <primer-geometry scene="pythagoras"></primer-geometry>
 *
 *   <script type="module">
 *     import { registerGeometry } from "primer";
 *     registerGeometry("pythagoras", ({ board, colors, step }) => {
 *       const A = board.create("point", [0,0], { fixed:true, name:"A" });
 *       step("A right triangle", () => board.create("polygon", [A,B,C], { strokeColor: colors.line }));
 *       step("The right angle",  () => board.create("angle", [B,A,C], { orthoType:"square" }));
 *     }, { boundingbox:[-1,5,6,-1] });
 *   </script>
 *
 * The builder creates EVERY element up front; each `step(caption, fn)` tags what it drew (see
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

import { attachShared } from "./shared.js";
import { getGeometry } from "../scenes.js";
import { themeColors } from "../theme.js";
import { t } from "../i18n.js";
import { adoptJsxCss, wrapBoard } from "./jsx-board.js";
import { getSliderGroup, subscribeSliders } from "../charts.js";
import { clampStep, createStepCollector, applyStepVisibility } from "../geometry.js";

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

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    adoptJsxCss(root, () => this.isConnected);
    root.innerHTML = `
      <style>
        .geo { padding: 0; }
        .geo-title {
          font-family: var(--primer-font-display, var(--primer-font-body, sans-serif));
          font-size: 1.05rem; font-weight: 600; margin: 0 0 0.5rem; color: var(--primer-ink, #111);
        }
        .geo-title[hidden], .bar[hidden], .expanded[hidden] { display: none; }
        .stage { width: 100%; aspect-ratio: 7 / 4; position: relative; overflow: hidden;
          background: var(--primer-viz-bg, #fff); border-radius: var(--primer-radius, 0.6rem); }
        .stage.jxgbox { background: var(--primer-viz-bg, #fff); }
        .stage svg { display: block; width: 100% !important; height: 100% !important; }
        .bar { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-top: 0.6rem;
          font-family: var(--primer-font-ui, sans-serif); }
        .bar button { padding: 0.2rem 0.6rem; }
        .bar .count { font-size: 0.85rem; color: var(--primer-ink-soft, #667); min-width: 3.2rem; text-align: center; }
        .bar .caption { flex: 1 1 100%; font-size: 0.92rem; color: var(--primer-ink, #111); margin-top: 0.1rem; }
        .expanded { margin-top: 0.6rem; display: grid; gap: 1rem; }
        .expanded .block h4 { font-family: var(--primer-font-ui, sans-serif); font-size: 0.95rem;
          margin: 0 0 0.3rem; color: var(--primer-ink, #111); }
        .expanded .mini { width: 100%; aspect-ratio: 7 / 4; overflow: hidden;
          background: var(--primer-viz-bg, #fff); border-radius: var(--primer-radius, 0.6rem); }
        .expanded .mini svg { display: block; width: 100% !important; height: 100% !important; }
        .meta { display: block; }
      </style>
      <div class="geo">
        <h3 class="geo-title" part="title" hidden></h3>
        <div class="stage" part="stage"></div>
        <div class="bar" part="controls" hidden>
          <button class="rewind" type="button" aria-label="${t("geometry.rewind")}">«</button>
          <button class="prev" type="button" aria-label="${t("geometry.prev")}">‹</button>
          <span class="count" aria-live="polite">0 / 0</span>
          <button class="next" type="button" aria-label="${t("geometry.next")}">›</button>
          <button class="forward" type="button" aria-label="${t("geometry.forward")}">»</button>
          <button class="play" type="button">${t("geometry.play")}</button>
          <button class="expand" type="button">${t("geometry.expand")}</button>
          <span class="caption"></span>
        </div>
        <div class="expanded" part="expanded" hidden></div>
      </div>`;

    const bar = /** @type {HTMLElement} */ (root.querySelector(".bar"));
    bar.querySelector(".rewind")?.addEventListener("click", () => this.reset());
    bar.querySelector(".prev")?.addEventListener("click", () => this.prev());
    bar.querySelector(".next")?.addEventListener("click", () => this.next());
    bar.querySelector(".forward")?.addEventListener("click", () => this.goTo(this.#steps.length));
    bar.querySelector(".play")?.addEventListener("click", () => this.#togglePlay());
    bar.querySelector(".expand")?.addEventListener("click", () => this.#toggleExpand());

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
    const entry = getGeometry(name);
    if (!entry) {
      this.#awaitRegistration(root, stage, name);
      return;
    }
    this.#cancelWait();
    const gen = ++this.#buildGen;
    this.#collapse(); // a rebuild (e.g. theme change) returns to the single board
    this.#dispose();
    stage.replaceChildren();
    stage.removeAttribute("style");
    try {
      const mod = await import("jsxgraph");
      if (!this.isConnected || gen !== this.#buildGen) return; // superseded → abort
      const JXG = mod.default ?? /** @type {any} */ (mod).JXG ?? mod;
      this.#stepMs = Number.isFinite(entry.opts.stepMs) ? /** @type {number} */ (entry.opts.stepMs) : 450;

      const { board, steps } = this.#runBuilder(stage, JXG, entry);
      this.#board = board;
      this.#jsx = JXG.JSXGraph;
      this.#steps = steps;

      // Title (may be a thunk so a localized title reflects the active locale).
      const rawTitle = entry.opts.title;
      const title = (typeof rawTitle === "function" ? rawTitle() : rawTitle) ?? "";
      const heading = /** @type {HTMLElement} */ (root.querySelector(".geo-title"));
      heading.textContent = title;
      heading.hidden = !title;

      // Initial step. By default a figure opens FULLY revealed (the finished render) — the student
      // sees the deltas only by rewinding and stepping forward; an author can override with opts.start.
      // A rebuild (e.g. theme change) keeps the student's current position (including 0), so the
      // #started flag distinguishes "first build" from "rewound to 0". Apply instantly, THEN enable
      // fades so the first hide doesn't flash a fade-out.
      if (!this.#started) {
        this.#current = clampStep(entry.opts.start ?? this.#steps.length, this.#steps.length);
        this.#started = true;
      } else {
        this.#current = clampStep(this.#current, this.#steps.length);
      }
      applyStepVisibility(this.#steps, this.#current);
      board.update();
      for (const s of this.#steps) for (const el of s.els) el.setAttribute?.({ transitionDuration: this.#stepMs });

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
   */
  #runBuilder(host, JXG, entry) {
    const colors = themeColors();
    const { boundingbox = [-5, 5, 5, -5], keepAspect = true } = entry.opts;
    let board = null;
    const wrapped = wrapBoard(JXG, colors, (b) => {
      board = b;
    });
    // Geometry wants equal aspect and NO grid/axis (override the chart faint-grid default).
    board = wrapped.JSXGraph.initBoard(host, { boundingbox, keepaspectratio: keepAspect, axis: false, grid: false });
    const { step, steps } = createStepCollector(board);
    const sliders = entry.opts.sliders ? (getSliderGroup(entry.opts.sliders)?.values ?? {}) : {};
    entry.builder({ board, colors, JXG, step, sliders });
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
      this.#playTimer = window.setTimeout(tick, this.#stepMs + 750);
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
    // No steps (a purely static figure) or opted out → no bar.
    bar.hidden = n === 0 || this.hasAttribute("no-controls");
    const count = /** @type {HTMLElement} */ (root.querySelector(".count"));
    count.textContent = `${this.#current} / ${n}`;
    const caption = /** @type {HTMLElement} */ (root.querySelector(".caption"));
    caption.textContent = this.#current > 0 ? (this.#steps[this.#current - 1]?.caption ?? "") : "";
    /** @type {HTMLButtonElement} */ (root.querySelector(".rewind")).disabled = this.#current <= 0;
    /** @type {HTMLButtonElement} */ (root.querySelector(".prev")).disabled = this.#current <= 0;
    /** @type {HTMLButtonElement} */ (root.querySelector(".next")).disabled = this.#current >= n;
    /** @type {HTMLButtonElement} */ (root.querySelector(".forward")).disabled = this.#current >= n;
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

  /** Render one captioned mini board per step, each cumulative through that step. */
  async #expand() {
    if (this.#expanded || !this.#steps.length) return;
    const name = this.getAttribute("scene") ?? "";
    const entry = getGeometry(name);
    if (!entry) return;
    const root = this.#root;
    const expandedEl = /** @type {HTMLElement} */ (root.querySelector(".expanded"));
    const stage = /** @type {HTMLElement} */ (root.querySelector(".stage"));
    this.#stopPlay();
    try {
      const mod = await import("jsxgraph");
      if (!this.isConnected) return;
      const JXG = mod.default ?? /** @type {any} */ (mod).JXG ?? mod;
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
        const { board, steps } = this.#runBuilder(mini, JXG, entry);
        applyStepVisibility(steps, i); // cumulative through step i
        board.update();
        this.#miniBoards.push(board);
      }
      stage.hidden = true;
      expandedEl.hidden = false;
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
      try {
        this.#jsx?.freeBoard?.(b);
      } catch {
        /* best-effort */
      }
    }
    this.#miniBoards = [];
    const expandedEl = /** @type {HTMLElement} */ (root.querySelector(".expanded"));
    expandedEl.replaceChildren();
    expandedEl.hidden = true;
    const stage = /** @type {HTMLElement} */ (root.querySelector(".stage"));
    if (stage) stage.hidden = false;
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
    /** @param {Event} e */
    const onReg = (e) => {
      if (/** @type {CustomEvent} */ (e).detail?.name !== name) return;
      this.#cancelWait();
      void this.#build(root);
    };
    const timer = setTimeout(() => {
      this.#cancelWait();
      stage.innerHTML = `<span class="meta">${t("manim.noScene", { name })}</span>`;
    }, 4000);
    this.#stopWaiting = () => {
      document.removeEventListener("primer:geometry-registered", onReg);
      clearTimeout(timer);
    };
    document.addEventListener("primer:geometry-registered", onReg);
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
    if (board) {
      try {
        this.#jsx?.freeBoard?.(board);
      } catch {
        /* best-effort */
      }
    }
  }
}

if (!customElements.get("primer-geometry")) {
  customElements.define("primer-geometry", PrimerGeometry);
}
