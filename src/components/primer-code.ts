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

import { attachShared } from "./shared.ts";
import { themeColors } from "../theme.ts";
import { t } from "../i18n.ts";
import { highlight, dedent, esc } from "../code-highlight.ts";
import { CODE_EDITOR_CSS } from "./code-editor-css.ts";
import { transpileTs } from "../transpile.ts";
import { getQuickJs } from "../quickjs.ts";
import { runJs } from "../run-js.ts";

export class PrimerCode extends HTMLElement {
  #onTheme: (() => void) | null = null;
  #code: string = "";
  #lang: string = "typescript";
  #running: boolean = false;

  connectedCallback() {
    const lang = this.getAttribute("lang") || "typescript";
    // Runnable = opt-in `run` attribute, and only for JS/TS (which the sandbox can execute).
    const runnable = this.hasAttribute("run") && /^(typescript|ts|javascript|js)$/.test(lang);
    const code = dedent(this.textContent || "");
    this.#code = code;
    this.#lang = lang;
    const root = this.shadowRoot ?? attachShared(this);
    root.innerHTML = `
      <style>
        :host { display: block; margin: 0.9rem 0; }
        /* the static (non-runnable) panel */
        .panel { margin: 0; padding: 0.7rem 0.95rem; overflow-x: auto;
          background: var(--code-bg, var(--primer-viz-bg, #fff));
          color: var(--code-ink, var(--primer-ink, #111));
          border: 1px solid var(--primer-border, #e6e0d4);
          border-radius: var(--primer-radius, 0.6rem);
          box-shadow: inset 0 0 0 1px var(--primer-border, #e6e0d4); }
        code { font-family: var(--primer-font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
          font-size: 0.9rem; line-height: 1.55; white-space: pre; tab-size: 4; }
        /* the runnable editor chrome (toolbar/gutter/editor/output + token colours) is shared with
           <primer-program> — see js/components/code-editor-css.js */
        ${CODE_EDITOR_CSS}
      </style>
      <div class="wrap">
        ${runnable
          ? `<div class="runner">
               <div class="bar">
                 <span class="eyebrow-label">${esc(t("code.label"))}</span>
                 <span class="spacer"></span>
                 <button class="reset" type="button" title="${esc(t("code.resetTitle"))}">${esc(t("program.reset"))}</button>
                 <button class="run" type="button">▶ ${esc(t("program.run"))}</button>
               </div>
               <div class="editor">
                 <div class="gutter" aria-hidden="true">1</div>
                 <div class="code-wrap">
                   <pre aria-hidden="true"><code></code></pre>
                   <textarea class="input" spellcheck="false" autocapitalize="off" autocomplete="off"
                     aria-label="${esc(t("code.editAria"))}"></textarea>
                 </div>
               </div>
               <div class="out-head">${esc(t("program.outputLabel"))}</div>
               <pre class="output out-pane"><span class="muted">▶ ${esc(t("code.press"))}</span></pre>
             </div>`
          : `<pre class="panel code-pane"><code></code></pre>`}
      </div>`;
    (root.querySelector("code") as HTMLElement).innerHTML = highlight(code, lang);
    this.#applyColors();
    this.#onTheme = () => this.#applyColors();
    document.addEventListener("theme-change", this.#onTheme);

    if (runnable) {
      const ta = root.querySelector(".input") as HTMLTextAreaElement;
      ta.value = code;
      this.#renderGutter();
      ta.addEventListener("input", () => this.#renderHighlight());
      ta.addEventListener("scroll", () => this.#syncScroll());
      ta.addEventListener("keydown", (e) => this.#onKey(e));
      root.querySelector(".reset")?.addEventListener("click", () => this.#reset());
      root.querySelector(".run")?.addEventListener("click", () => void this.#run());
    }
  }

  /** Re-highlight the visible layer from the current textarea contents (called on every edit). */
  #renderHighlight() {
    const root = this.shadowRoot;
    if (!root) return;
    const ta = root.querySelector(".input") as HTMLTextAreaElement;
    (root.querySelector(".editor pre code") as HTMLElement).innerHTML = highlight(ta.value, this.#lang);
    this.#renderGutter();
    this.#syncScroll();
  }

  /** Fill the left gutter with one line number per line of the current source. */
  #renderGutter() {
    const root = this.shadowRoot;
    if (!root) return;
    const ta = root.querySelector(".input") as HTMLTextAreaElement;
    const gutter = root.querySelector(".gutter") as HTMLElement;
    if (!ta || !gutter) return;
    const lines = ta.value.split("\n").length;
    let s = "1";
    for (let i = 2; i <= lines; i++) s += "\n" + i;
    gutter.textContent = s;
  }

  /** Keep the highlight layer scrolled in lockstep with the (scrollable) textarea. */
  #syncScroll() {
    const root = this.shadowRoot;
    if (!root) return;
    const ta = root.querySelector(".input") as HTMLTextAreaElement;
    const pre = root.querySelector(".code-wrap > pre") as HTMLElement;
    if (ta && pre) {
      pre.scrollLeft = ta.scrollLeft;
      pre.scrollTop = ta.scrollTop;
    }
  }

  /** Tab inserts two spaces (so indenting code doesn't jump focus out of the editor). */
  #onKey(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const ta = e.target as HTMLTextAreaElement;
    const s = ta.selectionStart;
    ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = s + 2;
    this.#renderHighlight();
  }

  /** Restore the original source. */
  #reset() {
    const root = this.shadowRoot;
    if (!root) return;
    const ta = root.querySelector(".input") as HTMLTextAreaElement;
    ta.value = this.#code;
    this.#renderHighlight();
    ta.focus();
  }

  disconnectedCallback() {
    if (this.#onTheme) document.removeEventListener("theme-change", this.#onTheme);
    this.#onTheme = null;
  }

  /** Transpile (if TS) → load the sandbox → run → show the captured output (always visible below the code). */
  async #run() {
    if (this.#running) return;
    const root = this.shadowRoot;
    if (!root) return;
    const out = root.querySelector(".out-pane") as HTMLElement;
    const btn = root.querySelector(".run") as HTMLButtonElement;
    this.#running = true;
    btn.disabled = true;
    out.innerHTML = `<span class="muted">${esc(t("program.running"))}</span>`;
    try {
      const src = (root.querySelector(".input") as HTMLTextAreaElement).value;
      const js = this.#lang.startsWith("t") ? await transpileTs(src) : src;
      const mod = await getQuickJs();
      if (!mod) {
        out.innerHTML = `<span class="err">${esc(t("program.loadError"))}</span>`;
        return;
      }
      const res = runJs(mod, js);
      let html = res.output.map(esc).join("\n");
      if (res.error) html += (html ? "\n" : "") + `<span class="err">${esc(res.error)}</span>`;
      if (!html) html = `<span class="muted">${esc(t("code.noOutput"))}</span>`;
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
    const vars: [string, string][] = [
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
