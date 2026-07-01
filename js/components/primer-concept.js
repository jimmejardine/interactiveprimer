// @ts-check
/**
 * <primer-concept> — the body of a concept, with a self-attested confidence control
 * (a 0–10 star rating) whose value persists in localStorage.
 *
 * Concept title and id are supplied by render.js as attributes (`title` from the page's
 * `<primer-title>` element, `concept-id` from the URL path); a legacy concept-meta title /
 * slug is only a fallback. The level still comes from the concept-meta block + the graph.
 * @module
 */

import { attachShared, slug } from "./shared.js";
import { getConceptMeta, conceptIdFromPath } from "../concept-meta.js";
import { formatLevel, BASE_LEVEL } from "../levels.js";
import { loadGraph } from "../graph-data.js";
import { t } from "../i18n.js";
import { combineRating } from "../confidence.js";
import { readEntry, writeEntry } from "../confidence-store.js";
import { attentionEvent, flaggedToday, markFlagged } from "../feedback.js";
import { getCurrentCourse, setCurrentCourse, clearCourse } from "../course.js";
import { confirmDialog } from "../confirm-dialog.js";

/** Number of stars in the confidence rating (0 = unrated/none, MAX = full mastery). */
const MAX_STARS = 10;

/** A single 5-point star glyph as inline SVG; fill is controlled by CSS. */
const STAR_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M12 .587l3.668 7.431 8.2 1.193-5.934 5.787 1.401 8.169L12 18.896l-7.335 3.868 1.401-8.169L.132 9.211l8.2-1.193z"/>' +
  "</svg>";

/** Scoped styles for the concept header + star control (in the shadow root). */
const STAR_CSS = `
  /* "(Level x)" trails the title, in the same display font as the caption — bold when the
     level is declared, normal when implicit. The parentheses are presentational (so the
     text stays "Level x"). */
  .title-row { display: flex; align-items: baseline; gap: 0.7rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
  .title-row h1 {
    margin: 0;
    font-size: clamp(2rem, 1.55rem + 1.9vw, 2.65rem);
    line-height: 1.1;
    letter-spacing: -0.018em;
  }
  /* The level sits in a small pill beside the title (uppercase, accent-tinted), bolder when
     the level is declared in metadata, lighter when implicit (inherited from prerequisites). */
  .level-badge {
    align-self: center;
    font-family: var(--primer-font-ui, sans-serif);
    font-size: 0.7rem; font-weight: 600; white-space: nowrap;
    text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--primer-badge-ink, #3a45a6);
    background: var(--primer-badge-bg, #eceefb);
    border-radius: 999px; padding: 0.22rem 0.62rem;
  }
  .level-badge.is-declared { box-shadow: inset 0 0 0 1.5px var(--primer-badge-ink, #3a45a6); }
  .level-badge[hidden] { display: none; }
  /* Visually hidden but readable by assistive tech (the live-region rating readout). */
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  /* Centre the prompt and the star row within the confidence card. */
  .confidence { text-align: center; }
  /* A centred row of stars at their natural size; they shrink together to fit narrow
     screens (flex-shrink) instead of overflowing, and never stretch edge-to-edge. */
  .stars { display: flex; justify-content: center; gap: 0.2rem; width: 100%; }
  /* A comfortable 44px-tall tap target (the glyph stays 1.5rem, centred in it); the width still
     shrinks on narrow screens but never below ~24px, so all ten stars keep an accessible hit area. */
  .star {
    flex: 0 1 2rem; min-width: 1.5rem; min-height: 44px;
    display: grid; place-items: center;
    padding: 0; border: none; background: none; line-height: 0;
    color: var(--primer-border, #ccc); cursor: pointer;
  }
  .star svg { width: 1.5rem; height: 1.5rem; fill: currentColor; transition: color 0.08s ease; }
  .star.filled { color: var(--primer-star, #f5b301); }   /* selected or previewed */
  .star:focus-visible { outline: 2px solid var(--primer-accent, #46e); border-radius: 0.25rem; }
  /* A quiet "this page needs attention" link-button under the stars (lightweight feedback). */
  .feedback { margin-top: 0.9rem; }
  .feedback .attn {
    font-family: var(--primer-font-ui, sans-serif); font-size: 0.82rem;
    padding: 0.2rem 0.5rem; border: none; background: none; cursor: pointer;
    color: var(--primer-ink-soft, #667); text-decoration: underline; text-underline-offset: 2px;
  }
  .feedback .attn:hover { color: var(--primer-ink, #111); }
  .feedback .attn:focus-visible { outline: 2px solid var(--primer-accent, #46e); border-radius: 0.25rem; }
  .feedback .attn[disabled] { text-decoration: none; cursor: default; opacity: 0.8; }

  /* "Focus on this course" — shown below the title only on a course page (course: true). */
  .course-focus { margin: -0.1rem 0 1rem; }
  .course-focus[hidden] { display: none; }
  .focus-course {
    font-family: var(--primer-font-ui, sans-serif); font-size: 0.9rem; cursor: pointer;
    padding: 0.45rem 0.95rem; border-radius: 999px;
    border: 1.5px solid var(--primer-course, #e3b15c);
    background: var(--primer-course, #e3b15c); color: var(--primer-ink, #111);
  }
  .focus-course.is-active { background: transparent; color: var(--primer-ink-soft, #667); }
  .focus-course:hover { filter: brightness(0.96); }
`;

export class PrimerConcept extends HTMLElement {
  /** @type {((e: Event) => void) | null} */
  #onQuizGraded = null;
  /** @type {(() => void) | null} */
  #onCourse = null;

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    const meta = safeMeta();
    // Title + id are supplied by render.js (title attr from <primer-title>, concept-id from the
    // URL path); a slug of the title is only a last-resort fallback for direct use without render.
    const title = this.getAttribute("title") ?? "Untitled concept";
    const id = this.getAttribute("concept-id") || conceptIdFromPath() || slug(title);

    // The level sits to the right of the title on EVERY page: bold when declared in
    // metadata, normal weight when implicit (inherited from prerequisites). A declared
    // level is known from the page itself; an implicit level is read asynchronously
    // from the emitted graph (dist/graph.json) below.
    const declared = meta?.declaredLevel;
    const levelBadge =
      declared !== undefined
        ? `<span class="level-badge is-declared" title="${t("concept.level.declaredTitle")}">${t("concept.level.label", { level: formatLevel(declared) })}</span>`
        : `<span class="level-badge" title="${t("concept.level.implicitTitle")}" hidden></span>`;

    const stars = Array.from(
      { length: MAX_STARS },
      (_, i) =>
        `<button type="button" class="star" data-value="${i + 1}" ` +
        `aria-label="${t("concept.confidence.rate", { n: i + 1, max: MAX_STARS })}" title="${t("concept.confidence.rateTitle", { n: i + 1, max: MAX_STARS })}">${STAR_SVG}</button>`,
    ).join("");

    root.innerHTML = `
      <style>${STAR_CSS}</style>
      <article>
        <div class="title-row"><h1><slot name="title">${title}</slot></h1>${levelBadge}</div>
        <div class="course-focus" hidden><button type="button" class="focus-course"></button></div>
        <div class="body"><slot></slot></div>
        <section class="confidence card" aria-label="${t("concept.confidence.legend")}">
          <p class="meta" id="conf-label" style="margin-top:0;">${t("concept.confidence.prompt")}</p>
          <div class="stars" role="group" aria-labelledby="conf-label">${stars}</div>
          <p class="sr-only conf-status" role="status" aria-live="polite"></p>
          <div class="feedback">
            <button type="button" class="attn">${t("feedback.needsAttention")}</button>
          </div>
        </section>
      </article>`;

    const starEls = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll(".star")]);
    const statusEl = /** @type {HTMLElement} */ (root.querySelector(".conf-status"));

    let rating = readEntry(id)?.stars ?? 0;
    paint(starEls, rating);
    reflectRating(starEls, statusEl, rating);

    for (const star of starEls) {
      const value = Number(star.dataset.value);
      // Clicking the star equal to the current rating clears back to 0; otherwise set.
      star.addEventListener("click", () => {
        rating = rating === value ? value - 1 : value;
        writeEntry(id, rating);
        paint(starEls, rating);
        reflectRating(starEls, statusEl, rating);
        this.dispatchEvent(
          // composed so it escapes this shadow root and reaches the pathway widget,
          // which re-colours the matching node live.
          new CustomEvent("confidence-change", {
            detail: { conceptId: id, value: rating },
            bubbles: true,
            composed: true,
          }),
        );
      });
      // Hover/focus preview, reverting to the committed rating on leave.
      star.addEventListener("mouseenter", () => paint(starEls, value));
      star.addEventListener("focus", () => paint(starEls, value));
      star.addEventListener("mouseleave", () => paint(starEls, rating));
      star.addEventListener("blur", () => paint(starEls, rating));
    }

    // "This page needs attention" — fire a GoatCounter event so the most-flagged pages surface in
    // the dashboard (analytics is prod-only, so this no-ops locally). Once-per-day per browser.
    const attn = /** @type {HTMLButtonElement} */ (root.querySelector(".attn"));
    const markDone = () => {
      attn.disabled = true;
      attn.textContent = t("feedback.thanks");
    };
    if (flaggedToday(id)) markDone();
    attn.addEventListener("click", () => {
      if (flaggedToday(id)) return;
      try {
        /** @type {any} */ (window).goatcounter?.count?.(attentionEvent(id, title));
      } catch {
        /* analytics absent (localhost) or not yet loaded — the flag is still recorded below */
      }
      markFlagged(id);
      markDone();
    });

    // A graded quiz folds its result into the stars: the new rating is the average of the
    // current stars and the test percentage, or just the percentage when there are no stars
    // (rating 0). Re-emit confidence-change so the explorer recolours, exactly like a click.
    this.#onQuizGraded = (e) => {
      const fraction = /** @type {any} */ (e).detail?.fraction;
      if (typeof fraction !== "number") return;
      rating = combineRating(rating, fraction, MAX_STARS);
      writeEntry(id, rating);
      paint(starEls, rating);
      this.dispatchEvent(
        new CustomEvent("confidence-change", {
          detail: { conceptId: id, value: rating },
          bubbles: true,
          composed: true,
        }),
      );
    };
    document.addEventListener("quiz-graded", this.#onQuizGraded);

    // "Focus on this course" — only on a course page (`course: true`). Focusing sets the learner's
    // current course (id = this course's page id); switching from another course asks first; once
    // focused the button flips to an "exit" affordance.
    if (meta?.course) {
      const wrap = /** @type {HTMLElement} */ (root.querySelector(".course-focus"));
      const btn = /** @type {HTMLButtonElement} */ (root.querySelector(".focus-course"));
      wrap.hidden = false;
      const refreshBtn = () => {
        const active = getCurrentCourse() === id;
        btn.textContent = active ? t("course.focused") : t("course.focus");
        btn.classList.toggle("is-active", active);
      };
      refreshBtn();
      btn.addEventListener("click", async () => {
        const cur = getCurrentCourse();
        if (cur === id) { clearCourse(); return; } // already focused → leave the course
        if (cur && cur !== id) {
          const ok = await confirmDialog({ message: t("course.change"), confirm: t("course.switch"), cancel: t("course.keep") });
          if (!ok) return;
        }
        setCurrentCourse(id);
      });
      this.#onCourse = refreshBtn;
      document.addEventListener("course-change", this.#onCourse);
    }

    // For an implicit level, fill the (initially hidden) badge from the emitted graph.
    if (declared === undefined) void this.#showImplicitLevel(root, id);
  }

  disconnectedCallback() {
    if (this.#onQuizGraded) document.removeEventListener("quiz-graded", this.#onQuizGraded);
    if (this.#onCourse) document.removeEventListener("course-change", this.#onCourse);
    this.#onQuizGraded = this.#onCourse = null;
  }

  /**
   * Fill in the implicit (inherited) level from the emitted graph, then reveal the
   * badge. Falls back to the base level if the graph can't be loaded, so every page
   * still shows a level.
   * @param {ShadowRoot} root
   * @param {string} id
   */
  async #showImplicitLevel(root, id) {
    let level = BASE_LEVEL;
    try {
      const { byId } = await loadGraph();
      const entry = byId.get(id);
      if (entry && typeof entry.level === "number") level = entry.level;
    } catch {
      /* graph unavailable (e.g. not generated yet) — fall back to the base level */
    }
    if (!this.isConnected) return;
    const badge = root.querySelector(".level-badge");
    if (!badge) return;
    badge.textContent = t("concept.level.label", { level: formatLevel(level) });
    badge.removeAttribute("hidden");
  }
}

/** @returns {import("../types/domain.js").ConceptMeta | null} */
function safeMeta() {
  try {
    return getConceptMeta();
  } catch {
    return null;
  }
}

/**
 * Fill the first `upto` stars, empty the rest.
 * @param {HTMLButtonElement[]} stars
 * @param {number} upto
 */
function paint(stars, upto) {
  for (const s of stars) {
    s.classList.toggle("filled", Number(s.dataset.value) <= upto);
  }
}

/**
 * Expose the COMMITTED rating to assistive tech: each star's `aria-pressed` mirrors whether it's
 * part of the current rating, and a polite live region announces the value on change. (Kept
 * separate from paint(), which also runs for the transient hover/focus preview — the ARIA state
 * must reflect the committed rating, not the preview.)
 * @param {HTMLButtonElement[]} stars
 * @param {HTMLElement} statusEl
 * @param {number} rating
 */
function reflectRating(stars, statusEl, rating) {
  for (const s of stars) {
    s.setAttribute("aria-pressed", String(Number(s.dataset.value) <= rating));
  }
  statusEl.textContent =
    rating > 0 ? t("concept.confidence.current", { n: rating, max: MAX_STARS }) : t("concept.confidence.unrated");
}

if (!customElements.get("primer-concept")) {
  customElements.define("primer-concept", PrimerConcept);
}
