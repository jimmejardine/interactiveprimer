// @ts-check
/**
 * <primer-chart scene="name"> — mounts a registered CHART (a plotted function on axes), rendered
 * with JSXGraph (SVG). A chart can come from two authoring paths:
 *
 *   - HIGH-LEVEL `registerCharts(...)` (js/charts.js): the markup is just
 *     `<primer-chart scene="name"></primer-chart>`. The component pulls the chart's TITLE and any
 *     shared SLIDERS from the registered definition. Sliders may be shared across a whole series
 *     (driven by a `<primer-chart-sliders>` panel elsewhere) or inline to a single chart (rendered
 *     here). All attached charts re-plot together when the shared values change.
 *
 *   - LOW-LEVEL `registerChart(...)` + an inline `<script type="application/json">` `params` block:
 *     the legacy path — the component renders the params as sliders and calls the builder's
 *     `update(params)` directly. Still fully supported; inline params take precedence over a group.
 *
 * The builder (see js/scenes.js `registerChart`) creates its JSXGraph board ONCE and returns an
 * `update`; we call it initially, on every control change, and again after a theme change (a
 * rebuild, so axis/curve colours refresh). JSXGraph is imported lazily, so a page with no chart pays
 * nothing. JSXGraph renders SVG — no WebGL context cap — so a page can carry as many charts as it
 * likes; we free each board on disconnect.
 * @module
 */

import { attachShared } from "./shared.js";
import { getChart } from "../scenes.js";
import { themeColors } from "../theme.js";
import { t } from "../i18n.js";
import { SLIDER_PANEL_CSS, mountSliderPanel } from "./slider-panel.js";
import { groupForChart, getSliderGroup, subscribeSliders, setSliderValues, getChartMeta, resolveLegend } from "../charts.js";
import { adoptJsxCss, disposeBoard, wrapBoard } from "./jsx-board.js";

/**
 * @typedef {object} ChartParam
 * @property {string} name    Key passed to the builder's update() (e.g. "A").
 * @property {string} [label] Control label shown to the learner (defaults to `name`).
 * @property {number} min
 * @property {number} max
 * @property {number} [step]  Slider/number step (default 0.1).
 * @property {number} [value] Initial value (default `min`).
 * @property {number[]} [anchors] "Interesting" values drawn as labelled ticks; dragging the slider
 *   near one snaps onto it (see js/chart-snap.js). Out-of-range values are ignored.
 */

export class PrimerChart extends HTMLElement {
  /** @type {ChartParam[]} Inline (legacy) controls; empty when the chart has none / uses a group. */
  #params = [];
  /** @type {Record<string, number>} Current values for the legacy inline-params path. */
  #values = {};
  /** @type {((params: Record<string, number>) => void) | null} The builder's re-plot fn. */
  #update = null;
  /** @type {any} The active JSXGraph board (captured for disposal + theme rebuild). */
  #board = null;
  /** @type {any} The JSXGraph namespace (`JXG.JSXGraph`), kept so #dispose can freeBoard. */
  #jsx = null;
  /** @type {(() => void) | null} */
  #onTheme = null;
  /** @type {(() => void) | null} Tear-down for a pending "wait for chart registration". */
  #stopWaiting = null;
  /** @type {{ destroy: () => void } | null} Mounted slider panel (inline / legacy charts only). */
  #panel = null;
  /** @type {(() => void) | null} Unsubscribe from a shared slider group. */
  #unsubscribe = null;
  /** @type {number} Monotonic build id: a build superseded during its async await aborts. */
  #buildGen = 0;

  connectedCallback() {
    // Read the optional legacy params config BEFORE building the shadow root (the inline
    // <script type="application/json"> is light-DOM child content).
    this.#params = this.#readParams();
    for (const p of this.#params) this.#values[p.name] = p.value ?? p.min;

    const root = this.shadowRoot ?? attachShared(this);

    // Adopt JSXGraph's stylesheet into THIS shadow root (it can't reach in from document <head>).
    adoptJsxCss(root, () => this.isConnected);

    root.innerHTML = `
      <style>
        .chart { padding: 0; }
        .chart-title {
          font-family: var(--primer-font-display, var(--primer-font-body, sans-serif));
          font-size: 1.05rem; font-weight: 600; margin: 0 0 0.5rem; color: var(--primer-ink, #111);
          text-align: center;
        }
        .chart-title[hidden] { display: none; }
        /* The board fills a 7:4 stage; JSXGraph adds class "jxgbox" to this same element and draws
           the SVG inside it. Keep our themed background (our inline <style> outranks the adopted
           jsxgraph.css .jxgbox rule, which cascades before shadow-root styles). */
        .stage { width: 100%; aspect-ratio: 7 / 4; position: relative; overflow: hidden; background: var(--primer-viz-bg, #fff); border-radius: var(--primer-radius, 0.6rem); box-shadow: inset 0 0 0 1px var(--primer-border, #e6e0d4); }
        .stage.jxgbox { background: var(--primer-viz-bg, #fff); }
        .stage svg { display: block; width: 100% !important; height: 100% !important; }
        /* Legend: a centred row of curve swatches + labels, sitting directly under the plot
           (above any sliders). Each swatch is a short line that mirrors its curve's colour and
           solid/dashed style, so the legend can't drift from what's drawn. */
        .legend {
          display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
          gap: 0.4rem 1rem; margin: 0.55rem 0 0;
          font-family: var(--primer-font-ui, sans-serif); font-size: 0.85rem;
          color: var(--primer-ink, #111);
        }
        .legend[hidden] { display: none; }
        .legend .item { display: inline-flex; align-items: center; gap: 0.4rem; }
        .legend .swatch {
          display: inline-block; width: 1.3rem; height: 0;
          border-top: 3px solid currentColor; /* colour set inline per entry */
        }
        .legend .swatch.dashed { border-top-style: dashed; }
        ${SLIDER_PANEL_CSS}
        .meta { display: block; }
      </style>
      <div class="chart">
        <h3 class="chart-title" part="title" hidden></h3>
        <div class="stage" part="stage"></div>
        <div class="legend" part="legend" hidden></div>
        <div class="controls" part="controls"></div>
      </div>`;

    // Recolour + re-plot when the theme changes (rebuild so axis/curve colours refresh).
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
   * Parse the optional inline `<script type="application/json">` config into a param list. A
   * malformed or absent block yields no params (the chart uses a group, or is static).
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

  /**
   * (Re)build the chart: dispose any prior board/panel/subscription, lazy-load JSXGraph, run the
   * registered builder for a fresh `update`, then wire title + controls + the initial draw. Static,
   * inline-slider and shared-slider charts share this one path.
   * @param {ShadowRoot} root
   */
  async #build(root) {
    const stage = /** @type {HTMLElement} */ (root.querySelector(".stage"));
    const name = this.getAttribute("scene") ?? "";
    const builder = getChart(name);
    if (!builder) {
      // The page's inline `registerChart(...)` / `registerCharts(...)` is a deferred module script
      // that can run AFTER this element connects. Wait for the registration event rather than fail.
      this.#awaitRegistration(root, stage, name);
      return;
    }

    this.#cancelWait();
    // Mark this as the latest build. #build is async (it awaits the JSXGraph import), so a rapid
    // second trigger (e.g. a theme-change during load) can start a concurrent build. Without this
    // guard, each would create its own board + slider subscription, leaving orphaned boards — the
    // one `this.#update` drives wouldn't be the one on screen, so the chart only repainted when the
    // visible board was clicked (its own handler redraws it).
    const gen = ++this.#buildGen;
    this.#dispose();
    stage.replaceChildren();
    stage.removeAttribute("style"); // JSXGraph writes inline sizing onto the container; start clean
    try {
      const mod = await import("jsxgraph");
      if (!this.isConnected || gen !== this.#buildGen) return; // superseded by a newer build → abort
      const JXG = mod.default ?? /** @type {any} */ (mod).JXG ?? mod;
      this.#update = builder(stage, this.#wrapJXG(JXG));
      this.#mountTitleAndControls(root, name);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      stage.innerHTML = `<span class="meta">${t("manim.runError", { error })}</span>`;
      this.#update = null;
    }
  }

  /**
   * After the board is built, resolve where this chart's sliders + title come from, render them, and
   * draw the initial state. Three cases:
   *   - legacy inline params → render a local panel; pushes into the builder's update() directly.
   *   - shared slider group  → subscribe (all attached charts re-plot together). The panel is
   *     rendered HERE only for an inline (single-chart) group; a shared group's panel lives in a
   *     `<primer-chart-sliders>` element.
   *   - static (neither)     → just draw once.
   * @param {ShadowRoot} root
   * @param {string} name
   */
  #mountTitleAndControls(root, name) {
    const controls = /** @type {HTMLElement} */ (root.querySelector(".controls"));

    // Title heading (high-level charts carry one in their registered metadata). It may be a thunk
    // (resolved here, at render, so a localized title reflects the active locale even though the
    // chart was registered before the translation overlay applied).
    const rawTitle = getChartMeta(name)?.title;
    const title = (typeof rawTitle === "function" ? rawTitle() : rawTitle) ?? "";
    const heading = /** @type {HTMLElement} */ (root.querySelector(".chart-title"));
    heading.textContent = title;
    heading.hidden = !title;

    // Legend (optional, any chart): a swatch + label per curve, drawn under the plot. Resolved
    // here (at render, with live theme colours) so it re-themes on rebuild and any label thunk
    // reflects the active locale. Runs before the control branches below, which each `return`.
    this.#renderLegend(root, name);

    // Legacy inline params win over any group.
    if (this.#params.length) {
      this.#panel = mountSliderPanel(controls, this.#params, this.#values, (vals) => {
        this.#values = vals;
        try {
          this.#update?.(vals);
        } catch {
          /* a bad value mid-edit shouldn't break the chart */
        }
      });
      this.#update?.({ ...this.#values });
      return;
    }

    // Shared slider group?
    const group = groupForChart(name);
    if (group) {
      const g = getSliderGroup(group);
      // Subscribe so this board re-plots whenever the shared values change. subscribe() draws once
      // immediately, so we do NOT also call #update here.
      this.#unsubscribe = subscribeSliders(group, (vals) => {
        try {
          this.#update?.(vals);
        } catch {
          /* ignore a transient bad value */
        }
      });
      // An inline (single-chart) group renders its panel inside this element; a shared group's panel
      // is owned by a <primer-chart-sliders> element placed elsewhere.
      if (g?.inline) {
        this.#panel = mountSliderPanel(controls, g.defs, g.values, (vals) => setSliderValues(group, vals));
      }
      return;
    }

    // Static chart — one draw, no controls.
    this.#update?.({});
  }

  /**
   * Render this chart's legend (if it declared one) into the `.legend` row under the plot. Each
   * entry is a colour/dash swatch matching its curve, plus the label. Cleared + hidden when the
   * chart has no legend.
   * @param {ShadowRoot} root
   * @param {string} name
   */
  #renderLegend(root, name) {
    const box = /** @type {HTMLElement} */ (root.querySelector(".legend"));
    const meta = getChartMeta(name);
    const entries = resolveLegend(meta?.legend, meta?.line, themeColors());
    box.replaceChildren();
    box.hidden = entries.length === 0;
    for (const { label, color, dashed } of entries) {
      const item = document.createElement("span");
      item.className = "item";
      const swatch = document.createElement("span");
      swatch.className = dashed ? "swatch dashed" : "swatch";
      swatch.style.color = color; // currentColor → the swatch's border
      const text = document.createElement("span");
      text.textContent = label;
      item.append(swatch, text);
      box.appendChild(item);
    }
  }

  /**
   * Wait for the named chart to be registered, then build. Falls back to a clear message if it never
   * arrives (e.g. a typo'd scene name). Idempotent: a second call while waiting is a no-op.
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

  /**
   * Best-effort tear-down: unsubscribe from the slider group (BEFORE the board is freed, so the
   * callback bound to it is gone), destroy the panel, and free the JSXGraph board.
   */
  #dispose() {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#panel?.destroy();
    this.#panel = null;
    const board = this.#board;
    this.#board = null;
    this.#update = null;
    disposeBoard(this.#jsx, board);
  }

  /**
   * Wrap the JXG namespace so `initBoard` injects the shared teaching-graph defaults and captures
   * the created board on this element (for disposal + theme rebuild). See js/components/jsx-board.js.
   * @param {Record<string, any>} JXG
   * @returns {Record<string, any>}
   */
  #wrapJXG(JXG) {
    return wrapBoard(JXG, themeColors(), (board, JSXGraph) => {
      this.#board = board;
      this.#jsx = JSXGraph;
    });
  }
}

if (!customElements.get("primer-chart")) {
  customElements.define("primer-chart", PrimerChart);
}
