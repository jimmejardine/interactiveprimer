// @ts-check
/**
 * <primer-code lang="typescript"> — a themed, lightly syntax-highlighted code block, optionally runnable.
 *
 *   <primer-code run>
 *   class Greeter {
 *     constructor(private readonly name: string) {}
 *     greet(): string { return `Hello, ${this.name}!`; }
 *   }
 *   console.log(new Greeter("world").greet());
 *   </primer-code>
 *
 * The element's TEXT CONTENT is the source code. It is rendered into a shadow-DOM `<pre>` panel,
 * with a small self-contained tokenizer colouring keywords / builtins / strings / numbers / comments /
 * call-names from the theme palette (`themeColors()`), so the block recolours with the light/dark/fun
 * theme. Leading/trailing blank lines are dropped and the common indent is stripped, so authors can
 * indent the block inside their HTML.
 *
 * `lang`: `typescript`/`ts` (default) · `javascript`/`js` · `python` · `sql` · `text`/`pseudocode`
 * (no highlighting). **Author code in TypeScript** (a superset of JS — untyped for beginners, typed for
 * OOP/FP).
 *
 * The **`run`** attribute (JS/TS only) adds Code/Output tabs + a Run button: it transpiles the TS to JS
 * (sucrase, js/transpile.js) and runs it in a sandboxed QuickJS-WASM engine (js/quickjs.js + js/run-js.js),
 * both lazy-loaded on first Run, and shows the captured `console` output (no DOM/network; a ~1 s timeout
 * kills infinite loops).
 *
 * Authoring caveat: because the body is parsed as HTML, `<`, `>` and `&` in the code MUST be
 * HTML-escaped (`&lt;` `&gt;` `&amp;`) — e.g. `if (x &lt; 10)`.
 * @module
 */

import { themeColors } from "../theme.js";
import { highlight, dedent, esc } from "../code-highlight.js";
import { transpileTs } from "../transpile.js";
import { getQuickJs } from "../quickjs.js";
import { runJs } from "../run-js.js";

export class PrimerCode extends HTMLElement {
  /** @type {(() => void) | null} */
  #onTheme = null;
  /** @type {string} */
  #code = "";
  /** @type {string} */
  #lang = "typescript";
  /** @type {boolean} */
  #running = false;

  connectedCallback() {
    const lang = this.getAttribute("lang") || "typescript";
    // Runnable = opt-in `run` attribute, and only for JS/TS (which the sandbox can execute).
    const runnable = this.hasAttribute("run") && /^(typescript|ts|javascript|js)$/.test(lang);
    const code = dedent(this.textContent || "");
    this.#code = code;
    this.#lang = lang;
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; margin: 0.9rem 0; }
        [hidden] { display: none; }
        .panel { margin: 0; padding: 0.7rem 0.95rem; overflow-x: auto;
          background: var(--code-bg, var(--primer-viz-bg, #fff));
          color: var(--code-ink, var(--primer-ink, #111));
          border: 1px solid var(--primer-border, #e6e0d4);
          border-radius: var(--primer-radius, 0.6rem);
          box-shadow: inset 0 0 0 1px var(--primer-border, #e6e0d4); }
        .runnable .panel { border-radius: 0 0 var(--primer-radius, 0.6rem) var(--primer-radius, 0.6rem); }
        code { font-family: var(--primer-font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
          font-size: 0.9rem; line-height: 1.55; white-space: pre; tab-size: 4; }
        .k { color: var(--code-k); font-weight: 600; }
        .b { color: var(--code-b); }
        .s { color: var(--code-s); }
        .n { color: var(--code-n); }
        .f { color: var(--code-f); }
        .c { color: var(--code-c); font-style: italic; }
        .bar { display: flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.4rem;
          background: var(--primer-control-bg, #f1ede4);
          border: 1px solid var(--primer-control-border, #ccc); border-bottom: 0;
          border-radius: var(--primer-radius, 0.6rem) var(--primer-radius, 0.6rem) 0 0; }
        .tab { font: inherit; font-size: 0.82rem; padding: 0.2rem 0.7rem; cursor: pointer;
          border: 1px solid transparent; border-radius: 0.35rem; background: transparent;
          color: var(--primer-ink-soft, #667); }
        .tab.active { background: var(--code-bg, #fff); color: var(--primer-ink, #111);
          border-color: var(--primer-control-border, #ccc); font-weight: 600; }
        .spacer { flex: 1; }
        .run { font: inherit; font-size: 0.82rem; font-weight: 700; cursor: pointer;
          padding: 0.2rem 0.85rem; border-radius: 0.35rem; border: 1px solid transparent;
          color: var(--primer-accent-ink, #fff); background: var(--primer-accent, #4d5bd1);
          box-shadow: 0 0 8px var(--primer-ring, rgba(70,90,230,0.4)); }
        .run:disabled { opacity: 0.55; cursor: default; box-shadow: none; }
        .output { white-space: pre-wrap; }
        .output .err { color: #e0564f; font-weight: 600; }
        .output .muted { color: var(--code-c); font-style: italic; }
      </style>
      <div class="wrap${runnable ? " runnable" : ""}">
        ${runnable
          ? `<div class="bar">
               <button class="tab code-tab active" type="button">Code</button>
               <button class="tab out-tab" type="button">Output</button>
               <span class="spacer"></span>
               <button class="run" type="button">▶ Run</button>
             </div>`
          : ""}
        <pre class="panel code-pane"><code></code></pre>
        ${runnable
          ? `<pre class="panel output out-pane" hidden><span class="muted">▶ Press Run to see the output</span></pre>`
          : ""}
      </div>`;
    /** @type {HTMLElement} */ (root.querySelector("code")).innerHTML = highlight(code, lang);
    this.#applyColors();
    this.#onTheme = () => this.#applyColors();
    document.addEventListener("theme-change", this.#onTheme);

    if (runnable) {
      root.querySelector(".code-tab")?.addEventListener("click", () => this.#showTab("code"));
      root.querySelector(".out-tab")?.addEventListener("click", () => this.#showTab("out"));
      root.querySelector(".run")?.addEventListener("click", () => void this.#run());
    }
  }

  disconnectedCallback() {
    if (this.#onTheme) document.removeEventListener("theme-change", this.#onTheme);
    this.#onTheme = null;
  }

  /** @param {"code"|"out"} which */
  #showTab(which) {
    const root = this.shadowRoot;
    if (!root) return;
    const code = which === "code";
    /** @type {HTMLElement} */ (root.querySelector(".code-pane")).hidden = !code;
    /** @type {HTMLElement} */ (root.querySelector(".out-pane")).hidden = code;
    root.querySelector(".code-tab")?.classList.toggle("active", code);
    root.querySelector(".out-tab")?.classList.toggle("active", !code);
  }

  /** Transpile (if TS) → load the sandbox → run → show captured output, switching to the Output tab. */
  async #run() {
    if (this.#running) return;
    const root = this.shadowRoot;
    if (!root) return;
    const out = /** @type {HTMLElement} */ (root.querySelector(".out-pane"));
    const btn = /** @type {HTMLButtonElement} */ (root.querySelector(".run"));
    this.#running = true;
    btn.disabled = true;
    out.innerHTML = `<span class="muted">Running…</span>`;
    this.#showTab("out");
    try {
      const js = this.#lang.startsWith("t") ? await transpileTs(this.#code) : this.#code;
      const mod = await getQuickJs();
      if (!mod) {
        out.innerHTML = `<span class="err">Couldn't load the code runner (are you offline?).</span>`;
        return;
      }
      const res = runJs(mod, js);
      let html = res.output.map(esc).join("\n");
      if (res.error) html += (html ? "\n" : "") + `<span class="err">${esc(res.error)}</span>`;
      if (!html) html = `<span class="muted">(no output)</span>`;
      out.innerHTML = html;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.innerHTML = `<span class="err">${esc(msg)}</span>`;
    } finally {
      this.#running = false;
      btn.disabled = false;
    }
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
