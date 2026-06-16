// @ts-check
/**
 * <primer-chart scene="name"> — mounts a registered CHART (a plotted function on axes),
 * rendered with JSXGraph (SVG). Two modes, driven by an optional inline config:
 *
 *   - STATIC (no config): the chart is drawn once and stands still. This is what the quiz
 *     uses to render a graph as a multiple-choice OPTION.
 *
 *       <primer-chart scene="optSin2x"></primer-chart>
 *
 *   - INTERACTIVE (a `params` config): the chart carries sliders + linked number boxes, and
 *     re-plots LIVE as the learner drags or types. Each param has a name, range and default;
 *     the chart builder reads the current values and re-draws the curve.
 *
 *       <primer-chart scene="sinLab">
 *         <script type="application/json">
 *           { "params": [
 *               { "name":"A", "label":"Amplitude (A)", "min":0, "max":3, "step":0.1, "value":1 } ] }
 *         </script>
 *       </primer-chart>
 *
 * The chart builder (see js/scenes.js `registerChart`) creates its JSXGraph board ONCE and
 * returns an `update(params)`; we call it initially, on every control change, and again after a
 * theme change (a rebuild, so axis/curve colours refresh). JSXGraph is imported lazily, so a
 * page with no chart pays nothing.
 *
 * JSXGraph renders SVG — there is no WebGL context (and so no per-browser context cap), no
 * snapshotting and no async-label race. A page can carry as many charts as it likes; we just
 * free each board on disconnect so its resize handlers are released.
 * @module
 */

import { attachShared } from "./shared.js";
import { getChart } from "../scenes.js";
import { vizColors } from "../theme.js";
import { t } from "../i18n.js";

/**
 * JSXGraph's stylesheet. Lazy-fetched once into a constructable sheet and adopted into each
 * chart's shadow root (a document-level <link> can't cross the shadow boundary). Best-effort:
 * the board still renders if it fails to load. Keep the version in step with js/boot.js.
 */
const JSXGRAPH_CSS = "https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/jsxgraph.css";

/** @type {Promise<CSSStyleSheet | null> | null} Shared across all <primer-chart> instances. */
let jsxCssPromise = null;

/**
 * Fetch jsxgraph.css once and wrap it in a constructable stylesheet. Resolves null on any
 * failure (CORS, offline) so a chart never blocks on its stylesheet.
 * @returns {Promise<CSSStyleSheet | null>}
 */
function loadJsxCss() {
  if (!jsxCssPromise) {
    jsxCssPromise = fetch(JSXGRAPH_CSS)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((css) => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        return sheet;
      })
      .catch(() => null);
  }
  return jsxCssPromise;
}

/**
 * @typedef {object} ChartParam
 * @property {string} name    Key passed to the builder's update() (e.g. "A").
 * @property {string} [label] Control label shown to the learner (defaults to `name`).
 * @property {number} min
 * @property {number} max
 * @property {number} [step]  Slider/number step (default 0.1).
 * @property {number} [value] Initial value (default `min`).
 */

export class PrimerChart extends HTMLElement {
  /** @type {ChartParam[]} The interactive controls (empty → static chart). */
  #params = [];
  /** @type {Record<string, number>} Current control values, keyed by param name. */
  #values = {};
  /** @type {((params: Record<string, number>) => void) | null} The builder's re-plot fn. */
  #update = null;
  /** @type {any} The active JSXGraph board (captured for disposal + theme rebuild). */
  #board = null;
  /** @type {any} The JSXGraph namespace (`JXG.JSXGraph`), kept so #dispose can freeBoard. */
  #jsx = null;
  /** @type {number} Pending rAF handle, so rapid input coalesces to one redraw per frame. */
  #raf = 0;
  /** @type {(() => void) | null} */
  #onTheme = null;
  /** @type {(() => void) | null} Tear-down for a pending "wait for scene registration". */
  #stopWaiting = null;

  connectedCallback() {
    // Read the optional params config BEFORE building the shadow root (the inline
    // <script type="application/json"> is light-DOM child content).
    this.#params = this.#readParams();
    for (const p of this.#params) this.#values[p.name] = p.value ?? p.min;

    const root = this.shadowRoot ?? attachShared(this);

    // Adopt JSXGraph's stylesheet into THIS shadow root (it can't reach in from document <head>).
    void loadJsxCss().then((sheet) => {
      if (sheet && this.isConnected && !root.adoptedStyleSheets.includes(sheet)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      }
    });

    root.innerHTML = `
      <style>
        .chart { padding: 0; }
        /* The board fills a 7:4 stage; JSXGraph adds class "jxgbox" to this same element and
           draws the SVG inside it. Keep our themed background (our inline <style> outranks the
           adopted jsxgraph.css .jxgbox rule, which cascades before shadow-root styles). */
        .stage { width: 100%; aspect-ratio: 7 / 4; position: relative; overflow: hidden; background: var(--primer-viz-bg, #fff); border-radius: var(--primer-radius, 0.6rem); }
        .stage.jxgbox { background: var(--primer-viz-bg, #fff); }
        .stage svg { display: block; width: 100% !important; height: 100% !important; }

        /* Parameter controls: one row per param — label, slider, number box. */
        .controls { display: grid; gap: 0.5rem 0.75rem; margin-top: 0.6rem; }
        .control { display: grid; grid-template-columns: minmax(6rem, auto) 1fr minmax(3.5rem, auto); gap: 0.6rem; align-items: center; }
        .control > label { font-family: var(--primer-font-ui, sans-serif); font-size: 0.9rem; color: var(--primer-ink, #111); }
        .control input[type="range"] { width: 100%; accent-color: var(--primer-accent, #46e); }
        .control input[type="number"] {
          font: inherit; width: 100%; padding: 0.25rem 0.4rem; border-radius: 0.4rem;
          border: 1px solid var(--primer-border, #ccc);
          background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
        }
        .meta { display: block; }
      </style>
      <div class="chart">
        <div class="stage" part="stage"></div>
        ${this.#params.length ? `<div class="controls">${this.#controlsHtml()}</div>` : ""}
      </div>`;

    // Keep slider ↔ number box in sync and re-plot (coalesced) on any change.
    if (this.#params.length) {
      const controls = /** @type {HTMLElement} */ (root.querySelector(".controls"));
      controls.addEventListener("input", (e) => this.#onInput(controls, e));
    }

    // Recolour + re-plot when the theme changes (rebuild so axis/curve colours refresh).
    this.#onTheme = () => void this.#build(root);
    document.addEventListener("theme-change", this.#onTheme);

    void this.#build(root);
  }

  disconnectedCallback() {
    if (this.#onTheme) document.removeEventListener("theme-change", this.#onTheme);
    this.#onTheme = null;
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#cancelWait();
    this.#dispose();
  }

  /**
   * Parse the optional inline `<script type="application/json">` config into a param list.
   * A malformed or absent block yields no params (a static chart).
   * @returns {ChartParam[]}
   */
  #readParams() {
    const el = this.querySelector(':scope > script[type="application/json"]');
    if (!el || !el.textContent) return [];
    try {
      const cfg = JSON.parse(el.textContent);
      return Array.isArray(cfg?.params) ? cfg.params : [];
    } catch {
      return [];
    }
  }

  /** @returns {string} The controls markup (one labelled slider + number box per param). */
  #controlsHtml() {
    return this.#params
      .map((p, i) => {
        const step = p.step ?? 0.1;
        const value = this.#values[p.name];
        const label = escapeHtml(p.label ?? p.name);
        // Slider and number share a name via `data-name`; `data-role` distinguishes them.
        return `
          <div class="control">
            <label for="chart-num-${i}">${label}</label>
            <input type="range" data-name="${escapeHtml(p.name)}" data-role="range"
              min="${p.min}" max="${p.max}" step="${step}" value="${value}"
              aria-label="${label}">
            <input type="number" id="chart-num-${i}" data-name="${escapeHtml(p.name)}" data-role="number"
              min="${p.min}" max="${p.max}" step="${step}" value="${value}"
              aria-label="${label}">
          </div>`;
      })
      .join("");
  }

  /**
   * Handle a control edit: read the value, mirror it to the paired input, store it, and
   * schedule a (coalesced) re-plot.
   * @param {HTMLElement} controls
   * @param {Event} e
   */
  #onInput(controls, e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const name = input.dataset.name;
    if (!name) return;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    this.#values[name] = value;
    // Mirror to the sibling control with the same name (slider ↔ number box).
    for (const other of controls.querySelectorAll(`input[data-name="${name}"]`)) {
      if (other !== input) /** @type {HTMLInputElement} */ (other).value = String(value);
    }
    this.#scheduleReplot();
  }

  /** Re-plot at most once per animation frame, so dragging a slider stays smooth. */
  #scheduleReplot() {
    if (this.#raf) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0;
      try {
        this.#update?.({ ...this.#values });
      } catch {
        /* a bad value mid-edit shouldn't break the chart */
      }
    });
  }

  /**
   * (Re)build the chart: dispose any prior board, lazy-load JSXGraph, run the registered
   * builder to get a fresh `update`, and draw the current values once. Static and interactive
   * charts share this one path — JSXGraph is SVG, so there's no per-context bookkeeping.
   * @param {ShadowRoot} root
   */
  async #build(root) {
    const stage = /** @type {HTMLElement} */ (root.querySelector(".stage"));
    const name = this.getAttribute("scene") ?? "";
    const builder = getChart(name);
    if (!builder) {
      // The page's inline `registerChart(...)` is a deferred module script that can run AFTER
      // this element connects (render.js may build the page before it executes). Wait for the
      // registration event rather than failing outright.
      this.#awaitRegistration(root, stage, name);
      return;
    }

    this.#cancelWait();
    this.#dispose();
    stage.replaceChildren();
    stage.removeAttribute("style"); // JSXGraph writes inline sizing onto the container; start clean
    try {
      const mod = await import("jsxgraph");
      if (!this.isConnected) return;
      const JXG = mod.default ?? /** @type {any} */ (mod).JXG ?? mod;
      this.#update = builder(stage, this.#wrapJXG(JXG));
      this.#update({ ...this.#values });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      stage.innerHTML = `<span class="meta">${t("manim.runError", { error })}</span>`;
      this.#update = null;
    }
  }

  /**
   * Wait for the named chart to be registered, then build. Falls back to a clear message if it
   * never arrives (e.g. a typo'd scene name). Idempotent: a second call while waiting is a no-op.
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
      document.removeEventListener("primer:chart-registered", onReg);
      clearTimeout(timer);
    };
    document.addEventListener("primer:chart-registered", onReg);
  }

  /** Stop waiting for a pending registration (if any). */
  #cancelWait() {
    if (this.#stopWaiting) {
      this.#stopWaiting();
      this.#stopWaiting = null;
    }
  }

  /** Best-effort free the active JSXGraph board (releases its resize handlers/SVG). */
  #dispose() {
    const board = this.#board;
    this.#board = null;
    this.#update = null;
    if (!board) return;
    try {
      this.#jsx?.freeBoard?.(board);
    } catch {
      /* best-effort */
    }
  }

  /**
   * Return a copy of the JXG namespace whose `JSXGraph.initBoard` captures the created board on
   * this element (for disposal + theme rebuild) and injects our teaching-graph defaults — mirrors
   * how <primer-manim>/<primer-chart> wrapped manim's Scene.
   * @param {Record<string, any>} JXG
   * @returns {Record<string, any>}
   */
  #wrapJXG(JXG) {
    const self = this;
    const JSXGraph = JXG.JSXGraph;
    self.#jsx = JSXGraph;
    // Sensible defaults for a static teaching graph: no copyright/nav chrome, no pan/zoom, and
    // re-fit on container resize. A builder's own options override these.
    const defaults = {
      showCopyright: false,
      showNavigation: false,
      showInfobox: false,
      pan: { enabled: false },
      zoom: { enabled: false },
      resize: { enabled: true, throttle: 200 },
    };
    // Inherit every JSXGraph member via the prototype chain; override only initBoard.
    const wrappedJSXGraph = Object.create(JSXGraph);
    /** @param {any} box @param {any} [attributes] */
    wrappedJSXGraph.initBoard = (box, attributes) => {
      const board = JSXGraph.initBoard(box, { ...defaults, ...(attributes || {}) });
      self.#board = board;
      return board;
    };
    return Object.assign(Object.create(JXG), { JSXGraph: wrappedJSXGraph });
  }
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    /** @type {Record<string,string>} */ ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c],
  );
}

if (!customElements.get("primer-chart")) {
  customElements.define("primer-chart", PrimerChart);
}
