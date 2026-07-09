// @ts-check
/**
 * <primer-program name="…"> — a "write a program" exercise: an editable code sandbox where the learner
 * is handed a random value in the global `INPUT` and must assign their result to the global `ANSWER`.
 *
 *   <primer-program name="sumArray"></primer-program>
 *   <script type="module">
 *     import { registerProgram } from "primer";
 *     registerProgram("sumArray", {
 *       prompt: "Add up all the numbers in the list INPUT.",
 *       variables: "n=[3:6]",
 *       input: (b, rng) => Array.from({ length: b.n }, () => rng.int(1, 9)),
 *       solution: (INPUT) => INPUT.reduce((a, c) => a + c, 0),
 *       starter: "let total = 0;\nfor (const x of INPUT) total += x;\nANSWER = total;",
 *     });
 *   </script>
 *
 * Each attempt (and each **New input**) draws a fresh INPUT from the config's `variables` + `input`, and
 * a reference `ANSWER` from `solution`. The learner's TypeScript is wrapped (js/quiz-program.js), the
 * whole thing transpiled (sucrase, js/transpile.js) and run in the QuickJS sandbox (js/run-js.js); the
 * reported `ANSWER` is deep-compared to the reference (numbers with tolerance; arrays/objects
 * structurally). Embedded in a `<primer-quiz>` (a `{ program: "name" }` question) it exposes an async
 * `check()` and hides its own Check/New-input so the quiz's "Check answers" drives it.
 *
 * The editor mirrors `<primer-code run>` (textarea over a highlighted layer, a line-number gutter),
 * and colours come from `themeColors()` so it recolours with the theme.
 * @module
 */

import { attachShared } from "./shared.js";
import { getProgram } from "../scenes.js";
import { themeColors } from "../theme.js";
import { t } from "../i18n.js";
import { highlight, dedent, esc } from "../code-highlight.js";
import { transpileTs } from "../transpile.js";
import { getQuickJs } from "../quickjs.js";
import { runJs } from "../run-js.js";
import { makeRng } from "../rng.js";
import { parseVariables, drawBindings } from "../quiz-vars.js";
import { buildProgramSource, extractAnswer, compareResult, displayValue } from "../quiz-program.js";
import { reportError } from "../report-error.js";

const INPUT_NAME = "INPUT";
const ANSWER_NAME = "ANSWER";

export class PrimerProgram extends HTMLElement {
  /** @type {(() => void) | null} */ #onTheme = null;
  /** @type {(() => void) | null} */ #stopWaiting = null;
  /** @type {number | null} */ #seed = null;
  /** @type {number} */ #buildGen = 0;
  /** @type {boolean} */ #running = false;
  /** @type {boolean} */ #solved = false;
  /** @type {unknown} The current random INPUT value. */ #input = null;
  /** @type {unknown} The reference ANSWER for the current INPUT. */ #expected = null;
  /** @type {string} The starter code for the current attempt (for Reset). */ #starter = "";

  /** Whether the exercise is currently solved (for the embedding quiz). @returns {boolean} */
  get solved() {
    return this.#solved;
  }

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    root.innerHTML = this.#shellHtml();
    // Static controls — wire once (a rebuild on New input keeps the same shell).
    root.querySelector(".run")?.addEventListener("click", () => void this.#run());
    root.querySelector(".reset")?.addEventListener("click", () => this.#resetCode());
    root.querySelector(".check")?.addEventListener("click", () => void this.check());
    root.querySelector(".refresh")?.addEventListener("click", () => this.refresh());
    const ta = /** @type {HTMLTextAreaElement} */ (root.querySelector(".input"));
    ta.addEventListener("input", () => this.#renderHighlight());
    ta.addEventListener("scroll", () => this.#syncScroll());
    ta.addEventListener("keydown", (e) => this.#onKey(e));
    this.#onTheme = () => this.#applyColors();
    document.addEventListener("theme-change", this.#onTheme);
    this.#applyColors();
    void this.#build(root);
  }

  disconnectedCallback() {
    if (this.#onTheme) document.removeEventListener("theme-change", this.#onTheme);
    this.#onTheme = null;
    this.#stopWaiting?.();
  }

  get #root() {
    return /** @type {ShadowRoot} */ (this.shadowRoot);
  }

  /** The element shell (styles + layout). Rebuilt content (INPUT, starter code) fills into it. */
  #shellHtml() {
    return `
      <style>
        :host { display: block; margin: 0.9rem 0; }
        .prompt { font-family: var(--primer-font-display, sans-serif); font-weight: 700;
          color: var(--primer-ink, #111); margin: 0 0 0.5rem; }
        /* The INPUT readout: "INPUT = [3, 1, 4]" in mono, so the learner sees the data they're handed. */
        .data { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem; margin: 0 0 0.35rem; }
        .data-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
          color: var(--primer-ink-soft, #667); }
        .input-readout { font-family: var(--primer-font-mono, ui-monospace, Menlo, Consolas, monospace);
          font-size: 0.88rem; padding: 0.15rem 0.45rem; border-radius: 0.35rem;
          background: var(--primer-control-bg, #f1ede4); color: var(--primer-ink, #111);
          overflow-x: auto; max-width: 100%; }
        .assign { margin: 0 0 0.5rem; color: var(--primer-ink-soft, #667); font-size: 0.9rem; }
        .assign code { font-family: var(--primer-font-mono, ui-monospace, Menlo, Consolas, monospace); }

        .runner { overflow: hidden;
          background: var(--code-bg, var(--primer-viz-bg, #fff));
          border: 1px solid var(--primer-border, #e6e0d4);
          border-radius: var(--primer-radius, 0.6rem);
          box-shadow: inset 0 0 0 1px var(--primer-border, #e6e0d4); }
        .runner.right { box-shadow: inset 0 0 0 2px var(--primer-ok, #1a8f3c); }
        .runner.wrong { box-shadow: inset 0 0 0 2px var(--primer-bad, #c0392b); }
        .bar { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.5rem;
          background: var(--primer-control-bg, #f1ede4);
          border-bottom: 1px solid var(--primer-border, #e6e0d4); }
        .eyebrow-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em;
          text-transform: uppercase; color: var(--primer-ink-soft, #667); }
        .spacer { flex: 1; }
        .bar button { font: inherit; font-size: 0.82rem; cursor: pointer; padding: 0.2rem 0.7rem;
          border-radius: 0.35rem; border: 1px solid var(--primer-control-border, #ccc);
          background: transparent; color: var(--primer-ink-soft, #667); }
        .bar button:hover { color: var(--primer-ink, #111); }
        .bar .check { font-weight: 700; color: var(--primer-accent-ink, #fff);
          background: var(--primer-accent, #4d5bd1); border-color: transparent; }
        .bar .run { font-weight: 700; color: var(--primer-accent-ink, #fff);
          background: var(--primer-accent, #4d5bd1); border-color: transparent;
          box-shadow: 0 0 8px var(--primer-ring, rgba(70,90,230,0.4)); }
        .bar .run:disabled { opacity: 0.55; cursor: default; box-shadow: none; }
        /* Embedded in a quiz: the quiz's "Check answers" grades it and the question is fixed — hide our
           own Check + New-input (Run + Reset stay, so the learner can test + start over). */
        :host([embedded]) .check, :host([embedded]) .refresh { display: none; }

        .editor { position: relative; display: flex; align-items: stretch; }
        .gutter { flex: 0 0 auto; box-sizing: border-box; padding: 0.7rem 0.5rem;
          font-family: var(--primer-font-mono, ui-monospace, Menlo, Consolas, monospace);
          font-size: 0.9rem; line-height: 1.55; white-space: pre; text-align: right;
          user-select: none; -webkit-user-select: none;
          color: var(--code-c, #999); opacity: 0.75;
          border-right: 1px solid var(--primer-border, #e6e0d4); }
        .code-wrap { position: relative; flex: 1 1 auto; overflow: hidden; }
        .code-wrap > pre, .code-wrap > textarea { margin: 0; box-sizing: border-box; padding: 0.7rem 0.95rem;
          font-family: var(--primer-font-mono, ui-monospace, Menlo, Consolas, monospace);
          font-size: 0.9rem; line-height: 1.55; tab-size: 4; white-space: pre; }
        .code-wrap > pre { position: relative; pointer-events: none; overflow: hidden; color: var(--code-ink, #111); }
        .code-wrap > pre code { font: inherit; padding: 0; white-space: inherit; }
        .code-wrap > textarea { position: absolute; inset: 0; width: 100%; height: 100%; border: 0;
          resize: vertical; min-height: 4.5rem; overflow: auto; scrollbar-width: none; outline: none;
          color: transparent; background: transparent; caret-color: var(--code-ink, #111); }
        .code-wrap > textarea::-webkit-scrollbar { display: none; }
        .code-wrap > textarea:focus-visible { outline: 2px solid var(--primer-ring, #88f); outline-offset: -2px; }
        .k { color: var(--code-k); font-weight: 600; }
        .b { color: var(--code-b); }
        .s { color: var(--code-s); }
        .n { color: var(--code-n); }
        .f { color: var(--code-f); }
        .c { color: var(--code-c); font-style: italic; }

        .out-head { padding: 0.3rem 0.7rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em;
          text-transform: uppercase; color: var(--primer-ink-soft, #667);
          background: var(--primer-control-bg, #f1ede4);
          border-top: 1px solid var(--primer-border, #e6e0d4); }
        .output { margin: 0; padding: 0.7rem 0.95rem; white-space: pre-wrap; overflow: auto;
          color: var(--code-ink, var(--primer-ink, #111));
          font-family: var(--primer-font-mono, ui-monospace, Menlo, Consolas, monospace);
          font-size: 0.9rem; line-height: 1.55; max-height: calc(20 * 1.55 * 0.9rem + 1.4rem); }
        .output .err { color: var(--primer-bad, #e0564f); font-weight: 600; }
        .output .muted { color: var(--code-c); font-style: italic; }
        .output .answer { color: var(--primer-accent, #4d5bd1); font-weight: 600; }

        .feedback { margin: 0.55rem 0 0; min-height: 1.2rem; font-size: 0.95rem; }
        .feedback .ok { color: var(--primer-ok, #1a8f3c); font-weight: 700; }
        .feedback .bad { color: var(--primer-bad, #c0392b); font-weight: 700; }
        .feedback code { font-family: var(--primer-font-mono, ui-monospace, Menlo, Consolas, monospace); }
        .meta { color: var(--primer-ink-soft, #667); }
      </style>
      <div class="prog">
        <p class="prompt"></p>
        <div class="data">
          <span class="data-label">${esc(t("program.receives"))}</span>
          <code class="input-readout"></code>
        </div>
        <p class="assign"></p>
        <div class="runner">
          <div class="bar">
            <span class="eyebrow-label">${esc(t("program.codeLabel"))}</span>
            <span class="spacer"></span>
            <button class="reset" type="button">${esc(t("program.reset"))}</button>
            <button class="refresh" type="button">${esc(t("program.refresh"))}</button>
            <button class="check" type="button">${esc(t("quiz.check"))}</button>
            <button class="run" type="button">▶ ${esc(t("program.run"))}</button>
          </div>
          <div class="editor">
            <div class="gutter" aria-hidden="true">1</div>
            <div class="code-wrap">
              <pre aria-hidden="true"><code></code></pre>
              <textarea class="input" spellcheck="false" autocapitalize="off" autocomplete="off"
                aria-label="${esc(t("program.codeAria"))}"></textarea>
            </div>
          </div>
          <div class="out-head">${esc(t("program.outputLabel"))}</div>
          <pre class="output out-pane"><span class="muted">▶ ${esc(t("program.press"))}</span></pre>
        </div>
        <p class="feedback" role="status" aria-live="polite"></p>
      </div>`;
  }

  /**
   * (Re)build the exercise: resolve the config, draw a fresh INPUT + reference answer, seed the editor.
   * @param {ShadowRoot} root
   */
  async #build(root) {
    const name = this.getAttribute("name") ?? this.getAttribute("scene") ?? "";
    const config = getProgram(name);
    if (!config) {
      this.#awaitRegistration(root, name);
      return;
    }
    this.#stopWaiting?.();
    if (this.#seed === null) this.#seed = (Math.random() * 0x100000000) >>> 0;
    const gen = ++this.#buildGen;
    this.#solved = false;
    try {
      const rng = makeRng(/** @type {number} */ (this.#seed));
      const bindings = config.variables
        ? drawBindings(parseVariables(config.variables), undefined, rng)
        : {};
      this.#input = config.input(bindings, rng);
      this.#expected = config.solution(this.#input, bindings);
      this.#starter = dedent(
        config.starter ?? `// Read ${INPUT_NAME}, compute your result, and assign it to ${ANSWER_NAME}.\n${ANSWER_NAME} = ${INPUT_NAME};`,
      );
      const prompt = typeof config.prompt === "function" ? config.prompt() : config.prompt ?? "";
      if (gen !== this.#buildGen || !this.isConnected) return;
      /** @type {HTMLElement} */ (root.querySelector(".prompt")).textContent = prompt;
      /** @type {HTMLElement} */ (root.querySelector(".input-readout")).textContent =
        `${INPUT_NAME} = ${displayValue(this.#input)}`;
      /** @type {HTMLElement} */ (root.querySelector(".assign")).innerHTML = t("program.assign", {
        name: `<code>${ANSWER_NAME}</code>`,
      });
      const ta = /** @type {HTMLTextAreaElement} */ (root.querySelector(".input"));
      ta.value = this.#starter;
      this.#renderHighlight();
      this.#setRunnerState(null);
      this.#feedback("");
      /** @type {HTMLElement} */ (root.querySelector(".out-pane")).innerHTML =
        `<span class="muted">▶ ${esc(t("program.press"))}</span>`;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      reportError(`primer-program:${this.getAttribute("name") ?? ""}`, err);
      this.#feedback(`<span class="meta">${esc(t("manim.runError", { error }))}</span>`);
    }
  }

  /** Roll a fresh INPUT (new seed) and rebuild. */
  refresh() {
    this.#seed = (Math.random() * 0x100000000) >>> 0;
    void this.#build(this.#root);
  }

  /* ------------------------------ running ----------------------------- */

  /**
   * Transpile + run the learner's program with the current INPUT, returning the captured output and the
   * reported ANSWER. Shared by Run (shows output) and check() (grades ANSWER).
   * @returns {Promise<{ loadError?: true, error?: string, assigned: boolean, value: unknown, output: string[] }>}
   */
  async #execute() {
    const ta = /** @type {HTMLTextAreaElement} */ (this.#root.querySelector(".input"));
    const src = buildProgramSource(this.#input, ta.value);
    const js = await transpileTs(src);
    const mod = await getQuickJs();
    if (!mod) return { loadError: true, assigned: false, value: null, output: [] };
    const res = runJs(mod, js);
    const extracted = extractAnswer(res.output);
    return { error: res.error, assigned: extracted.assigned, value: extracted.value, output: extracted.output };
  }

  /** Render the console output (and, when assigned, the reported ANSWER) into the output pane. */
  #showOutput(/** @type {{ error?: string, assigned: boolean, value: unknown, output: string[] }} */ r) {
    const out = /** @type {HTMLElement} */ (this.#root.querySelector(".out-pane"));
    let html = r.output.map(esc).join("\n");
    if (r.assigned) {
      html += (html ? "\n" : "") + `<span class="answer">${ANSWER_NAME} = ${esc(displayValue(r.value))}</span>`;
    }
    if (r.error) html += (html ? "\n" : "") + `<span class="err">${esc(r.error)}</span>`;
    if (!html) html = `<span class="muted">${esc(t("program.noOutput"))}</span>`;
    out.innerHTML = html;
  }

  /** Run the program and show its output (does not grade). */
  async #run() {
    if (this.#running) return;
    this.#running = true;
    const btn = /** @type {HTMLButtonElement} */ (this.#root.querySelector(".run"));
    const out = /** @type {HTMLElement} */ (this.#root.querySelector(".out-pane"));
    btn.disabled = true;
    out.innerHTML = `<span class="muted">${esc(t("program.running"))}</span>`;
    try {
      const r = await this.#execute();
      if (r.loadError) {
        out.innerHTML = `<span class="err">${esc(t("program.loadError"))}</span>`;
        return;
      }
      this.#showOutput(r);
    } catch (e) {
      out.innerHTML = `<span class="err">${esc(e instanceof Error ? e.message : String(e))}</span>`;
    } finally {
      this.#running = false;
      btn.disabled = false;
    }
  }

  /* ------------------------------ grading ----------------------------- */

  /**
   * Run the program and grade the reported ANSWER against the reference solution. Shows the output too,
   * so the learner sees any prints. Returns whether it's correct (awaited by an embedding quiz).
   * @returns {Promise<boolean>}
   */
  async check() {
    if (this.#running) return this.#solved;
    this.#running = true;
    const btn = /** @type {HTMLButtonElement} */ (this.#root.querySelector(".run"));
    btn.disabled = true;
    try {
      const r = await this.#execute();
      if (r.loadError) {
        this.#feedback(`<span class="bad">${esc(t("program.loadError"))}</span>`);
        return false;
      }
      this.#showOutput(r);
      if (r.error) {
        this.#solved = false;
        this.#setRunnerState(false);
        this.#feedback(`<span class="bad">✗</span> ${esc(t("program.crashed", { error: r.error }))}`);
      } else if (!r.assigned) {
        this.#solved = false;
        this.#setRunnerState(false);
        this.#feedback(`<span class="bad">✗</span> ${esc(t("program.noAnswer", { name: ANSWER_NAME }))}`);
      } else {
        this.#solved = compareResult(this.#expected, r.value);
        this.#setRunnerState(this.#solved);
        if (this.#solved) {
          this.#feedback(
            `<span class="ok">✓</span> ${esc(t("program.correct", { name: ANSWER_NAME, got: displayValue(r.value) }))}`,
          );
        } else {
          this.#feedback(
            `<span class="bad">✗</span> ${esc(
              t("program.wrong", {
                name: ANSWER_NAME,
                got: displayValue(r.value),
                expected: displayValue(this.#expected),
              }),
            )}`,
          );
        }
      }
    } catch (e) {
      this.#solved = false;
      this.#feedback(`<span class="bad">${esc(e instanceof Error ? e.message : String(e))}</span>`);
    } finally {
      this.#running = false;
      btn.disabled = false;
    }
    this.dispatchEvent(new CustomEvent("primer:program-graded", { bubbles: true, detail: { solved: this.#solved } }));
    return this.#solved;
  }

  /** Tint the editor frame green (correct) / red (wrong) / neutral (null). @param {boolean | null} ok */
  #setRunnerState(ok) {
    const runner = /** @type {HTMLElement} */ (this.#root.querySelector(".runner"));
    runner.classList.toggle("right", ok === true);
    runner.classList.toggle("wrong", ok === false);
  }

  /* ------------------------------- editor ----------------------------- */

  /** Restore the starter code for the current INPUT. */
  #resetCode() {
    const ta = /** @type {HTMLTextAreaElement} */ (this.#root.querySelector(".input"));
    ta.value = this.#starter;
    this.#renderHighlight();
    this.#setRunnerState(null);
    this.#feedback("");
    ta.focus();
  }

  /** Re-highlight the visible layer from the textarea contents (on every edit). */
  #renderHighlight() {
    const root = this.shadowRoot;
    if (!root) return;
    const ta = /** @type {HTMLTextAreaElement} */ (root.querySelector(".input"));
    /** @type {HTMLElement} */ (root.querySelector(".editor pre code")).innerHTML = highlight(ta.value, "typescript");
    this.#renderGutter();
    this.#syncScroll();
  }

  /** Fill the gutter with one line number per line of source. */
  #renderGutter() {
    const root = this.shadowRoot;
    if (!root) return;
    const ta = /** @type {HTMLTextAreaElement} */ (root.querySelector(".input"));
    const gutter = /** @type {HTMLElement} */ (root.querySelector(".gutter"));
    if (!ta || !gutter) return;
    const lines = ta.value.split("\n").length;
    let s = "1";
    for (let i = 2; i <= lines; i++) s += "\n" + i;
    gutter.textContent = s;
  }

  /** Keep the highlight layer scrolled in lockstep with the textarea. */
  #syncScroll() {
    const root = this.shadowRoot;
    if (!root) return;
    const ta = /** @type {HTMLTextAreaElement} */ (root.querySelector(".input"));
    const pre = /** @type {HTMLElement} */ (root.querySelector(".code-wrap > pre"));
    if (ta && pre) {
      pre.scrollLeft = ta.scrollLeft;
      pre.scrollTop = ta.scrollTop;
    }
  }

  /** Tab inserts two spaces (so indenting doesn't jump focus out of the editor). @param {KeyboardEvent} e */
  #onKey(e) {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const ta = /** @type {HTMLTextAreaElement} */ (e.target);
    const s = ta.selectionStart;
    ta.value = ta.value.slice(0, s) + "  " + ta.value.slice(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = s + 2;
    this.#renderHighlight();
  }

  /** @param {string} html */
  #feedback(html) {
    const fb = this.#root?.querySelector(".feedback");
    if (fb) fb.innerHTML = html;
  }

  /** @param {ShadowRoot} root @param {string} name */
  #awaitRegistration(root, name) {
    this.#stopWaiting?.();
    const onReg = (/** @type {Event} */ e) => {
      if (/** @type {CustomEvent} */ (e).detail?.name === name) {
        this.#stopWaiting?.();
        void this.#build(root);
      }
    };
    document.addEventListener("primer:program-registered", onReg);
    this.#stopWaiting = () => {
      document.removeEventListener("primer:program-registered", onReg);
      this.#stopWaiting = null;
    };
  }

  /** Read the theme palette and set the code token colours as custom props (they inherit into the
   * shadow tree), so the editor recolours on a theme change. Mirrors <primer-code>. */
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

if (!customElements.get("primer-program")) {
  customElements.define("primer-program", PrimerProgram);
}
