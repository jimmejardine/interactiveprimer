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
import { formatLevel } from "../levels.js";

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
  .stars { display: inline-flex; gap: 0.15rem; }
  .star {
    padding: 0.1rem; border: none; background: none; line-height: 0;
    color: var(--primer-border, #ccc); cursor: pointer;
  }
  .star svg { width: 1.6rem; height: 1.6rem; fill: currentColor; transition: color 0.08s ease; }
  .star.filled { color: #f5b301; }            /* selected or previewed */
  .star:focus-visible { outline: 2px solid var(--primer-accent, #46e); border-radius: 0.25rem; }
`;

export class PrimerConcept extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    const meta = safeMeta();
    const title = meta?.title ?? this.getAttribute("title") ?? "Untitled concept";
    const id = meta?.id ?? (this.getAttribute("concept-id") || slug(title));
    const storageKey = `primer:confidence:${id}`;

    // The declared level sits to the right of the concept's title (if declared).
    const levelBadge =
      meta?.declaredLevel !== undefined
        ? `<span class="badge" title="Declared level">Level ${formatLevel(meta.declaredLevel)}</span>`
        : "";

    const stars = Array.from(
      { length: MAX_STARS },
      (_, i) =>
        `<button type="button" class="star" data-value="${i + 1}" ` +
        `aria-label="Rate ${i + 1} out of ${MAX_STARS}" title="${i + 1} / ${MAX_STARS}">${STAR_SVG}</button>`,
    ).join("");

    root.innerHTML = `
      <style>${STAR_CSS}</style>
      <article>
        <div class="title-row"><h1>${title}</h1>${levelBadge}</div>
        <div class="body"><slot></slot></div>
        <section class="confidence card" aria-label="Your confidence">
          <p class="meta" id="conf-label" style="margin-top:0;">How confident are you with this concept?</p>
          <div class="stars" role="group" aria-labelledby="conf-label">${stars}</div>
          <p class="rating-text meta" role="status" aria-live="polite" style="margin-bottom:0;"></p>
        </section>
      </article>`;

    const starEls = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll(".star")]);
    const ratingText = /** @type {HTMLElement} */ (root.querySelector(".rating-text"));

    let rating = readConfidence(storageKey) ?? 0;
    paint(starEls, rating);
    setText(ratingText, rating, readConfidence(storageKey) === null);

    for (const star of starEls) {
      const value = Number(star.dataset.value);
      // Clicking the star equal to the current rating clears back to 0; otherwise set.
      star.addEventListener("click", () => {
        rating = rating === value ? value - 1 : value;
        writeConfidence(storageKey, rating);
        paint(starEls, rating);
        setText(ratingText, rating, false);
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
 * @param {HTMLElement} el
 * @param {number} rating
 * @param {boolean} unrated
 */
function setText(el, rating, unrated) {
  el.textContent = unrated ? "Not yet rated" : `${rating} / ${MAX_STARS} stars`;
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
