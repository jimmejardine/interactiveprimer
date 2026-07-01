// @ts-check
/**
 * <primer-code lang="javascript"> — a themed, lightly syntax-highlighted code block.
 *
 *   <primer-code>
 *   function greet(name) {
 *     for (let i = 0; i &lt; 3; i++) {
 *       console.log("hi", name);   // say hello three times
 *     }
 *   }
 *   </primer-code>
 *
 * The element's TEXT CONTENT is the source code. It is rendered into a shadow-DOM `<pre>` panel,
 * with a small self-contained tokenizer colouring keywords / builtins / strings / numbers / comments /
 * call-names from the theme palette (`themeColors()`), so the block recolours with the light/dark/fun
 * theme. Leading/trailing blank lines are dropped and the common indent is stripped, so authors can
 * indent the block inside their HTML.
 *
 * `lang`: `javascript`/`js` (default) · `python` · `sql` · `text`/`pseudocode` (no highlighting).
 * **Prefer JavaScript** for code examples — it can run in the browser (future: executable snippets).
 *
 * Authoring caveat: because the body is parsed as HTML, `<`, `>` and `&` in the code MUST be
 * HTML-escaped (`&lt;` `&gt;` `&amp;`) — e.g. `if (x &lt; 10)`.
 * @module
 */

import { themeColors } from "../theme.js";
import { highlight, dedent } from "../code-highlight.js";

export class PrimerCode extends HTMLElement {
  /** @type {(() => void) | null} */
  #onTheme = null;

  connectedCallback() {
    const lang = this.getAttribute("lang") || "javascript";
    const code = dedent(this.textContent || "");
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; margin: 0.9rem 0; }
        .panel { margin: 0; padding: 0.7rem 0.95rem; overflow-x: auto;
          background: var(--code-bg, var(--primer-viz-bg, #fff));
          color: var(--code-ink, var(--primer-ink, #111));
          border: 1px solid var(--primer-border, #e6e0d4);
          border-radius: var(--primer-radius, 0.6rem);
          box-shadow: inset 0 0 0 1px var(--primer-border, #e6e0d4); }
        code { font-family: var(--primer-font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
          font-size: 0.9rem; line-height: 1.55; white-space: pre; tab-size: 4; }
        .k { color: var(--code-k); font-weight: 600; }
        .b { color: var(--code-b); }
        .s { color: var(--code-s); }
        .n { color: var(--code-n); }
        .f { color: var(--code-f); }
        .c { color: var(--code-c); font-style: italic; }
      </style>
      <pre class="panel"><code></code></pre>`;
    const codeEl = /** @type {HTMLElement} */ (root.querySelector("code"));
    codeEl.innerHTML = highlight(code, lang);
    this.#applyColors();
    this.#onTheme = () => this.#applyColors();
    document.addEventListener("theme-change", this.#onTheme);
  }

  disconnectedCallback() {
    if (this.#onTheme) document.removeEventListener("theme-change", this.#onTheme);
    this.#onTheme = null;
  }

  /** Read the theme palette and set the token colours as custom props (custom props inherit into the
   * shadow tree), so the block recolours on a theme change. */
  #applyColors() {
    const c = themeColors();
    /** @type {[string,string][]} */
    const vars = [
      ["--code-bg", c.bg],
      ["--code-ink", c.ink],
      ["--code-k", c.cat[0]],
      ["--code-s", c.cat[1]],
      ["--code-n", c.cat[2]],
      ["--code-f", c.cat[3]],
      ["--code-b", c.cat[4] ?? c.cat[0]],
      ["--code-c", c.line],
    ];
    for (const [k, v] of vars) this.style.setProperty(k, v);
  }
}

if (!customElements.get("primer-code")) {
  customElements.define("primer-code", PrimerCode);
}
