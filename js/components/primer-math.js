// @ts-check
/**
 * <primer-math> — typesets its text content as LaTeX via KaTeX.
 *
 *   <primer-math>a^2 + b^2 = c^2</primer-math>            inline
 *   <primer-math display>\int_0^1 x\,dx</primer-math>     display (block)
 *
 * The KaTeX font CSS (katex.min.css) must be linked in the page <head> for glyphs
 * to render correctly; this component only injects the markup.
 * @module
 */

import katex from "katex";
import { attachShared } from "./shared.js";

export class PrimerMath extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    const tex = (this.textContent ?? "").trim();
    const display = this.hasAttribute("display");
    let rendered;
    try {
      rendered = katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
      });
    } catch (err) {
      rendered = `<code>${tex}</code>`;
    }
    // KaTeX brings its own font CSS via the page-level link; we just host markup.
    root.innerHTML = `<span class="math">${rendered}</span>`;
  }
}

if (!customElements.get("primer-math")) {
  customElements.define("primer-math", PrimerMath);
}
