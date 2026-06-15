// @ts-check
/**
 * <primer-video src="…" caption="…" title="…"> — an inline YouTube video.
 *
 *   <primer-video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" caption="Watch this"></primer-video>
 *
 * `src` is a YouTube URL (watch / youtu.be / embed / shorts) or a bare 11-char video id.
 * To respect privacy and avoid loading YouTube on page load, it renders a lightweight
 * facade (the video thumbnail + a play button) and only inserts the YouTube <iframe> when
 * the learner clicks — mirroring how <primer-manim> plays on demand. A malformed/missing
 * URL degrades to a plain link instead of a broken embed.
 *
 * i18n: a translation overlay authors its own <primer-video>. Keeping the same `src` pins
 * the English video; setting a different `src` swaps in a localized one. No special markup —
 * the URL is just content the overlay carries (so a changed English URL is flagged for
 * review by scripts/i18n-check.js).
 * @module
 */

import { attachShared } from "./shared.js";
import { t } from "../i18n.js";
import { youtubeId, startSeconds } from "../youtube.js";

/** YouTube's play-button glyph. */
const PLAY_SVG =
  '<svg viewBox="0 0 68 48" width="68" height="48" aria-hidden="true" focusable="false">' +
  '<path d="M66.5 7.7c-.8-2.9-2.5-5.4-5.4-6.2C55.8.1 34 0 34 0S12.2.1 6.9 1.5C4 2.3 2.3 4.8 1.5 7.7.1 13 0 24 0 24s.1 11 1.5 16.3c.8 2.9 2.5 5.4 5.4 6.2C12.2 47.9 34 48 34 48s21.8-.1 27.1-1.5c2.9-.8 4.6-3.3 5.4-6.2C67.9 35 68 24 68 24s-.1-11-1.5-16.3z" fill="#f00"/>' +
  '<path d="M45 24 27 14v20z" fill="#fff"/></svg>';

const STYLE = `
  :host { display: block; }
  .wrap { margin: 1.25rem 0; }
  .frame {
    position: relative; width: 100%; aspect-ratio: 16 / 9;
    border-radius: var(--primer-radius, 0.6rem); overflow: hidden; background: #000;
  }
  .frame iframe, .facade { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  .facade {
    padding: 0; cursor: pointer; display: grid; place-items: center;
    background-color: #000; background-size: cover; background-position: center;
  }
  .facade::after { content: ""; position: absolute; inset: 0; background: rgba(0,0,0,0.18); transition: background 0.1s; }
  .facade:hover::after, .facade:focus-visible::after { background: rgba(0,0,0,0.06); }
  .facade:focus-visible { outline: 3px solid var(--primer-accent, #46e); outline-offset: -3px; }
  .play { position: relative; z-index: 1; width: 68px; height: 48px; filter: drop-shadow(0 1px 4px rgba(0,0,0,0.4)); opacity: 0.92; }
  .facade:hover .play { opacity: 1; }
  .caption { margin: 0.4rem 0 0; }
`;

export class PrimerVideo extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    const src = this.getAttribute("src") ?? "";
    const caption = this.getAttribute("caption") ?? "";
    const title = this.getAttribute("title") || caption || "YouTube";
    const id = youtubeId(src);

    if (!id) {
      // Degrade gracefully: a clear message, plus the raw link if we have one.
      const link = src ? ` <a href="${esc(src)}" target="_blank" rel="noopener">${esc(src)}</a>` : "";
      root.innerHTML = `<div class="wrap"><div class="card"><p class="meta">${t("video.unavailable")}${link}</p></div></div>`;
      return;
    }

    const start = startSeconds(src);
    const label = caption ? `${t("video.play")} — ${esc(caption)}` : t("video.play");
    root.innerHTML = `
      <style>${STYLE}</style>
      <div class="wrap">
        <div class="frame">
          <button type="button" class="facade" aria-label="${label}"
            style="background-image:url('https://i.ytimg.com/vi/${id}/hqdefault.jpg')">
            <span class="play">${PLAY_SVG}</span>
          </button>
        </div>
        ${caption ? `<p class="meta caption">${esc(caption)}</p>` : ""}
      </div>`;

    const frame = /** @type {HTMLElement} */ (root.querySelector(".frame"));
    const facade = /** @type {HTMLButtonElement} */ (root.querySelector(".facade"));
    facade.addEventListener("click", () => {
      const iframe = document.createElement("iframe");
      const params = `autoplay=1&rel=0${start ? `&start=${start}` : ""}`;
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?${params}`;
      iframe.title = title;
      iframe.allow = "autoplay; encrypted-media; picture-in-picture; web-share; fullscreen";
      iframe.allowFullscreen = true;
      iframe.loading = "lazy";
      frame.replaceChildren(iframe);
    });
  }
}

/** @param {string} s */
function esc(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      /** @type {Record<string, string>} */ ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

if (!customElements.get("primer-video")) {
  customElements.define("primer-video", PrimerVideo);
}
