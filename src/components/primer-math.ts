/**
 * <primer-math> — typesets its text content as LaTeX via KaTeX.
 *
 *   <primer-math>a^2 + b^2 = c^2</primer-math>            inline
 *   <primer-math display>\int_0^1 x\,dx</primer-math>     display (block)
 *
 * It renders into the LIGHT DOM (no shadow root) on purpose: KaTeX's output relies on
 * the page-level `katex.min.css` (fonts + layout, injected by boot.js), and a document
 * stylesheet cannot reach inside a shadow root. Rendering in the light DOM lets that
 * CSS apply, so inline math stays inline and the hidden MathML copy is hidden (instead
 * of showing up as a duplicate of the rendered math).
 * @module
 */

import katex from "katex";

export class PrimerMath extends HTMLElement {
  /** The original LaTeX source, captured once before KaTeX replaces our contents. */
  #tex: string | null = null;

  connectedCallback() {
    // Capture the source on first connect; on later connects (e.g. when the renderer
    // moves this element into the page shell) our children are already KaTeX output.
    if (this.#tex === null) this.#tex = (this.textContent ?? "").trim();
    const display = this.hasAttribute("display");
    try {
      katex.render(this.#tex, this, { displayMode: display, throwOnError: false });
    } catch {
      this.textContent = this.#tex;
    }
  }
}

if (!customElements.get("primer-math")) {
  customElements.define("primer-math", PrimerMath);
}
