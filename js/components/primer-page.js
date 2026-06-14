// @ts-check
/**
 * <primer-page> — the page shell: a consistent header (subject + optional level
 * badge + prerequisite links), the concept content (slotted), and a footer back to
 * the tree.
 *
 * Concept data (id, declared level, prerequisites) comes from the page's inline
 * `<script class="concept-meta">` block — the single source of truth — not from
 * attributes. The `subject` attribute is optional chrome; if omitted it is derived
 * from the first segment of the concept's full-path id.
 *
 * Note: the badge shows the level DECLARED by this page (if any). The fully
 * propagated level across the whole tree is computed by the graph build script
 * (js/graph.js) and consumed by the knowledge explorer, not here.
 * @module
 */

import { attachShared } from "./shared.js";
import { getConceptMeta } from "../concept-meta.js";
import { levelBand, formatLevel } from "../levels.js";

export class PrimerPage extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    const meta = safeMeta();
    const id = meta?.id ?? "";
    const subject = this.getAttribute("subject") ?? subjectFromId(id);
    const declared = meta?.declaredLevel;
    const prereqs = meta?.prerequisites ?? [];

    const badge =
      declared !== undefined
        ? `<span class="badge" title="Declared level">Level ${formatLevel(declared)} · ${levelBand(declared)}</span>`
        : "";

    const prereqList = prereqs.length
      ? `<nav class="prereqs meta" aria-label="Prerequisites">
           Prerequisites:
           ${prereqs.map((pid) => `<a href="/concepts/${pid}.html">${prettify(pid)}</a>`).join(", ")}
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

/** @returns {import("../types/domain.js").ConceptMeta | null} */
function safeMeta() {
  try {
    return getConceptMeta();
  } catch (err) {
    console.error("Invalid concept-meta block:", err);
    return null;
  }
}

/**
 * Last path segment of a full-path id, title-cased: "mathematics/arithmetic/addition"
 * → "Addition".
 * @param {string} id
 * @returns {string}
 */
function prettify(id) {
  const leaf = id.split("/").pop() ?? id;
  const words = leaf.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * First path segment of a full-path id, title-cased: "mathematics/arithmetic/addition"
 * → "Mathematics".
 * @param {string} id
 * @returns {string}
 */
function subjectFromId(id) {
  const head = id.split("/")[0] ?? "";
  if (!head) return "Interactive Primer";
  return head.charAt(0).toUpperCase() + head.slice(1);
}

if (!customElements.get("primer-page")) {
  customElements.define("primer-page", PrimerPage);
}
