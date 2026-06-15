// @ts-check
/**
 * <primer-concept> — the body of a concept, with a self-attested confidence control
 * (a 0–10 star rating) whose value persists in localStorage.
 *
 * Concept title and id come from the page's inline `<script class="concept-meta">`
 * block (the single source of truth); attributes are only a prototyping fallback.
 * @module
 */

import { attachShared, slug } from "./shared.js";
import { getConceptMeta } from "../concept-meta.js";
import { formatLevel, BASE_LEVEL } from "../levels.js";
import { loadGraph } from "../graph-data.js";
import { t } from "../i18n.js";
import { combineRating } from "../confidence.js";

/** Number of stars in the confidence rating (0 = unrated/none, MAX = full mastery). */
const MAX_STARS = 10;

/** A single 5-point star glyph as inline SVG; fill is controlled by CSS. */
const STAR_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M12 .587l3.668 7.431 8.2 1.193-5.934 5.787 1.401 8.169L12 18.896l-7.335 3.868 1.401-8.169L.132 9.211l8.2-1.193z"/>' +
  "</svg>";

/** Scoped styles for the concept header + star control (in the shadow root). */
const STAR_CSS = `
  .title-row {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 0.5rem 1rem; flex-wrap: wrap;
  }
  .title-row h1 { margin: 0; }
  /* Level badge: bold when declared in metadata, normal weight when implicit. */
  .level-badge { font-weight: 400; }
  .level-badge.is-declared { font-weight: 700; }
  /* Centre the prompt and the star row within the confidence card. */
  .confidence { text-align: center; }
  /* A centred row of stars at their natural size; they shrink together to fit narrow
     screens (flex-shrink) instead of overflowing, and never stretch edge-to-edge. */
  .stars { display: flex; justify-content: center; gap: 0.2rem; width: 100%; }
  .star {
    flex: 0 1 1.7rem; min-width: 0; aspect-ratio: 1 / 1;
    display: grid; place-items: center;
    padding: 0; border: none; background: none; line-height: 0;
    color: var(--primer-border, #ccc); cursor: pointer;
  }
  .star svg { width: 100%; height: 100%; fill: currentColor; transition: color 0.08s ease; }
  .star.filled { color: var(--primer-star, #f5b301); }   /* selected or previewed */
  .star:focus-visible { outline: 2px solid var(--primer-accent, #46e); border-radius: 0.25rem; }
`;

export class PrimerConcept extends HTMLElement {
  /** @type {((e: Event) => void) | null} */
  #onQuizGraded = null;

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    const meta = safeMeta();
    const title = meta?.title ?? this.getAttribute("title") ?? "Untitled concept";
    const id = meta?.id ?? (this.getAttribute("concept-id") || slug(title));
    const storageKey = `primer:confidence:${id}`;

    // The level sits to the right of the title on EVERY page: bold when declared in
    // metadata, normal weight when implicit (inherited from prerequisites). A declared
    // level is known from the page itself; an implicit level is read asynchronously
    // from the emitted graph (dist/graph.json) below.
    const declared = meta?.declaredLevel;
    const levelBadge =
      declared !== undefined
        ? `<span class="badge level-badge is-declared" title="${t("concept.level.declaredTitle")}">${t("concept.level.label", { level: formatLevel(declared) })}</span>`
        : `<span class="badge level-badge" title="${t("concept.level.implicitTitle")}" hidden>${t("concept.level.word")}</span>`;

    const stars = Array.from(
      { length: MAX_STARS },
      (_, i) =>
        `<button type="button" class="star" data-value="${i + 1}" ` +
        `aria-label="${t("concept.confidence.rate", { n: i + 1, max: MAX_STARS })}" title="${t("concept.confidence.rateTitle", { n: i + 1, max: MAX_STARS })}">${STAR_SVG}</button>`,
    ).join("");

    root.innerHTML = `
      <style>${STAR_CSS}</style>
      <article>
        <div class="title-row"><h1>${title}</h1>${levelBadge}</div>
        <div class="body"><slot></slot></div>
        <section class="confidence card" aria-label="${t("concept.confidence.legend")}">
          <p class="meta" id="conf-label" style="margin-top:0;">${t("concept.confidence.prompt")}</p>
          <div class="stars" role="group" aria-labelledby="conf-label">${stars}</div>
        </section>
      </article>`;

    const starEls = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll(".star")]);

    let rating = readConfidence(storageKey) ?? 0;
    paint(starEls, rating);

    for (const star of starEls) {
      const value = Number(star.dataset.value);
      // Clicking the star equal to the current rating clears back to 0; otherwise set.
      star.addEventListener("click", () => {
        rating = rating === value ? value - 1 : value;
        writeConfidence(storageKey, rating);
        paint(starEls, rating);
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

    // A graded quiz folds its result into the stars: the new rating is the average of the
    // current stars and the test percentage, or just the percentage when there are no stars
    // (rating 0). Re-emit confidence-change so the explorer recolours, exactly like a click.
    this.#onQuizGraded = (e) => {
      const fraction = /** @type {any} */ (e).detail?.fraction;
      if (typeof fraction !== "number") return;
      rating = combineRating(rating, fraction, MAX_STARS);
      writeConfidence(storageKey, rating);
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

    // For an implicit level, fill the (initially hidden) badge from the emitted graph.
    if (declared === undefined) void this.#showImplicitLevel(root, id);
  }

  disconnectedCallback() {
    if (this.#onQuizGraded) document.removeEventListener("quiz-graded", this.#onQuizGraded);
    this.#onQuizGraded = null;
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
 * @param {string} key
 * @returns {number | null}  The stored rating, or null if never rated.
 */
function readConfidence(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(MAX_STARS, Math.max(0, Math.round(n))) : null;
  } catch {
    return null; // localStorage may be unavailable (private mode, file://)
  }
}

/**
 * @param {string} key
 * @param {number} value
 */
function writeConfidence(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* best-effort persistence */
  }
}

if (!customElements.get("primer-concept")) {
  customElements.define("primer-concept", PrimerConcept);
}
