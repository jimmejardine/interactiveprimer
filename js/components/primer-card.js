// @ts-check
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
 * @module
 */

export class PrimerCard extends HTMLElement {
  connectedCallback() {
    this.classList.add("card");
  }
}

if (!customElements.get("primer-card")) {
  customElements.define("primer-card", PrimerCard);
}
