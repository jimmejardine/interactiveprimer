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

import { attachShared, PLAY_ICON_SVG, BIG_PLAY_CSS } from "./shared.js";
import { getManimScene } from "../scenes.js";
import { makeStrings } from "../scene-strings.js";
import { speak, cancelSpeech, pauseSpeech, resumeSpeech } from "../speech.js";
import { themeColors } from "../theme.js";
import { t } from "../i18n.js";
import { reportError } from "../report-error.js";

/**
 * Monochrome control icons as inline SVG (24×24, `fill: currentColor`) — they render identically on
 * every platform and recolour with the theme, unlike the Unicode media glyphs (▶ ⏸ ↻) which each OS
 * draws with its own font/emoji (often colour, inconsistent).
 */
const ICON = {
  play: PLAY_ICON_SVG,
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  replay:
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>',
};

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
        this.#scene.renderer.backgroundColor = themeColors().bg;
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
        .stage { position: relative; width: 100%; aspect-ratio: 7 / 4; display: grid; place-items: center; overflow: hidden; background: var(--primer-viz-bg, #fff); border-radius: var(--primer-radius, 0.6rem); box-shadow: inset 0 0 0 1px var(--primer-border, #e6e0d4); }
        /* manim (three.js setSize) writes an inline px width/height on the canvas; override
           it so the canvas always FILLS the responsive 7:4 stage and scales down on narrow
           screens instead of clipping. object-fit:contain preserves aspect (no distortion).
           The drawing-buffer resolution still tracks the stage via manim's autoResize. */
        .stage canvas { display: block; width: 100% !important; height: 100% !important; object-fit: contain; }
        /* "Neon HUD" control strip: a recessed instrument bar holding the icon chip + caption. */
        .controls { margin-top: 0.4rem; display: flex; gap: 0.6rem; align-items: center;
          padding: 0.35rem 0.55rem; border-radius: 0.5rem;
          background: var(--primer-control-bg, #f1ede4); border: 1px solid var(--primer-control-border, #ccc);
          box-shadow: inset 0 1px 0 var(--primer-ring, rgba(70,90,230,0.2)); }
        /* Control button: the SVG icon in a small chip that lights up on hover/focus. */
        .play { display: inline-flex; padding: 0.25rem; border: 1px solid var(--primer-control-border, #ccc);
          border-radius: 0.35rem; background: var(--primer-control-bg, #fff); color: var(--primer-ink, #111);
          cursor: pointer; line-height: 0; transition: border-color 0.12s ease, box-shadow 0.12s ease; }
        .play:hover { border-color: var(--primer-accent, #46e); }
        .play:focus-visible { outline: none; border-color: var(--primer-accent, #46e);
          box-shadow: 0 0 0 2px var(--primer-ring, rgba(70,90,230,0.5)), 0 0 8px var(--primer-ring, rgba(70,90,230,0.4)); }
        .play svg { width: 1.4rem; height: 1.4rem; display: block; }
        /* Big centred play button (shared BIG_PLAY_CSS), shown on the idle stage so it's obvious the
           animation plays. Removed once it first starts (replay uses the small control). */
        ${BIG_PLAY_CSS}
      </style>
      <div class="card frame">
        <div class="stage" part="stage">
          <button type="button" class="big-play" aria-label="${t("manim.play")}" title="${t("manim.play")}">
            <span class="disc">${ICON.play}</span>
          </button>
        </div>
        <div class="controls">
          <button type="button" class="play" aria-label="${t("manim.play")}" title="${t("manim.play")}">${ICON.play}</button>
          ${caption ? `<span class="meta">${caption}</span>` : ""}
        </div>
      </div>`;

    const playBtn = /** @type {HTMLButtonElement} */ (root.querySelector(".play"));
    playBtn.addEventListener("click", () => this.#onClick(root, playBtn));
    // The big centre overlay starts the scene just like the small control (idle → #start).
    root.querySelector(".big-play")?.addEventListener("click", () => this.#onClick(root, playBtn));
  }

  disconnectedCallback() {
    if (this.#onTheme) document.removeEventListener("theme-change", this.#onTheme);
    this.#onTheme = null;
    // Silence a mid-playback removal: stop the narration and (best-effort) halt the scene's
    // render loop — otherwise both keep running against a detached stage.
    cancelSpeech();
    try {
      this.#scene?.pause?.();
    } catch {
      /* best-effort */
    }
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
    face(btn, ICON.play, t("manim.resume"));
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
    face(btn, ICON.pause, t("manim.pause"));
  }

  /**
   * @param {ShadowRoot} root
   * @param {HTMLButtonElement} btn
   */
  async #start(root, btn) {
    const stage = /** @type {HTMLElement} */ (root.querySelector(".stage"));
    const name = this.getAttribute("scene") ?? "";
    const builder = getManimScene(name);
    if (!builder) {
      stage.innerHTML = `<span class="meta">${t("manim.noScene", { name })}</span>`;
      return;
    }

    // Clear any previous render (and stop any prior narration) so replaying doesn't
    // stack a second scene or overlap the old voice with the new run. replaceChildren also
    // drops the big centre play overlay — it only shows on the first idle load.
    cancelSpeech();
    stage.replaceChildren();
    this.#scene = null;
    this.#state = "playing";
    face(btn, ICON.pause, t("manim.pause"));

    try {
      const manim = await import("manim-web");
      // Build the one scene on the stage with the theme backdrop, and capture it so the controls
      // (pause/resume) and the theme-change handler can reach it. Then hand the builder a single
      // toolkit object: the ready-to-use `scene`, the manim namespace, a scene-scoped strings
      // accessor (locale → English → "$$scene.key$$"), and the narration / theme helpers — so a
      // scene imports only `registerManimScene` and never constructs a Scene itself.
      const scene = new manim.Scene(stage, { backgroundColor: themeColors().bg });
      this.#scene = scene;
      await builder({
        scene,
        manim,
        sceneStrings: makeStrings(name),
        speak,
        cancelSpeech,
        themeColors,
      });
      this.#state = "done";
      face(btn, ICON.replay, t("manim.replay"));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      reportError(`primer-manim:${name}`, err);
      stage.innerHTML = `<span class="meta">${t("manim.runError", { error })}</span>`;
      this.#state = "idle";
      face(btn, ICON.play, t("manim.play"));
    }
  }

}

/**
 * Set a control's visible icon plus an accessible label. `icon` is an inline-SVG string (see
 * {@link ICON}), so it's assigned as `innerHTML`; the words live in `aria-label`/`title` only.
 * @param {HTMLButtonElement} btn
 * @param {string} icon
 * @param {string} label
 */
function face(btn, icon, label) {
  btn.innerHTML = icon;
  btn.setAttribute("aria-label", label);
  btn.title = label;
}

if (!customElements.get("primer-manim")) {
  customElements.define("primer-manim", PrimerManim);
}
