// @ts-check
/**
 * <primer-concept title="Addition" concept-id="addition"> — the body of a concept,
 * with a self-attested confidence control whose value persists in localStorage.
 *
 *   <primer-concept title="Addition" concept-id="addition">
 *     ...explanatory content, <primer-math>, <primer-manim>, <primer-quiz>...
 *   </primer-concept>
 *
 * If concept-id is omitted it is derived from the title slug.
 * @module
 */

import { attachShared, slug } from "./shared.js";
import { getConceptMeta } from "../concept-meta.js";

/** Confidence labels, indexed 0..3 (see Confidence type). */
const CONFIDENCE_LABELS = ["Not yet", "Shaky", "Comfortable", "Mastered"];

export class PrimerConcept extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    // The inline concept-meta block is the single source of truth; attributes are
    // only a fallback for quick prototyping.
    const meta = safeMeta();
    const title = meta?.title ?? this.getAttribute("title") ?? "Untitled concept";
    const id = meta?.id ?? (this.getAttribute("concept-id") || slug(title));
    const storageKey = `primer:confidence:${id}`;

    root.innerHTML = `
      <article>
        <h1>${title}</h1>
        <div class="body"><slot></slot></div>
        <section class="confidence card" aria-label="Your confidence">
          <p class="meta" style="margin-top:0;">How confident are you with this concept?</p>
          <div class="buttons" role="group">
            ${CONFIDENCE_LABELS.map(
              (label, i) =>
                `<button type="button" data-value="${i}" aria-pressed="false">${label}</button>`,
            ).join("")}
          </div>
        </section>
      </article>`;

    const buttons = /** @type {HTMLButtonElement[]} */ ([
      ...root.querySelectorAll(".confidence button"),
    ]);

    const saved = readConfidence(storageKey);
    if (saved !== null) reflect(buttons, saved);

    for (const btn of buttons) {
      btn.addEventListener("click", () => {
        const value = Number(btn.dataset.value);
        writeConfidence(storageKey, value);
        reflect(buttons, value);
        this.dispatchEvent(
          new CustomEvent("confidence-change", {
            detail: { conceptId: id, value },
            bubbles: true,
          }),
        );
      });
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
 * @param {HTMLButtonElement[]} buttons
 * @param {number} value
 */
function reflect(buttons, value) {
  for (const b of buttons) {
    b.setAttribute("aria-pressed", String(Number(b.dataset.value) === value));
  }
}

/**
 * @param {string} key
 * @returns {number | null}
 */
function readConfidence(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : Number(raw);
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
