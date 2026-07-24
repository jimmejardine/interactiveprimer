/**
 * <primer-quiz-stream> — an infinite stream of INSTANTLY-graded quiz question cards, used by the
 * /course-quiz page. Unlike <primer-quiz> (a lesson's batch-graded "Quick quiz" panel with one
 * Check-answers button), each card here grades the moment the learner commits an answer: picking a
 * multiple-choice option grades on click; a typed answer grades on Enter / its Check button; an
 * embedded geometry-problem / program card grades via its own Check. On grading the card plays the
 * quiz pass/fail sound, locks, and reveals WHICH concept the question came from — a link plus the
 * concept's newly-updated star row (or a "not counted" note when the harvest rule skips recording).
 *
 * The page drives it: `stream.push(generatedQuestion, { conceptId, title, onAnswered })` appends a
 * card; `onAnswered(correct)` is the page's hook to update counters/stars and returns
 * `{ stars: number | null }` for the reveal (null → not recorded). Rendering/grading reuses the
 * same primitives as <primer-quiz> (KaTeX `$…$` typesetting, checkAnswer / comparePolynomial /
 * ComputeEngine equivalence, <primer-chart>/<primer-geometry> option embedding); the visual
 * language matches the golden quiz panel. Kept separate from primer-quiz deliberately — batch and
 * instant flows differ enough that sharing the element would tangle both (a future refactor could
 * extract the question-markup helpers).
 * @module
 */

import katex from "katex";
import { attachShared, katexHref } from "./shared.ts";
import { escapeHtml } from "../html-entities.ts";
import { checkAnswer } from "../quiz-vars.ts";
import { comparePolynomial } from "../poly.ts";
import { gradeEquivalent } from "../grade-math.ts";
import { loadComputeEngine } from "../compute-engine.ts";
import { playSound } from "../sounds.ts";
import { t } from "../i18n.ts";
import type { GeneratedQuestion, GeneratedTextQuestion } from "../types/domain.ts";

export interface StreamMeta {
  conceptId: string;
  /** The concept's (localized) title, shown in the post-grade reveal. */
  title: string;
  /** Page hook: update counters/stars; return the stars to reveal (null → answer not recorded). */
  onAnswered: (correct: boolean) => { stars: number | null };
}

const STYLE = `
  :host { display: block; }
  .card {
    background: var(--primer-quiz-bg, #fdf3d7); border: 1px solid var(--primer-quiz-border, #ecd29a);
    border-radius: var(--primer-radius, 0.85rem); box-shadow: var(--primer-shadow-sm);
    padding: 0.9rem 1.1rem; margin: 0 0 0.9rem; font-family: var(--primer-font-ui, sans-serif);
    color: var(--primer-ink, #111);
  }
  .prompt { margin: 0 0 0.6rem; }
  .q-figure { display: block; max-width: 26rem; margin: 0 auto 0.6rem; }

  .option { display: flex; gap: 0.4rem; align-items: center; padding: 0.25rem 0.45rem; border-radius: 0.4rem; cursor: pointer; }
  .option:hover { background: var(--primer-control-bg, #0000000d); }
  .card.locked .option { cursor: default; }
  .card.locked .option:hover { background: none; }
  .option.correct { background: var(--primer-ok-bg, #e6f6ec); color: var(--primer-ok, #1a8f3c); box-shadow: inset 0 0 0 1px var(--primer-ok, #1a8f3c); }
  .option.chosen-wrong { background: var(--primer-bad-bg, #fdecea); color: var(--primer-bad, #c0392b); box-shadow: inset 0 0 0 1px var(--primer-bad, #c0392b); }
  .options.figure-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; }
  .options.figure-options .option { flex-direction: column; align-items: stretch; gap: 0.3rem; padding: 0.4rem; border: 1px solid var(--primer-border, #ddd); }
  .options.figure-options .option > input[type="radio"] { align-self: start; }
  .options.figure-options primer-chart, .options.figure-options primer-geometry { width: 100%; }
  @media (max-width: 30rem) { .options.figure-options { grid-template-columns: 1fr; } }

  .answer-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .answer {
    font: inherit; padding: 0.35rem 0.5rem; border-radius: 0.4rem;
    border: 1px solid var(--primer-border, #ccc);
    background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
  }
  .answer.right { border-color: var(--primer-ok, #1a8f3c); color: var(--primer-ok, #1a8f3c); background: var(--primer-ok-bg, #e6f6ec); }
  .answer.wrong { border-color: var(--primer-bad, #c0392b); color: var(--primer-bad, #c0392b); background: var(--primer-bad-bg, #fdecea); }
  .check {
    font: inherit; cursor: pointer; padding: 0.35rem 0.9rem; border-radius: 999px;
    border: 1px solid var(--primer-quiz-border, #ecd29a);
    background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
  }
  .check:hover:not(:disabled) { border-color: var(--primer-accent, #46e); }
  .check:disabled { opacity: 0.5; cursor: default; }
  .ok-mark { color: var(--primer-ok, #1a8f3c); font-weight: 700; }
  .bad-mark { color: var(--primer-bad, #c0392b); font-weight: 700; }
  .correct-answer {
    display: inline-block; font: inherit; padding: 0.35rem 0.5rem; border-radius: 0.4rem;
    border: 1px solid var(--primer-ok, #1a8f3c); color: var(--primer-ok, #1a8f3c);
    background: var(--primer-ok-bg, #e6f6ec);
  }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }

  /* Post-grade reveal: which concept this came from + its fresh stars. */
  .reveal {
    display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
    margin-top: 0.7rem; padding-top: 0.6rem; border-top: 1px dashed var(--primer-quiz-border, #ecd29a);
    animation: reveal-in 0.3s ease both;
  }
  @keyframes reveal-in { from { opacity: 0; transform: translateY(0.25rem); } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .reveal { animation: none; } }
  .reveal a { color: var(--primer-ink, #111); font-weight: 600; text-decoration: none; }
  .reveal a:hover { text-decoration: underline; }
  .reveal .stars { letter-spacing: 1px; white-space: nowrap; font-size: 0.9rem; }
  .reveal .stars .s { color: var(--primer-control-bg, #8883); }
  .reveal .stars .s.on { color: var(--primer-star, #e3b15c); }
  .reveal .muted { color: var(--primer-ink-soft, #778); font-size: 0.85rem; }
`;

export class PrimerQuizStream extends HTMLElement {
  #root: ShadowRoot | null = null;
  #ce: any = null; // ComputeEngine, lazily loaded for polynomial equivalence grading

  connectedCallback() {
    if (this.#root) return;
    this.#root = this.shadowRoot ?? attachShared(this);
    this.#root.innerHTML = `
      ${katexHref() ? `<link rel="stylesheet" href="${katexHref()}">` : ""}
      <style>${STYLE}</style>
      <div class="cards"></div>`;
    // Best-effort: symbolic grading upgrades when the engine arrives (plain compare until then).
    loadComputeEngine().then((ce) => (this.#ce = ce));
  }

  /** Append one instantly-graded question card. */
  push(q: GeneratedQuestion, meta: StreamMeta): void {
    if (!this.#root) this.connectedCallback();
    const host = this.#root!.querySelector(".cards") as HTMLElement;
    const card = document.createElement("div");
    card.className = "card";
    host.appendChild(card);

    if (q.kind === "problem" || q.kind === "program") {
      this.#renderEmbedded(card, q, meta);
    } else if (q.kind === "text") {
      this.#renderText(card, q, meta);
    } else {
      this.#renderChoice(card, q, meta);
    }
  }

  /** Shared post-grade behaviour: sound, lock, and the concept + stars reveal. */
  #graded(card: HTMLElement, correct: boolean, meta: StreamMeta): void {
    card.classList.add("locked");
    playSound(correct ? "quiz-pass" : "quiz-fail");
    const { stars } = meta.onAnswered(correct);
    const starRow =
      stars === null
        ? `<span class="muted">${escapeHtml(t("coursequiz.notCounted"))}</span>`
        : `<span class="stars" title="${stars}">${Array.from({ length: 10 }, (_, i) => `<span class="s${i < Math.floor(stars) ? " on" : ""}">★</span>`).join("")}</span>`;
    const reveal = document.createElement("div");
    reveal.className = "reveal";
    reveal.innerHTML = `<a href="/concepts/${escapeHtml(meta.conceptId)}">${escapeHtml(meta.title)}</a>${starRow}`;
    card.appendChild(reveal);
  }

  #figureHtml(q: { figure?: string }): string {
    return q.figure
      ? `<primer-geometry class="q-figure" scene="${escapeHtml(q.figure)}" no-controls></primer-geometry>`
      : "";
  }

  #renderChoice(card: HTMLElement, q: Extract<GeneratedQuestion, { kind: "choice" }>, meta: StreamMeta): void {
    const hasFigures = q.options.some((o) => o.chart || o.geometry);
    card.innerHTML = `
      ${this.#figureHtml(q)}
      <p class="prompt">${tex(q.prompt)}</p>
      <div class="options${hasFigures ? " figure-options" : ""}">
        ${q.options
          .map((opt, oi) => {
            const body = opt.chart
              ? `<primer-chart scene="${escapeHtml(opt.chart)}" aria-label="${t("quiz.chartOption", { n: oi + 1 })}"></primer-chart>`
              : opt.geometry
                ? `<primer-geometry scene="${escapeHtml(opt.geometry)}" no-controls aria-label="${t("quiz.chartOption", { n: oi + 1 })}"></primer-geometry>`
                : `<span>${tex(opt.text ?? "")}</span>`;
            return `<label class="option"><input type="radio" name="s" value="${oi}">${body}</label>`;
          })
          .join("")}
      </div>`;
    const radios = [...card.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    const onPick = (oi: number) => {
      if (card.classList.contains("locked")) return;
      const correct = oi === q.correctIndex;
      const opts = card.querySelectorAll(".option");
      opts[q.correctIndex]?.classList.add("correct");
      if (!correct) opts[oi]?.classList.add("chosen-wrong");
      radios.forEach((r) => (r.disabled = true));
      this.#graded(card, correct, meta);
    };
    radios.forEach((r, oi) => r.addEventListener("change", () => onPick(oi)));
  }

  #renderText(card: HTMLElement, q: GeneratedTextQuestion, meta: StreamMeta): void {
    card.innerHTML = `
      ${this.#figureHtml(q)}
      <p class="prompt">${tex(q.prompt)}</p>
      <div class="answer-row">
        <input type="text" class="answer" autocomplete="off" spellcheck="false"
          aria-label="${t("quiz.answerPlaceholder")}" placeholder="${t("quiz.answerPlaceholder")}">
        <button type="button" class="check">${escapeHtml(t("quiz.check"))}</button>
      </div>`;
    const input = card.querySelector(".answer") as HTMLInputElement;
    const check = card.querySelector(".check") as HTMLButtonElement;
    const grade = () => {
      if (card.classList.contains("locked") || input.value.trim() === "") return;
      const correct =
        q.compare === "polynomial"
          ? this.#ce
            ? gradeEquivalent(this.#ce, String(q.expected), input.value)
            : comparePolynomial(String(q.expected), input.value)
          : checkAnswer(q.expected, input.value);
      input.disabled = true;
      check.disabled = true;
      input.classList.add(correct ? "right" : "wrong");
      const row = card.querySelector(".answer-row") as HTMLElement;
      const mark = document.createElement("span");
      mark.className = correct ? "ok-mark" : "bad-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = correct ? "✓" : "✗";
      row.append(mark);
      if (!correct) {
        const ans = document.createElement("span");
        ans.className = "correct-answer";
        ans.title = t("quiz.correctAnswer");
        ans.innerHTML = `<span class="sr-only">${escapeHtml(t("quiz.correctAnswer"))}: </span>${tex(`$${String(q.expected)}$`)}`;
        row.append(ans);
      }
      this.#graded(card, correct, meta);
    };
    check.addEventListener("click", grade);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") grade();
    });
  }

  #renderEmbedded(
    card: HTMLElement,
    q: Extract<GeneratedQuestion, { kind: "problem" | "program" }>,
    meta: StreamMeta,
  ): void {
    const tag = q.kind === "problem" ? "primer-geometry-problem" : "primer-program";
    card.innerHTML = `
      <${tag} scene="${escapeHtml(q.scene)}" embedded></${tag}>
      <div class="answer-row" style="margin-top:0.6rem">
        <button type="button" class="check">${escapeHtml(t("quiz.check"))}</button>
      </div>`;
    const check = card.querySelector(".check") as HTMLButtonElement;
    check.addEventListener("click", async () => {
      if (card.classList.contains("locked")) return;
      const embedded = card.querySelector(tag) as any;
      const correct = Boolean(await embedded?.check?.());
      check.disabled = true;
      this.#graded(card, correct, meta);
    });
  }
}

/** Typeset a string with inline `$…$` LaTeX spans (same contract as primer-quiz's helper). */
function tex(text: string): string {
  const re = /\$([^$]+)\$/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
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

if (!customElements.get("primer-quiz-stream")) {
  customElements.define("primer-quiz-stream", PrimerQuizStream);
}
