// @ts-check
/**
 * <primer-chart-3d scene="name"> — mounts a registered 3D chart, rendered with JSXGraph's **View3D**
 * (a 3D scene projected to SVG — no WebGL, no context cap, themed like every other figure). The
 * scene is authored with `register3dChart(name, builder, opts)` (js/scenes.js): the builder receives
 * a toolkit `{ view, JXG, board, colors, sliders }` and draws with `view.create('point3d' | 'line3d'
 * | 'curve3d' | 'functiongraph3d' | …)`, reading live slider values in functional coordinates so the
 * figure re-plots on `board.update()`.
 *
 * Sliders live in a separate `<primer-chart-sliders name="…">` panel (a shared group named by
 * `opts.sliders`); this element subscribes and calls `board.update()` on every change. The view is
 * **drag-rotatable**, so — unlike `<primer-chart>`/`<primer-geometry>` — we must NOT route the board
 * through `wrapBoard` (which strips the pointer handlers View3D needs); we init it directly and keep
 * the navigation chrome off. JSXGraph is imported lazily; the board is freed on disconnect.
 * @module
 */

import { attachShared, awaitRegistration } from "./shared.js";
import { get3dChart } from "../scenes.js";
import { themeColors } from "../theme.js";
import { t } from "../i18n.js";
import { getSliderGroup, subscribeSliders } from "../charts.js";
import { adoptJsxCss, disposeBoard, resolveJXG } from "./jsx-board.js";
import { reportError } from "../report-error.js";

export class PrimerChart3d extends HTMLElement {
  /** @type {any} The active JSXGraph board (captured for disposal + theme rebuild). */
  #board = null;
  /** @type {any} The JSXGraph namespace (`JXG.JSXGraph`), kept so #dispose can freeBoard. */
  #jsx = null;
  /** @type {(() => void) | null} */
  #onTheme = null;
  /** @type {(() => void) | null} Tear-down for a pending "wait for registration". */
  #stopWaiting = null;
  /** @type {(() => void) | null} Unsubscribe from the shared slider group. */
  #unsubscribe = null;
  /** @type {number} Monotonic build id: a build superseded during its async await aborts. */
  #buildGen = 0;

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    adoptJsxCss(root, () => this.isConnected);

    root.innerHTML = `
      <style>
        .chart { padding: 0; position: relative; }
        .chart-title {
          font-family: var(--primer-font-display, var(--primer-font-body, sans-serif));
          font-size: 1.05rem; font-weight: 600; margin: 0 0 0.5rem; color: var(--primer-ink, #111);
          text-align: center;
        }
        .chart-title[hidden] { display: none; }
        /* A roughly-square stage so the 3D box isn't squashed. touch-action:none so a rotate drag
           over the widget doesn't fight the page's scroll. */
        .stage { width: 100%; aspect-ratio: 1 / 1; max-height: 26rem; margin: 0 auto; position: relative;
          overflow: hidden; touch-action: none; background: var(--primer-viz-bg, #fff);
          border-radius: var(--primer-radius, 0.6rem); box-shadow: inset 0 0 0 1px var(--primer-border, #e6e0d4); }
        .stage.jxgbox { background: var(--primer-viz-bg, #fff); }
        .stage svg { display: block; width: 100% !important; height: 100% !important; }
        /* JSXGraph makes the board/SVG focusable so it can be rotated by keyboard. Suppress the browser's
           default (black) focus box on click, and show the themed ring only for keyboard users. */
        .stage :focus, .stage:focus { outline: none; }
        .stage:has(:focus-visible), .stage:focus-visible { outline: 2px solid var(--primer-accent, #46e); outline-offset: 2px; }
        /* View3D paints its default axes pure black; pull them onto the theme's line colour (CSS beats the
           SVG stroke attribute, and re-applies after each theme rebuild). */
        .stage svg line[stroke="#000000"], .stage svg path[stroke="#000000"] { stroke: var(--primer-line, #999) !important; }
        /* A tiny hint tucked into the chart's bottom-right corner (pointer-transparent so it
           doesn't intercept a rotate drag). */
        .hint { position: absolute; right: 0.55rem; bottom: 0.45rem; margin: 0; pointer-events: none;
          font-family: var(--primer-font-ui, sans-serif); font-size: 0.58rem; letter-spacing: 0.05em;
          text-transform: uppercase; color: var(--primer-ink-soft, #667); opacity: 0.7; }
        .meta { display: block; }
      </style>
      <div class="chart">
        <h3 class="chart-title" part="title" hidden></h3>
        <div class="stage" part="stage"></div>
        <p class="hint" part="hint">drag to rotate</p>
      </div>`;

    this.#onTheme = () => void this.#build(root);
    document.addEventListener("theme-change", this.#onTheme);
    void this.#build(root);
  }

  disconnectedCallback() {
    if (this.#onTheme) document.removeEventListener("theme-change", this.#onTheme);
    this.#onTheme = null;
    this.#cancelWait();
    this.#dispose();
  }

  /**
   * (Re)build: dispose any prior board/subscription, lazy-load JSXGraph, init a direct board (keeping
   * pointer handlers so View3D can rotate), build a themed View3D, run the scene builder, then wire
   * the title and the shared-slider subscription.
   * @param {ShadowRoot} root
   */
  async #build(root) {
    const stage = /** @type {HTMLElement} */ (root.querySelector(".stage"));
    const name = this.getAttribute("scene") ?? "";
    const entry = get3dChart(name);
    if (!entry) {
      this.#awaitRegistration(root, stage, name);
      return;
    }

    this.#cancelWait();
    const gen = ++this.#buildGen;
    this.#dispose();
    stage.replaceChildren();
    stage.removeAttribute("style");
    try {
      const mod = await import("jsxgraph");
      if (!this.isConnected || gen !== this.#buildGen) return; // superseded → abort
      const JXG = resolveJXG(mod);
      const colors = themeColors();
      const view = this.#makeView(JXG, stage, entry.opts, colors);

      const sliders = entry.opts.sliders ? (getSliderGroup(entry.opts.sliders)?.values ?? {}) : {};
      entry.builder({ view, JXG, board: this.#board, colors, sliders });
      this.#board?.update();

      // Title heading (thunk-aware so a localized title reflects the active locale).
      const rawTitle = entry.opts.title;
      const title = (typeof rawTitle === "function" ? rawTitle() : rawTitle) ?? "";
      const heading = /** @type {HTMLElement} */ (root.querySelector(".chart-title"));
      heading.textContent = title;
      heading.hidden = !title;

      // Re-plot whenever the shared sliders change (functional coords read the live values).
      if (entry.opts.sliders) {
        this.#unsubscribe = subscribeSliders(entry.opts.sliders, () => {
          try {
            this.#board?.update();
          } catch {
            /* ignore a transient bad value */
          }
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      reportError(`primer-chart-3d:${name}`, err);
      stage.innerHTML = `<span class="meta">${t("manim.runError", { error })}</span>`;
    }
  }

  /**
   * Init a direct JSXGraph board (nav chrome off, but pointer handlers KEPT for rotation) and create
   * a themed View3D in it: themed axes (line colour) with x/y/z labels (ink), rear planes hidden,
   * pointer/trackball rotation enabled. Captures the board for disposal.
   * @param {Record<string, any>} JXG
   * @param {HTMLElement} stage
   * @param {import("../scenes.js").Chart3dOptions} opts
   * @param {{ bg: string, ink: string, line: string, cat: string[] }} colors
   * @returns {any} the View3D object
   */
  #makeView(JXG, stage, opts, colors) {
    const JSXGraph = JXG.JSXGraph;
    const B = 8; // 2D bounding-box half-extent (square)
    const board = JSXGraph.initBoard(stage, {
      boundingbox: [-B, B, B, -B],
      keepaspectratio: true,
      showCopyright: false,
      showNavigation: false,
      showInfobox: false,
      axis: false,
      grid: false,
      pan: { enabled: false },
      zoom: { enabled: false },
    });
    this.#board = board;
    this.#jsx = JSXGraph;

    const bounds = opts.bounds ?? [
      [-5, 5],
      [-5, 5],
      [-5, 5],
    ];
    const az = opts.az ?? -50;
    const el = opts.el ?? 25;

    // View3D fills the board with a small margin. Pointer rotation needs the board's handlers, which
    // we deliberately did NOT strip (no wrapBoard). Rear planes hidden to declutter.
    const view = board.create(
      "view3d",
      [
        [-7, -7],
        [14, 14],
        bounds,
      ],
      {
        projection: "parallel",
        trackball: { enabled: true },
        depthOrder: { enabled: true },
        az: { slider: { visible: false }, initial: az },
        el: { slider: { visible: false }, initial: el },
        xPlaneRear: { visible: false, fillOpacity: 0.05 },
        yPlaneRear: { visible: false, fillOpacity: 0.05 },
        zPlaneRear: { visible: false, fillOpacity: 0.05 },
      },
    );

    // Theme the default axes (best-effort across the View3D axis API), then label x/y/z in ink.
    try {
      const axes = view.defaultAxes;
      if (axes) for (const k of Object.keys(axes)) axes[k]?.setAttribute?.({ strokeColor: colors.line, strokeWidth: 1 });
    } catch {
      /* axis theming is best-effort */
    }
    const [bx, by, bz] = bounds;
    /** @param {number[]} pt @param {string} text */
    const label = (pt, text) =>
      view.create("text3d", [pt, text], { strokeColor: colors.ink, fontSize: 15, fixed: true });
    try {
      label([bx[1] + 0.4, 0, 0], opts.xName ?? "x");
      label([0, by[1] + 0.4, 0], opts.yName ?? "y");
      label([0, 0, bz[1] + 0.4], opts.zName ?? "z");
    } catch {
      /* text3d labels are best-effort */
    }
    return view;
  }

  /**
   * Wait for the named 3D chart to be registered, then build. Falls back to a clear message if it
   * never arrives. Idempotent.
   * @param {ShadowRoot} root
   * @param {HTMLElement} stage
   * @param {string} name
   */
  #awaitRegistration(root, stage, name) {
    if (this.#stopWaiting) return;
    this.#stopWaiting = awaitRegistration("primer:chart3d-registered", name, {
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

  /** Stop waiting for a pending registration (if any). */
  #cancelWait() {
    if (this.#stopWaiting) {
      this.#stopWaiting();
      this.#stopWaiting = null;
    }
  }

  /** Unsubscribe from the slider group (before freeing the board) and free the board. */
  #dispose() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    const board = this.#board;
    this.#board = null;
    disposeBoard(this.#jsx, board);
  }
}

if (!customElements.get("primer-chart-3d")) {
  customElements.define("primer-chart-3d", PrimerChart3d);
}
