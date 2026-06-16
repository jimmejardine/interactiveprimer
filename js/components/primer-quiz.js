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
import { comparePolynomial } from "../poly.js";
import { parseJsonc } from "../jsonc.js";
import { t } from "../i18n.js";
import { glitter, glitterIntensity } from "../glitter.js";
import { playSound } from "../sounds.js";
import { loadMathLive } from "../mathfield.js";
import { getMathKeyboard } from "../math-keyboards.js";

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
      this.#bank = /** @type {AuthoredQuestion[]} */ (parseJsonc(bankEl.textContent));
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
        const poly = q.compare === "polynomial";
        return `
          <li class="q">
            <p class="prompt">${tex(q.prompt)}</p>
            <div class="answer-row">
              <input type="text" class="answer${poly ? " poly" : ""}" name="q${qi}" autocomplete="off" inputmode="text"
                ${poly ? `spellcheck="false" autocapitalize="off" data-keyboard="${escapeHtml(q.keyboard ?? "algebra-basic")}"` : ""}
                aria-label="${t("quiz.answerPlaceholder")}" placeholder="${t("quiz.answerPlaceholder")}">
            </div>
          </li>`;
      }
      // An option is EITHER a chart (a registered <primer-chart> scene, so the choice itself
      // is a graph) or text. Chart options get a 2-column grid; text options the inline list.
      const hasCharts = q.options.some((opt) => opt.chart);
      return `
        <li class="q">
          <p class="prompt">${tex(q.prompt)}</p>
          <div class="options${hasCharts ? " chart-options" : ""}">
            ${q.options
              .map((opt, oi) => {
                const body = opt.chart
                  ? `<primer-chart scene="${escapeHtml(opt.chart)}" aria-label="${t("quiz.chartOption", { n: oi + 1 })}"></primer-chart>`
                  : `<span>${tex(opt.text ?? "")}</span>`;
                return `
                  <label class="option">
                    <input type="radio" name="q${qi}" value="${oi}">
                    ${body}
                  </label>`;
              })
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
          display: inline-block;
          font: inherit; padding: 0.35rem 0.5rem; border-radius: 0.4rem;
          border: 1px solid var(--primer-ok, #1a8f3c); color: var(--primer-ok, #1a8f3c);
          background: var(--primer-ok-bg, #e6f6ec);
        }
        /* Visually hidden but available to screen readers (labels the revealed answer). */
        .sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
        }

        /* MathLive editor (when a polynomial box is enhanced). A ring shows the mark without
           fighting MathLive's own border. */
        math-field.mathfield { border-radius: 0.4rem; min-width: 8rem; }
        .mathfield.right { box-shadow: 0 0 0 2px var(--primer-ok, #1a8f3c); }
        .mathfield.wrong { box-shadow: 0 0 0 2px var(--primer-bad, #c0392b); }
        /* Hide MathLive's in-field controls: the ☰ menu (finicky) and the virtual-keyboard
           toggle (it wastes space). The keyboard pops up on focus / hides on blur instead
           (see the focus handlers + manual policy). */
        math-field::part(menu-toggle) { display: none; }
        math-field::part(virtual-keyboard-toggle) { display: none; }

        /* Multiple-choice feedback after marking. */
        .option { display: flex; gap: 0.4rem; align-items: center; padding: 0.15rem 0.45rem; border-radius: 0.4rem; }
        .option.correct { background: var(--primer-ok-bg, #e6f6ec); color: var(--primer-ok, #1a8f3c); box-shadow: inset 0 0 0 1px var(--primer-ok, #1a8f3c); }
        .option.chosen-wrong { background: var(--primer-bad-bg, #fdecea); color: var(--primer-bad, #c0392b); box-shadow: inset 0 0 0 1px var(--primer-bad, #c0392b); }

        /* Chart options: each choice is a small graph. Lay them in a responsive 2-col grid,
           the radio above its chart, the whole tile a clickable card. */
        .options.chart-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }
        .options.chart-options .option { flex-direction: column; align-items: stretch; gap: 0.3rem; padding: 0.4rem; border: 1px solid var(--primer-border, #ddd); }
        .options.chart-options .option > input[type="radio"] { align-self: start; }
        .options.chart-options primer-chart { width: 100%; }
        @media (max-width: 30rem) { .options.chart-options { grid-template-columns: 1fr; } }

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

    // Enter inside a text answer OR on a radio option must NOT submit the form (it would
    // grade prematurely and surprise the learner). Instead behave like Tab: advance to the
    // next question's field, or land on the submit button after the last one. (A MathLive
    // <math-field> handles its own Enter, so it isn't intercepted here.)
    form.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || (el.type !== "text" && el.type !== "radio")) return;
      e.preventDefault();
      const next = nextFocusStop(root, el);
      if (next) {
        next.focus();
        if (next instanceof HTMLInputElement && next.type === "text") next.select();
      }
    });

    // Progressive enhancement: upgrade polynomial boxes to a MathLive <math-field>, where `^`
    // opens an exponent. The plain <input> stays as the value carrier — the field writes its
    // LaTeX back into it — so grading/anyAnswered keep reading one place; a MathLive load
    // failure leaves the usable text box (the comparator parses plain `x^2`/`x²`). Its virtual
    // keyboard uses the "sandboxed" policy so it renders + dismisses correctly inside this
    // shadow root (the default policy leaves the keyboard stuck open on mobile).
    const polyInputs = /** @type {HTMLInputElement[]} */ ([...root.querySelectorAll("input.answer.poly")]);
    if (polyInputs.length) {
      void loadMathLive().then((ok) => {
        if (!ok || !this.isConnected) return;
        for (const input of polyInputs) {
          const mf = /** @type {any} */ (document.createElement("math-field"));
          mf.className = "mathfield";
          mf.mathVirtualKeyboardPolicy = "manual"; // we show on focus / hide on blur ourselves (below)
          mf.setAttribute("aria-label", input.getAttribute("aria-label") ?? "");
          input.before(mf);
          input.hidden = true; // keep it in the DOM as the value carrier
          mf.value = input.value;
          mf.menuItems = []; // the ☰ menu misbehaves on touch — hidden via CSS; use the button below
          mf.addEventListener("input", () => {
            input.value = mf.value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          });

          // Show this module's keyboard on focus and hide it on blur (policy is "manual", and
          // the in-field toggle is hidden via CSS — so the keyboard pops up only while the
          // field is active and takes no space otherwise). The virtual keyboard is a shared
          // singleton, so set the module's layout each time the field is focused.
          const layout = getMathKeyboard(input.dataset.keyboard);
          mf.addEventListener("focusin", () => {
            const vk = /** @type {any} */ (globalThis).mathVirtualKeyboard;
            if (!vk) return;
            if (layout) vk.layouts = [layout];
            vk.editToolbar = "none"; // drop the undo/redo/copy menubar (re-applied here as it can reset)
            vk.show();
            // The keyboard is fixed to the bottom of the viewport, so on a short screen it can
            // cover the very field being edited. Once it has settled (MathLive reports its final
            // size via `boundingRect`; `geometrychange` fires when that changes), scroll the page
            // just far enough to lift the field above the keyboard's top edge. A timeout backs it
            // up in case the event doesn't fire. We reveal at most once per focus.
            let revealed = false;
            const reveal = () => {
              if (revealed || !mf.isConnected) return;
              revealed = true;
              vk.removeEventListener?.("geometrychange", reveal);
              const kbTop = vk.boundingRect?.top || window.innerHeight;
              const rect = mf.getBoundingClientRect();
              const overlap = rect.bottom - kbTop + 16; // 16px of breathing room below the field
              if (overlap > 0) window.scrollBy({ top: overlap, behavior: "smooth" });
            };
            vk.addEventListener?.("geometrychange", reveal);
            setTimeout(reveal, 300); // fallback ~ the keyboard's slide-in duration
          });
          mf.addEventListener("focusout", () => {
            const vk = /** @type {any} */ (globalThis).mathVirtualKeyboard;
            vk?.hide();
          });

          // Make Tab / Enter leave the math box like a text field or radio (MathLive
          // otherwise traps Tab and swallows Enter). MathLive fires `move-out` when the
          // caret would leave the field (Tab forward, Shift+Tab/arrows backward).
          /** @param {Event} e */
          const onMoveOut = (e) => {
            e.preventDefault(); // we place focus ourselves, not MathLive's default shuffle
            const dir = /** @type {any} */ (e).detail?.direction;
            const target =
              dir === "backward" || dir === "upward"
                ? prevFocusStop(root, mf)
                : nextFocusStop(root, mf);
            target?.focus();
          };
          mf.addEventListener("move-out", onMoveOut);
          // Enter advances (never submits). Capture so we intercept before MathLive; Enter
          // isn't used for math editing, so this is safe.
          /** @param {KeyboardEvent} e */
          const onMfEnter = (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            e.stopPropagation();
            nextFocusStop(root, mf)?.focus();
          };
          mf.addEventListener("keydown", onMfEnter, true);
        }
      });
    }
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
    for (const el of root.querySelectorAll(
      ".answer.right, .answer.wrong, .mathfield.right, .mathfield.wrong",
    )) {
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
        correct =
          input !== null &&
          (q.compare === "polynomial"
            ? comparePolynomial(String(q.expected), input.value)
            : checkAnswer(q.expected, input.value));
        if (input) {
          const row = input.closest(".answer-row");
          // Colour the VISIBLE control: the MathLive editor when the box was enhanced, else
          // the text input itself.
          const field = /** @type {HTMLElement} */ (row?.querySelector("math-field") ?? input);
          field.classList.toggle("right", correct);
          field.classList.toggle("wrong", !correct);
          if (row) {
            // A result mark beside the box: green tick if right, red cross if wrong.
            const mark = document.createElement("span");
            mark.className = `${correct ? "ok-mark" : "bad-mark"} correct-feedback`;
            mark.setAttribute("aria-hidden", "true");
            mark.textContent = correct ? "✓" : "✗";
            row.append(mark);
            // Only reveal the correct answer when they got it wrong. It's typeset with KaTeX
            // (like the prompt/options) so a math answer reads as math, not raw "x^2 + 7x + 12".
            if (!correct) {
              const ans = document.createElement("span");
              ans.className = "correct-answer correct-feedback";
              ans.title = t("quiz.correctAnswer");
              // A visually-hidden label so screen readers announce what the pill is, without
              // overriding the typeset value's own MathML.
              const label = document.createElement("span");
              label.className = "sr-only";
              label.textContent = `${t("quiz.correctAnswer")}: `;
              const value = document.createElement("span");
              value.innerHTML = answerHtml(q);
              ans.append(label, value);
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
 * Where Enter-to-advance should move focus next: the PRIMARY field of the question after
 * the one `from` belongs to (its math/text box, else its first radio), or the submit
 * button after the last question. Question-based, so Enter on any radio in a group — not
 * just the first — advances to the next question rather than submitting.
 * @param {ShadowRoot} root
 * @param {HTMLElement} from
 * @returns {HTMLElement | null}
 */
function nextFocusStop(root, from) {
  const questions = [...root.querySelectorAll(".q")];
  const currentQ = from.closest(".q");
  const nextQ = questions[questions.indexOf(/** @type {Element} */ (currentQ)) + 1];
  if (nextQ) {
    return /** @type {HTMLElement | null} */ (
      nextQ.querySelector('math-field, input.answer, input[type="radio"]')
    );
  }
  return /** @type {HTMLElement | null} */ (root.querySelector('button[type="submit"]'));
}

/**
 * The mirror of {@link nextFocusStop} for backward movement (Shift+Tab out of a math box):
 * the PRIMARY field of the question BEFORE `from`'s, or null at the first question.
 * @param {ShadowRoot} root
 * @param {HTMLElement} from
 * @returns {HTMLElement | null}
 */
function prevFocusStop(root, from) {
  const questions = [...root.querySelectorAll(".q")];
  const currentQ = from.closest(".q");
  const prevQ = questions[questions.indexOf(/** @type {Element} */ (currentQ)) - 1];
  return prevQ
    ? /** @type {HTMLElement | null} */ (
        prevQ.querySelector('math-field, input.answer, input[type="radio"]')
      )
    : null;
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
 * Render the revealed correct answer of a free-text question as KaTeX HTML. A math answer
 * (a polynomial, a number, or anything carrying digits/math symbols) is typeset as math; a
 * plain word ("Paris") is wrapped in `\text{…}` so it stays upright instead of becoming italic
 * math. KaTeX failures fall back to escaped plain text so a stray value never breaks the reveal.
 * @param {import("../types/domain.js").GeneratedTextQuestion} q
 * @returns {string}
 */
function answerHtml(q) {
  const s = String(q.expected);
  // Prose = has letters but no digit or math symbol (so a city/word, not an expression).
  const isProse = /[a-zA-Z]/.test(s) && !/[0-9^_=\\/+*()²³⁰-⁹√π]/.test(s);
  const math = q.compare === "polynomial" || typeof q.expected === "number" || !isProse;
  // Wrap exponents so multi-digit powers (x^10) typeset whole; harmless for single digits.
  const latex = math ? s.replace(/\^(-?\d+)/g, "^{$1}") : `\\text{${latexEscape(s)}}`;
  try {
    return katex.renderToString(latex, { throwOnError: false });
  } catch {
    return escapeHtml(s);
  }
}

/**
 * Escape the LaTeX special characters so an arbitrary word renders literally inside `\text{…}`.
 * @param {string} s
 * @returns {string}
 */
function latexEscape(s) {
  return s.replace(/[\\{}$&#%_^~]/g, (c) =>
    /** @type {Record<string,string>} */ ({
      "\\": "\\textbackslash{}",
      "{": "\\{",
      "}": "\\}",
      $: "\\$",
      "&": "\\&",
      "#": "\\#",
      "%": "\\%",
      _: "\\_",
      "^": "\\textasciicircum{}",
      "~": "\\textasciitilde{}",
    })[c],
  );
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
