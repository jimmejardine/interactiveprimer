// @ts-check
/**
 * <primer-manim scene="name"> — mounts a registered manim-web animation.
 *
 *   <primer-manim scene="addNumberLine" caption="Adding on a number line">
 *   </primer-manim>
 *
 * The animation is started on demand and manim-web is imported lazily, so a page with
 * no animation pays nothing. The single control cycles Play → Pause/Resume → Replay.
 * If the scene is missing or manim-web fails to load, a clear inline message is shown
 * instead of a broken widget.
 *
 * Pause/Resume work by capturing the manim `Scene` the builder creates: we hand the
 * builder a wrapped manim namespace whose `Scene` records its instance, then call
 * `scene.pause()` / `scene.resume()` (and pause/resume narration alongside).
 * @module
 */

import { attachShared } from "./shared.js";
import { getScene } from "../scenes.js";
import { cancelSpeech, pauseSpeech, resumeSpeech } from "../speech.js";
import { vizColors } from "../theme.js";

export class PrimerManim extends HTMLElement {
  /** @type {"idle" | "playing" | "paused" | "done"} */
  #state = "idle";
  /** @type {any} The active manim Scene (captured when the builder constructs it). */
  #scene = null;
  /** @type {(() => void) | null} */
  #onTheme = null;

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    const caption = this.getAttribute("caption") ?? "";

    // Recolour the live canvas backdrop when the theme changes (shape colours refresh on
    // the next replay; the background is the jarring mismatch, so fix it immediately).
    this.#onTheme = () => {
      if (!this.#scene) return;
      try {
        this.#scene.renderer.backgroundColor = vizColors().bg;
        this.#scene.render();
      } catch {
        /* best-effort */
      }
    };
    document.addEventListener("theme-change", this.#onTheme);

    root.innerHTML = `
      <style>
        /* Tight frame: the canvas should dominate, not a thick border of padding. */
        .card.frame { padding: 0.4rem; }
        /* manim-web renders into a 14×8 world frame (aspect 7:4), and the canvas is
           sized from this container's box. So the stage MUST carry that same aspect
           ratio: on a mismatched box the frame is squashed/clipped and every mobject's
           position and shape comes out wrong. Keep 7/4 in sync with manim's frame. */
        .stage { width: 100%; aspect-ratio: 7 / 4; display: grid; place-items: center; background: var(--primer-viz-bg, #fff); border-radius: var(--primer-radius, 0.6rem); }
        .stage canvas { width: 100%; height: 100%; display: block; }
        .controls { margin-top: 0.4rem; display: flex; gap: 0.75rem; align-items: center; }
      </style>
      <div class="card frame">
        <div class="stage" part="stage"></div>
        <div class="controls">
          <button type="button" class="play" aria-label="Play animation" title="Play animation">▶</button>
          ${caption ? `<span class="meta">${caption}</span>` : ""}
        </div>
      </div>`;

    const playBtn = /** @type {HTMLButtonElement} */ (root.querySelector(".play"));
    playBtn.addEventListener("click", () => this.#onClick(root, playBtn));
  }

  disconnectedCallback() {
    if (this.#onTheme) document.removeEventListener("theme-change", this.#onTheme);
    this.#onTheme = null;
  }

  /**
   * @param {ShadowRoot} root
   * @param {HTMLButtonElement} btn
   */
  #onClick(root, btn) {
    if (this.#state === "playing") return this.#pause(btn);
    if (this.#state === "paused") return this.#resume(btn);
    return void this.#start(root, btn); // idle or done → (re)start
  }

  /** @param {HTMLButtonElement} btn */
  #pause(btn) {
    if (!this.#scene) return; // scene not created yet (still loading) — ignore
    try {
      this.#scene.pause();
    } catch {
      /* best-effort */
    }
    pauseSpeech();
    this.#state = "paused";
    face(btn, "▶", "Resume");
  }

  /** @param {HTMLButtonElement} btn */
  #resume(btn) {
    try {
      this.#scene?.resume();
    } catch {
      /* best-effort */
    }
    resumeSpeech();
    this.#state = "playing";
    face(btn, "⏸", "Pause");
  }

  /**
   * @param {ShadowRoot} root
   * @param {HTMLButtonElement} btn
   */
  async #start(root, btn) {
    const stage = /** @type {HTMLElement} */ (root.querySelector(".stage"));
    const name = this.getAttribute("scene") ?? "";
    const builder = getScene(name);
    if (!builder) {
      stage.innerHTML = `<span class="meta">No scene registered as “${name}”.</span>`;
      return;
    }

    // Clear any previous render (and stop any prior narration) so replaying doesn't
    // stack a second scene or overlap the old voice with the new run.
    cancelSpeech();
    stage.replaceChildren();
    this.#scene = null;
    this.#state = "playing";
    face(btn, "⏸", "Pause");

    try {
      const manim = await import("manim-web");
      await builder(stage, this.#wrapManim(manim));
      this.#state = "done";
      face(btn, "↻", "Replay");
    } catch (err) {
      stage.innerHTML = `<span class="meta">Couldn't run this animation: ${
        err instanceof Error ? err.message : String(err)
      }</span>`;
      this.#state = "idle";
      face(btn, "▶", "Play animation");
    }
  }

  /**
   * Return a copy of the manim namespace whose `Scene` captures its instance on this
   * element, so the controls can pause/resume the running scene. Everything else is
   * passed through unchanged.
   * @param {Record<string, any>} manim
   * @returns {Record<string, any>}
   */
  #wrapManim(manim) {
    const self = this;
    const bg = vizColors().bg; // theme backdrop, passed into every Scene this run
    const BaseScene = manim.Scene;
    class CapturingScene extends BaseScene {
      /** @param {...any} args */
      constructor(...args) {
        // Inject the theme background as the default Scene option (manim's
        // SceneOptions.backgroundColor is a CSS colour string). A scene that sets its
        // own backgroundColor still wins.
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
 * Set a control's visible icon plus an accessible label (the words live in
 * `aria-label`/`title` only, so the button shows just the glyph).
 * @param {HTMLButtonElement} btn
 * @param {string} icon
 * @param {string} label
 */
function face(btn, icon, label) {
  btn.textContent = icon;
  btn.setAttribute("aria-label", label);
  btn.title = label;
}

if (!customElements.get("primer-manim")) {
  customElements.define("primer-manim", PrimerManim);
}
