// @ts-check
/**
 * <primer-chart-sliders name="…"> — a standalone slider panel that drives a whole chart SERIES.
 *
 * The slider group is defined in JS with `registerChartSliders(name, defs)` (js/charts.js); this
 * element just marks WHERE on the page the panel renders. Every `<primer-chart>` whose
 * `registerCharts(..., name)` named the same group re-plots together as the learner drags. Placement
 * only — no board, no JSXGraph, no theme rebuild (the controls restyle via CSS custom properties).
 *
 *   <primer-chart-sliders name="wave"></primer-chart-sliders>
 *
 * @module
 */

import { attachShared, awaitRegistration } from "./shared.js";
import { t } from "../i18n.js";
import { SLIDER_PANEL_CSS, mountSliderPanel } from "./slider-panel.js";
import { getSliderGroup, setSliderValues } from "../charts.js";

export class PrimerChartSliders extends HTMLElement {
  /** @type {{ destroy: () => void } | null} */
  #panel = null;
  /** @type {(() => void) | null} Tear-down for a pending "wait for group registration". */
  #stopWaiting = null;

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    root.innerHTML = `<style>${SLIDER_PANEL_CSS}</style><div class="controls" part="controls"></div>`;
    this.#mount(root);
  }

  disconnectedCallback() {
    this.#cancelWait();
    this.#panel?.destroy();
    this.#panel = null;
  }

  /**
   * Render the named group's panel, or wait for it to be registered (the defining script may be a
   * deferred module that runs after this element connects).
   * @param {ShadowRoot} root
   */
  #mount(root) {
    const name = this.getAttribute("name") ?? "";
    const controls = /** @type {HTMLElement} */ (root.querySelector(".controls"));
    const group = getSliderGroup(name);
    if (!group) {
      this.#awaitRegistration(root, controls, name);
      return;
    }
    this.#cancelWait();
    this.#panel?.destroy();
    // The panel writes straight into the shared group; subscribed charts redraw via the broker.
    this.#panel = mountSliderPanel(controls, group.defs, group.values, (vals) => setSliderValues(name, vals));
  }

  /**
   * @param {ShadowRoot} root
   * @param {HTMLElement} controls
   * @param {string} name
   */
  #awaitRegistration(root, controls, name) {
    if (this.#stopWaiting) return;
    this.#stopWaiting = awaitRegistration("primer:chart-sliders-registered", name, {
      onReady: () => {
        this.#cancelWait();
        this.#mount(root);
      },
      onTimeout: () => {
        this.#cancelWait();
        controls.innerHTML = `<span class="meta">${t("manim.noScene", { name })}</span>`;
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
}

if (!customElements.get("primer-chart-sliders")) {
  customElements.define("primer-chart-sliders", PrimerChartSliders);
}
