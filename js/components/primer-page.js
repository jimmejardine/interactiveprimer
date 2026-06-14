// @ts-check
/**
 * <primer-page subject="Mathematics" level="early-school" prerequisites="counting">
 *   <primer-concept ...>...</primer-concept>
 * </primer-page>
 *
 * The page shell: a consistent header (subject + optional level badge + prerequisite
 * links), the concept content (slotted), and a footer back to the tree. `level` here
 * is the level DECLARED by this page; if omitted, no badge is shown (the page may
 * still inherit a level via its prerequisites — that resolution happens in js/graph.js
 * when the whole tree is processed, not in this presentational component).
 * @module
 */

import { attachShared, parseIdList } from "./shared.js";
import { levelLabel } from "../levels.js";

/** @typedef {import("../types/domain.js").Level} Level */

export class PrimerPage extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    const subject = this.getAttribute("subject") ?? "Interactive Primer";
    const level = /** @type {Level | null} */ (this.getAttribute("level"));
    const prereqs = parseIdList(this.getAttribute("prerequisites"));

    const badge = level
      ? `<span class="badge" title="Declared level">${safeLevelLabel(level)}</span>`
      : "";

    const prereqList = prereqs.length
      ? `<nav class="prereqs meta" aria-label="Prerequisites">
           Prerequisites:
           ${prereqs
             .map((id) => `<a href="./${id}.html">${prettify(id)}</a>`)
             .join(", ")}
         </nav>`
      : `<p class="prereqs meta">No prerequisites — a good place to start.</p>`;

    root.innerHTML = `
      <header class="page-head">
        <p class="meta subject" style="margin-bottom:0.25rem;">${subject} ${badge}</p>
        ${prereqList}
      </header>
      <slot></slot>
      <footer class="page-foot meta" style="margin-top:2rem;">
        <a href="/index.html">↑ Back to the tree of knowledge</a>
      </footer>`;
  }
}

/**
 * Title-case an id like "complex-numbers" → "Complex numbers".
 * @param {string} id
 * @returns {string}
 */
function prettify(id) {
  const words = id.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Label a level, tolerating an unknown/typo'd attribute value gracefully.
 * @param {string} level
 * @returns {string}
 */
function safeLevelLabel(level) {
  try {
    return levelLabel(/** @type {Level} */ (level));
  } catch {
    return level;
  }
}

if (!customElements.get("primer-page")) {
  customElements.define("primer-page", PrimerPage);
}
