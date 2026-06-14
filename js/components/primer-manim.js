// @ts-check
/**
 * <primer-manim scene="name"> — mounts a registered manim-web animation.
 *
 *   <primer-manim scene="addNumberLine" caption="Adding on a number line">
 *   </primer-manim>
 *
 * The animation is started on demand (a Play button) rather than autoplaying, and
 * manim-web is imported lazily so a page with no animation pays nothing. If the
 * scene is missing or manim-web fails to load, a clear inline message is shown
 * instead of a broken widget.
 * @module
 */

import { attachShared } from "./shared.js";
import { getScene } from "../scenes.js";
import { cancelSpeech } from "../speech.js";

export class PrimerManim extends HTMLElement {
  /** @type {boolean} */
  #played = false;

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    const caption = this.getAttribute("caption") ?? "";
    root.innerHTML = `
      <div class="card">
        <div class="stage" part="stage" style="min-height: 24rem; display: grid; place-items: center;"></div>
        <div class="controls" style="margin-top: 0.75rem; display: flex; gap: 0.75rem; align-items: center;">
          <button type="button" class="play">▶ Play animation</button>
          ${caption ? `<span class="meta">${caption}</span>` : ""}
        </div>
      </div>`;

    const playBtn = /** @type {HTMLButtonElement} */ (root.querySelector(".play"));
    playBtn.addEventListener("click", () => this.#play(root, playBtn));
  }

  /**
   * @param {ShadowRoot} root
   * @param {HTMLButtonElement} playBtn
   */
  async #play(root, playBtn) {
    if (this.#played) return;
    const stage = /** @type {HTMLElement} */ (root.querySelector(".stage"));
    const name = this.getAttribute("scene") ?? "";
    const builder = getScene(name);
    if (!builder) {
      stage.innerHTML = `<span class="meta">No scene registered as “${name}”.</span>`;
      return;
    }
    this.#played = true;
    playBtn.disabled = true;
    playBtn.textContent = "Playing…";
    try {
      const manim = await import("manim-web");
      // Clear any previous render (and stop any prior narration) so replaying doesn't
      // stack a second scene or overlap the old voice with the new run.
      cancelSpeech();
      stage.replaceChildren();
      await builder(stage, manim);
      playBtn.textContent = "↻ Replay";
      playBtn.disabled = false;
      this.#played = false;
    } catch (err) {
      stage.innerHTML =
        `<span class="meta">Couldn't run this animation: ${
          err instanceof Error ? err.message : String(err)
        }</span>`;
      playBtn.textContent = "▶ Play animation";
      playBtn.disabled = false;
      this.#played = false;
    }
  }
}

if (!customElements.get("primer-manim")) {
  customElements.define("primer-manim", PrimerManim);
}
