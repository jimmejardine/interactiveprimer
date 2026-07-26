/**
 * <primer-card> — a content card. The top-level unit of a concept page's body:
 *
 *   <primer-card>
 *     ...paragraphs, <primer-math>, <primer-manim>, <primer-quiz>...
 *   </primer-card>
 *
 * It stays in the light DOM (no shadow root) and simply adopts the shared `.card`
 * class, so its `.card` styling comes from css/primer.css. This matters because a
 * card is slotted into <primer-concept>, and slotted content is styled by the
 * document's stylesheets — not by a component's shadow stylesheet.
 *
 * When speech is available and the card has prose, it also grows a small top-right
 * "read aloud" button that speaks the card and highlights each sentence (see
 * src/read-aloud.ts).
 * @module
 */

import { t } from "../i18n.ts";
import { speechSupported } from "../voice.ts";
import { readCard, stopActiveReader, hasReadableText, type ReadState } from "../read-aloud.ts";

// Inline SVGs (currentColor, decorative) so the icon recolours with the theme and is consistent
// across platforms — unlike the Unicode media glyphs each OS draws differently.
const PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const STOP_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>';

export class PrimerCard extends HTMLElement {
  #built = false;
  #reading = false;

  connectedCallback() {
    this.classList.add("card");
    // connectedCallback can fire again if the card is moved (shell build / overlay swap) — build once.
    if (this.#built) return;
    this.#built = true;
    if (!speechSupported() || !hasReadableText(this)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-readaloud";
    this.#paint(btn, "idle");
    btn.addEventListener("click", () => {
      if (this.#reading) stopActiveReader();
      else readCard(this, (state) => this.#paint(btn, state));
    });
    this.prepend(btn);
  }

  disconnectedCallback() {
    if (this.#reading) stopActiveReader();
  }

  /** Reflect the reader state onto the button (icon + accessible label + pressed state). */
  #paint(btn: HTMLButtonElement, state: ReadState) {
    this.#reading = state === "reading";
    const label = this.#reading ? t("card.stopReading") : t("card.readAloud");
    btn.innerHTML = this.#reading ? STOP_SVG : PLAY_SVG;
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.setAttribute("aria-pressed", String(this.#reading));
  }
}

if (!customElements.get("primer-card")) {
  customElements.define("primer-card", PrimerCard);
}
