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
import { glitter, glitterIntensity } from "../glitter.js";
import { playSound } from "../sounds.js";

/** @typedef {import("../types/domain.js").AuthoredQuestion} AuthoredQuestion */
/** @typedef {import("../types/domain.js").GeneratedQuiz} GeneratedQuiz */
/** @typedef {import("../types/domain.js").GeneratedQuestion} GeneratedQuestion */

export class PrimerQuiz extends HTMLElement {
  /** @type {AuthoredQuestion[]} The authored bank, kept so "Try again" can re-draw a fresh quiz. */
  #bank = [];
  /** @type {number} How many questions to draw. */
  #count = 3;

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    this.#count = Number(this.getAttribute("count") ?? "3");

    // The question bank is authored inline, as a child <script type="application/json">.
    const bankEl = this.querySelector(':scope > script[type="application/json"]');
    if (!bankEl || !bankEl.textContent) {
      root.innerHTML = `<div class="card"><p class="meta">${t("quiz.empty")}</p></div>`;
      return;
    }
    try {
      this.#bank = /** @type {AuthoredQuestion[]} */ (JSON.parse(bankEl.textContent));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      root.innerHTML = `<div class="card"><p class="meta">${t("quiz.buildError", { error })}</p></div>`;
      return;
    }
    this.#start(root);
  }

  /**
   * Draw a fresh random quiz from the authored bank and render it. Called on first
   * connect and again from the scorecard's "Try again" button.
   * @param {ShadowRoot} root
   */
  #start(root) {
    /** @type {GeneratedQuiz} */
    let quiz;
    try {
      quiz = generateQuiz(this.#bank, this.#count, Math.random);
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
            <div class="answer-row">
              <input type="text" class="answer" name="q${qi}" autocomplete="off" inputmode="text"
                aria-label="${t("quiz.answerPlaceholder")}" placeholder="${t("quiz.answerPlaceholder")}">
            </div>
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
      <style>
        .quiz button[type="submit"][disabled] { opacity: 0.5; cursor: not-allowed; }
        /* Confine the high-score glitter to this panel. */
        .quiz { position: relative; overflow: hidden; }
        .glitter { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; }

        /* Free-text answer box (class state can recolour the border after marking). */
        .answer-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
        .answer {
          font: inherit; padding: 0.35rem 0.5rem; border-radius: 0.4rem;
          border: 1px solid var(--primer-border, #ccc);
          background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
        }
        .answer.right { border-color: var(--primer-ok, #1a8f3c); color: var(--primer-ok, #1a8f3c); background: var(--primer-ok-bg, #e6f6ec); }
        .answer.wrong { border-color: var(--primer-bad, #c0392b); color: var(--primer-bad, #c0392b); background: var(--primer-bad-bg, #fdecea); }

        /* Result mark beside a text box: green tick if right, red cross if wrong. */
        .ok-mark { color: var(--primer-ok, #1a8f3c); font-weight: 700; }
        .bad-mark { color: var(--primer-bad, #c0392b); font-weight: 700; }
        .correct-answer {
          font: inherit; padding: 0.35rem 0.5rem; border-radius: 0.4rem;
          border: 1px solid var(--primer-ok, #1a8f3c); color: var(--primer-ok, #1a8f3c);
          background: var(--primer-ok-bg, #e6f6ec);
        }

        /* Multiple-choice feedback after marking. */
        .option { display: flex; gap: 0.4rem; align-items: center; padding: 0.15rem 0.45rem; border-radius: 0.4rem; }
        .option.correct { background: var(--primer-ok-bg, #e6f6ec); color: var(--primer-ok, #1a8f3c); box-shadow: inset 0 0 0 1px var(--primer-ok, #1a8f3c); }
        .option.chosen-wrong { background: var(--primer-bad-bg, #fdecea); color: var(--primer-bad, #c0392b); box-shadow: inset 0 0 0 1px var(--primer-bad, #c0392b); }

        /* Results scorecard — replaces the Check-answers button once graded. */
        .scorecard { display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; animation: scorecard-pop 0.35s ease both; }
        .scorecard .ring {
          --pct: 0; flex: none; width: 4.5rem; height: 4.5rem; border-radius: 50%;
          display: grid; place-items: center;
          background:
            radial-gradient(closest-side, var(--primer-surface, #fff) 72%, transparent 73%),
            conic-gradient(var(--ring, var(--primer-accent, #5b6ee1)) calc(var(--pct) * 1%), var(--primer-border, #ddd) 0);
        }
        .scorecard .ring .pct { font-family: var(--primer-font-display, sans-serif); font-weight: 700; font-size: 1.2rem; color: var(--primer-ink, #111); }
        .scorecard .msg { margin: 0; font-family: var(--primer-font-display, sans-serif); font-size: 1.3rem; }
        .scorecard .retry { margin-left: auto; }
        @keyframes scorecard-pop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .scorecard { animation: none; } }
      </style>
      <form class="card quiz">
        <h2 style="margin-top:0;">${t("quiz.heading")}</h2>
        <ol class="questions" style="list-style:none; padding:0;">${items}</ol>
        <div class="result-area" role="status" aria-live="polite">
          <button type="submit" disabled>${t("quiz.check")}</button>
        </div>
      </form>`;

    const form = /** @type {HTMLFormElement} */ (root.querySelector("form"));
    const submit = /** @type {HTMLButtonElement} */ (root.querySelector('button[type="submit"]'));

    // "Check answers" is enabled only once the learner has answered something — so a blank
    // submission (and its "0 / N") can never happen. Any checked option or non-empty text box
    // counts; clearing them all disables it again.
    const anyAnswered = () =>
      root.querySelector('input[type="radio"]:checked') !== null ||
      [...root.querySelectorAll("input.answer")].some(
        (el) => /** @type {HTMLInputElement} */ (el).value.trim() !== "",
      );
    const syncSubmit = () => {
      submit.disabled = !anyAnswered();
    };
    form.addEventListener("input", syncSubmit);
    form.addEventListener("change", syncSubmit);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.#grade(root, quiz);
    });

    // Enter inside a text answer must NOT submit the form (that would grade prematurely
    // and surprise the learner). Instead behave like Tab: advance to the next question's
    // field, or land on the submit button after the last one.
    form.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const target = e.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "text") return;
      e.preventDefault();
      const stops = focusStops(root);
      const next = stops[stops.indexOf(target) + 1];
      if (next) {
        next.focus();
        if (next instanceof HTMLInputElement && next.type === "text") next.select();
      }
    });
  }

  /**
   * @param {ShadowRoot} root
   * @param {GeneratedQuiz} quiz
   */
  #grade(root, quiz) {
    let score = 0;
    let answered = 0; // questions the learner actually responded to

    // Clear any feedback from a previous submission so re-checking is clean.
    for (const el of root.querySelectorAll(".option.correct, .option.chosen-wrong")) {
      el.classList.remove("correct", "chosen-wrong");
    }
    for (const el of root.querySelectorAll(".answer.right, .answer.wrong")) {
      el.classList.remove("right", "wrong");
    }
    for (const el of root.querySelectorAll(".correct-feedback")) el.remove();

    const questionEls = root.querySelectorAll(".q");
    quiz.questions.forEach((q, qi) => {
      let correct = false;
      if (q.kind === "text") {
        const input = /** @type {HTMLInputElement | null} */ (
          root.querySelector(`input[name="q${qi}"]`)
        );
        if (input && input.value.trim() !== "") answered++;
        correct = input !== null && checkAnswer(q.expected, input.value);
        if (input) {
          input.classList.toggle("right", correct);
          input.classList.toggle("wrong", !correct);
          const row = input.closest(".answer-row");
          if (row) {
            // A result mark beside the box: green tick if right, red cross if wrong.
            const mark = document.createElement("span");
            mark.className = `${correct ? "ok-mark" : "bad-mark"} correct-feedback`;
            mark.setAttribute("aria-hidden", "true");
            mark.textContent = correct ? "✓" : "✗";
            row.append(mark);
            // Only reveal the correct answer when they got it wrong.
            if (!correct) {
              const ans = document.createElement("input");
              ans.type = "text";
              ans.readOnly = true;
              ans.className = "correct-answer correct-feedback";
              ans.value = String(q.expected);
              ans.setAttribute("aria-label", t("quiz.correctAnswer"));
              ans.title = t("quiz.correctAnswer");
              row.append(ans);
            }
          }
        }
      } else {
        const chosen = /** @type {HTMLInputElement | null} */ (
          root.querySelector(`input[name="q${qi}"]:checked`)
        );
        if (chosen !== null) answered++;
        correct = chosen !== null && Number(chosen.value) === q.correctIndex;
        // Green-highlight the correct option; red the chosen-but-wrong one.
        for (const radio of root.querySelectorAll(`input[name="q${qi}"]`)) {
          const label = /** @type {HTMLElement | null} */ (radio.closest(".option"));
          if (!label) continue;
          if (Number(/** @type {HTMLInputElement} */ (radio).value) === q.correctIndex) {
            label.classList.add("correct");
          } else if (radio === chosen) {
            label.classList.add("chosen-wrong");
          }
        }
      }
      if (correct) score++;
      const el = questionEls[qi];
      el?.classList.toggle("right", correct);
      el?.classList.toggle("wrong", !correct);
    });
    const total = quiz.questions.length;
    const fraction = total ? score / total : 0;
    const pct = Math.round(fraction * 100);

    // Announce the grade so <primer-concept> can fold it into the confidence stars — but
    // only when the learner actually answered something. A blank submission is ignored, so
    // it never drags the stars down to 0%. Composed + bubbling so it escapes this shadow
    // root and reaches the document listener.
    if (answered > 0) {
      this.dispatchEvent(
        new CustomEvent("quiz-graded", {
          detail: { fraction, score, total, answered },
          bubbles: true,
          composed: true,
        }),
      );
      // Pass/fail sound: pass from 50%, glitter from 70% (so a decent score sounds positive
      // even before it earns the celebration sparkle).
      playSound(fraction >= 0.5 ? "quiz-pass" : "quiz-fail");

      // Celebrate a high score (>= 70%) with glitter confined to this quiz card — more
      // extreme the closer to 100%.
      const gi = glitterIntensity(fraction);
      if (gi > 0) {
        const card = /** @type {HTMLElement} */ (root.querySelector(".quiz"));
        if (card) glitter(card, gi);
      }
    }

    // Replace the "Check answers" button with a fun scorecard showing the percentage.
    const ringColor =
      fraction >= 0.5 ? "var(--primer-ok, #1a8f3c)" : "var(--primer-bad, #c0392b)";
    const area = /** @type {HTMLElement | null} */ (root.querySelector(".result-area"));
    if (area) {
      area.innerHTML = `
        <div class="scorecard">
          <div class="ring" style="--pct:${pct}; --ring:${ringColor}"><span class="pct">${pct}%</span></div>
          <p class="msg">${t(scoreMessageKey(pct))}</p>
          <button type="button" class="retry">${t("quiz.retry")}</button>
        </div>`;
      const retry = /** @type {HTMLButtonElement | null} */ (area.querySelector(".retry"));
      retry?.addEventListener("click", () => this.#start(root));
    }
  }
}

/**
 * The ordered focus stops for Enter-to-advance: each question's primary field (its text
 * box, or its first radio for multiple-choice) followed by the submit button. Enter on a
 * text answer jumps to the next stop instead of submitting.
 * @param {ShadowRoot} root
 * @returns {HTMLElement[]}
 */
function focusStops(root) {
  /** @type {HTMLElement[]} */
  const stops = [];
  for (const q of root.querySelectorAll(".q")) {
    const field = /** @type {HTMLElement | null} */ (
      q.querySelector('input.answer, input[type="radio"]')
    );
    if (field) stops.push(field);
  }
  const submit = /** @type {HTMLElement | null} */ (root.querySelector('button[type="submit"]'));
  if (submit) stops.push(submit);
  return stops;
}

/**
 * The result-message i18n key for a percentage score (0–100), by band.
 * @param {number} pct
 * @returns {string}
 */
function scoreMessageKey(pct) {
  if (pct >= 100) return "quiz.result.perfect";
  if (pct >= 80) return "quiz.result.great";
  if (pct >= 60) return "quiz.result.good";
  if (pct >= 40) return "quiz.result.ok";
  return "quiz.result.low";
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
