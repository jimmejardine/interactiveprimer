// @ts-check
/**
 * <primer-chart scene="name"> — mounts a registered manim-web CHART (a plotted function on
 * axes). Two modes, driven by an optional inline config:
 *
 *   - STATIC (no config): the chart is drawn once and stands still. This is what the quiz
 *     uses to render a sine graph as a multiple-choice OPTION.
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
 * Unlike <primer-manim> (which plays an animation behind a Play button), a chart has no
 * controls of its own beyond the parameter inputs and renders immediately. manim-web is
 * imported lazily, so a page with no chart pays nothing.
 *
 * The chart builder (see js/scenes.js `registerChart`) creates its Scene + Axes ONCE and
 * returns an `update(params)`; we reuse that one Scene for every re-plot, so dragging a
 * slider doesn't churn WebGL contexts. On disconnect we dispose the Scene to free its
 * context (so the quiz's "Try again" and page navigation don't exhaust the browser's limit).
 * @module
 */

import { attachShared } from "./shared.js";
import { getChart } from "../scenes.js";
import { vizColors } from "../theme.js";
import { t } from "../i18n.js";

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
  /** @type {any} The active manim Scene (captured for disposal). */
  #scene = null;
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
    root.innerHTML = `
      <style>
        .chart { padding: 0; }
        /* manim-web renders into a 7:4 world frame; the stage MUST carry that aspect or the
           plot is squashed/clipped (mirrors <primer-manim>). */
        .stage { width: 100%; aspect-ratio: 7 / 4; display: grid; place-items: center; overflow: hidden; background: var(--primer-viz-bg, #fff); border-radius: var(--primer-radius, 0.6rem); }
        .stage canvas, .stage img { display: block; width: 100% !important; height: 100% !important; object-fit: contain; }

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
   * (Re)build the chart: dispose any prior Scene, lazy-load manim, run the registered
   * builder to get a fresh `update`, and draw the current values once.
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
    try {
      const manim = await import("manim-web");
      this.#update = builder(stage, this.#wrapManim(manim));
      this.#update({ ...this.#values });
      // A static chart (no controls) never changes — freeze it to an <img> and release the
      // live WebGL context. Each manim Scene holds one context and browsers cap them (~16), so
      // a page with many static charts (e.g. a quiz with chart options) would otherwise exhaust
      // them. Interactive charts keep their live canvas so the controls stay responsive.
      if (this.#params.length === 0) this.#freezeToImage(stage);
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

  /**
   * Snapshot the drawn chart to an <img> and release its WebGL context. Forces one synchronous
   * render so the read-back captures the current frame (the drawing buffer is cleared after the
   * browser composites, so we must read it in the same task). If the snapshot fails, the live
   * canvas is left in place.
   * @param {HTMLElement} stage
   */
  #freezeToImage(stage) {
    const scene = this.#scene;
    const canvas = /** @type {HTMLCanvasElement | null} */ (stage.querySelector("canvas"));
    if (!scene || !canvas) return;
    let url;
    try {
      scene.render?.();
      url = canvas.toDataURL("image/png");
    } catch {
      return; // tainted/unsupported — keep the live canvas
    }
    if (!url || url.length < 64) return; // empty data URL — keep the live canvas
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.decoding = "async";
    this.#dispose(); // free the context now that the picture is captured
    stage.replaceChildren(img);
  }

  /** Best-effort tear down the active Scene AND release its WebGL context. */
  #dispose() {
    const scene = this.#scene;
    this.#scene = null;
    this.#update = null;
    if (!scene) return;
    try {
      scene.stop?.();
      const renderer = scene.renderer;
      // three.js dispose() frees GPU memory but NOT the WebGL context; explicitly lose it so the
      // browser reclaims the slot (else many charts trip the "too many active contexts" limit).
      renderer?.forceContextLoss?.();
      renderer?.dispose?.();
      const gl = renderer?.getContext?.() ?? renderer?.gl ?? renderer?.context;
      gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
      scene.dispose?.();
    } catch {
      /* best-effort */
    }
  }

  /**
   * Return a copy of the manim namespace whose `Scene` captures its instance on this element
   * (for disposal) and defaults to the theme background — mirrors <primer-manim>'s wrap.
   * @param {Record<string, any>} manim
   * @returns {Record<string, any>}
   */
  #wrapManim(manim) {
    const self = this;
    const bg = vizColors().bg;
    const BaseScene = manim.Scene;
    class CapturingScene extends BaseScene {
      /** @param {...any} args */
      constructor(...args) {
        const [container, options] = args;
        const opts = options && typeof options === "object" ? options : {};
        super(container, { backgroundColor: bg, ...opts });
        self.#scene = this;
      }
    }
    return { ...manim, Scene: CapturingScene };
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
