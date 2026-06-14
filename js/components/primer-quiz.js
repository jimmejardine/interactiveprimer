// @ts-check
/**
 * <primer-quiz src="addition.quiz.json" count="3"> — a randomly generated
 * multiple-choice test. Questions are loaded from a JSON bank (an array of
 * QuizQuestion), then `count` are selected and their options shuffled via the
 * pure logic in js/quiz.js. Question prompts and options may contain LaTeX, which
 * is typeset with KaTeX.
 * @module
 */

import katex from "katex";
import { attachShared } from "./shared.js";
import { generateQuiz } from "../quiz.js";

/** @typedef {import("../types/domain.js").QuizQuestion} QuizQuestion */
/** @typedef {import("../types/domain.js").GeneratedQuiz} GeneratedQuiz */

export class PrimerQuiz extends HTMLElement {
  async connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    const src = this.getAttribute("src");
    const count = Number(this.getAttribute("count") ?? "3");
    root.innerHTML = `<div class="card"><p class="meta">Loading test…</p></div>`;

    if (!src) {
      root.innerHTML = `<div class="card"><p class="meta">No quiz source provided.</p></div>`;
      return;
    }

    /** @type {QuizQuestion[]} */
    let bank;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bank = await res.json();
    } catch (err) {
      root.innerHTML = `<div class="card"><p class="meta">Couldn't load the test (${
        err instanceof Error ? err.message : String(err)
      }).</p></div>`;
      return;
    }

    const quiz = generateQuiz(bank, count, Math.random);
    this.#render(root, quiz);
  }

  /**
   * @param {ShadowRoot} root
   * @param {GeneratedQuiz} quiz
   */
  #render(root, quiz) {
    const items = quiz.questions
      .map(
        (q, qi) => `
          <li class="q" data-correct="${q.correctIndex}">
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
          </li>`,
      )
      .join("");

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
        <h2 style="margin-top:0;">Quick test</h2>
        <ol class="questions" style="list-style:none; padding:0;">${items}</ol>
        <button type="submit">Check answers</button>
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
      const chosen = /** @type {HTMLInputElement | null} */ (
        root.querySelector(`input[name="q${qi}"]:checked`)
      );
      const correct = chosen !== null && Number(chosen.value) === q.correctIndex;
      if (correct) score++;
      const el = questionEls[qi];
      el?.classList.toggle("right", correct);
      el?.classList.toggle("wrong", !correct);
    });
    const result = /** @type {HTMLElement} */ (root.querySelector(".result"));
    result.textContent = `You scored ${score} / ${quiz.questions.length}.`;
  }
}

/**
 * Render a string that may contain LaTeX. For simplicity the whole string is
 * treated as inline math when wrapped in $...$, otherwise as plain text.
 * @param {string} text
 * @returns {string}
 */
function tex(text) {
  const m = text.match(/^\$(.*)\$$/s);
  if (!m) return escapeHtml(text);
  try {
    return katex.renderToString(m[1], { throwOnError: false });
  } catch {
    return escapeHtml(text);
  }
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
