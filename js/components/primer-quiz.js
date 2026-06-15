// @ts-check
/**
 * <primer-quiz count="3"> — a randomly generated test. The question bank is authored
 * inline, as a child `<script type="application/json">` array. A question is either:
 *
 *   - multiple-choice — has `options`:
 *       { "prompt": "What is $2 + 3$?", "options": [ { "text": "$5$", "correct": true }, … ] }
 *   - free-text — has `answer` (the learner types into a box). With `variables` it's a
 *     randomized template: `{name}` placeholders in the prompt expand to random values
 *     and `answer` is an expression over them (see js/quiz-vars.js):
 *       { "prompt": "What is ${a} + {b}$?", "variables": "a=[1:10] b=[1:10]", "answer": "a + b" }
 *
 * `count` questions are drawn via the pure logic in js/quiz.js (a variable template can
 * be re-instantiated to produce many questions). Prompts/options may contain LaTeX
 * (wrapped in $…$), typeset with KaTeX.
 * @module
 */

import katex from "katex";
import { attachShared } from "./shared.js";
import { generateQuiz } from "../quiz.js";
import { checkAnswer } from "../quiz-vars.js";
import { t } from "../i18n.js";

/** @typedef {import("../types/domain.js").AuthoredQuestion} AuthoredQuestion */
/** @typedef {import("../types/domain.js").GeneratedQuiz} GeneratedQuiz */
/** @typedef {import("../types/domain.js").GeneratedQuestion} GeneratedQuestion */

export class PrimerQuiz extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    const count = Number(this.getAttribute("count") ?? "3");

    // The question bank is authored inline, as a child <script type="application/json">.
    const bankEl = this.querySelector(':scope > script[type="application/json"]');
    if (!bankEl || !bankEl.textContent) {
      root.innerHTML = `<div class="card"><p class="meta">${t("quiz.empty")}</p></div>`;
      return;
    }

    /** @type {GeneratedQuiz} */
    let quiz;
    try {
      const bank = /** @type {AuthoredQuestion[]} */ (JSON.parse(bankEl.textContent));
      quiz = generateQuiz(bank, count, Math.random);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      root.innerHTML = `<div class="card"><p class="meta">${t("quiz.buildError", { error })}</p></div>`;
      return;
    }

    this.#render(root, quiz);
  }

  /**
   * @param {ShadowRoot} root
   * @param {GeneratedQuiz} quiz
   */
  #render(root, quiz) {
    /** @param {GeneratedQuestion} q @param {number} qi */
    const item = (q, qi) => {
      if (q.kind === "text") {
        return `
          <li class="q">
            <p class="prompt">${tex(q.prompt)}</p>
            <input type="text" class="answer" name="q${qi}" autocomplete="off" inputmode="text"
              aria-label="${t("quiz.answerPlaceholder")}" placeholder="${t("quiz.answerPlaceholder")}"
              style="font: inherit; padding: 0.35rem 0.5rem; border: 1px solid var(--primer-border, #ccc); border-radius: 0.4rem; background: var(--primer-surface, #fff); color: var(--primer-ink, #111);">
          </li>`;
      }
      return `
        <li class="q">
          <p class="prompt">${tex(q.prompt)}</p>
          <div class="options">
            ${q.options
              .map(
                (opt, oi) => `
                  <label class="option">
                    <input type="radio" name="q${qi}" value="${oi}">
                    <span>${tex(opt.text)}</span>
                  </label>`,
              )
              .join("")}
          </div>
        </li>`;
    };
    const items = quiz.questions.map(item).join("");

    // This KaTeX output lives in the shadow root, which the page-level katex.min.css
    // can't reach; clone that stylesheet link in so the math is laid out (the fonts
    // themselves still resolve via the document-level link).
    const katexHref =
      /** @type {HTMLLinkElement | null} */ (
        document.querySelector('link[rel="stylesheet"][href*="katex"]')
      )?.href ?? "";
    root.innerHTML = `
      ${katexHref ? `<link rel="stylesheet" href="${katexHref}">` : ""}
      <form class="card quiz">
        <h2 style="margin-top:0;">${t("quiz.heading")}</h2>
        <ol class="questions" style="list-style:none; padding:0;">${items}</ol>
        <button type="submit">${t("quiz.check")}</button>
        <p class="result meta" role="status" aria-live="polite"></p>
      </form>`;

    const form = /** @type {HTMLFormElement} */ (root.querySelector("form"));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.#grade(root, quiz);
    });
  }

  /**
   * @param {ShadowRoot} root
   * @param {GeneratedQuiz} quiz
   */
  #grade(root, quiz) {
    let score = 0;
    const questionEls = root.querySelectorAll(".q");
    quiz.questions.forEach((q, qi) => {
      let correct = false;
      if (q.kind === "text") {
        const input = /** @type {HTMLInputElement | null} */ (
          root.querySelector(`input[name="q${qi}"]`)
        );
        correct = input !== null && checkAnswer(q.expected, input.value);
      } else {
        const chosen = /** @type {HTMLInputElement | null} */ (
          root.querySelector(`input[name="q${qi}"]:checked`)
        );
        correct = chosen !== null && Number(chosen.value) === q.correctIndex;
      }
      if (correct) score++;
      const el = questionEls[qi];
      el?.classList.toggle("right", correct);
      el?.classList.toggle("wrong", !correct);
    });
    const result = /** @type {HTMLElement} */ (root.querySelector(".result"));
    result.textContent = t("quiz.score", { score, total: quiz.questions.length });
  }
}

/**
 * Render a string that may contain inline LaTeX spans delimited by $…$. Each math
 * span is typeset with KaTeX; the text around the spans is escaped as plain text. So
 * "What is $2 + 3$?" renders the "2 + 3" as math and leaves the rest as prose.
 * @param {string} text
 * @returns {string}
 */
function tex(text) {
  const re = /\$([^$]+)\$/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index));
    try {
      out += katex.renderToString(m[1], { throwOnError: false });
    } catch {
      out += escapeHtml(m[0]);
    }
    last = re.lastIndex;
  }
  out += escapeHtml(text.slice(last));
  return out;
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    /** @type {Record<string,string>} */ ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c],
  );
}

if (!customElements.get("primer-quiz")) {
  customElements.define("primer-quiz", PrimerQuiz);
}
