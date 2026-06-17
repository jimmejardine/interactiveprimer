// @ts-check
/**
 * <primer-ref to="id"> — an inline link from one lesson to another concept, the in-text
 * counterpart to the auto-generated <primer-pathway> map. Two ways to author it:
 *
 *   two lines are <primer-ref to="geometry/parallel-lines">parallel</primer-ref> when …
 *   see <primer-ref to="geometry/parallel-lines"></primer-ref>   <!-- title from the graph -->
 *
 * Like <primer-card>/<primer-theorem> it stays in the light DOM: on connect it wraps its
 * own contents in an <a class="concept-ref" href="/concepts/<id>.html"> (so the link is
 * styled by css/primer.css, where slotted content is styled). If the author gave no text,
 * the anchor is filled with the target concept's title, resolved from the shared graph
 * (dist/graph.json) and shown in the active locale — the same title lookup the pathway map
 * uses. If the graph can't be fetched, a readable fallback (the id's last segment) stays.
 *
 * After the words it appends a small dot whose colour is the target concept's confidence
 * shading — the very same RED→YELLOW→GREEN star ramp the pathway nodes use (see
 * js/confidence-color.js) — so a reference shows, at a glance, how well you know where it
 * leads. The dot repaints live when the rating or theme changes.
 *
 * The `to` ids are a machine-readable record of cross-references: like `prerequisites`,
 * they can later be harvested, and build-graph could flag a `to` that names no concept.
 * @module
 */

import { loadGraph } from "../graph-data.js";
import { getLocale } from "../i18n.js";
import { confidenceColor } from "../confidence-color.js";

/** Last path segment of an id — a readable label before/without the graph. @param {string} id */
function leaf(id) {
  return id.split("/").pop() ?? id;
}

export class PrimerRef extends HTMLElement {
  /** @type {HTMLElement | null} */
  #dot = null;
  /** @type {((e: Event) => void) | null} */
  #onConfidence = null;
  /** @type {(() => void) | null} */
  #onTheme = null;

  async connectedCallback() {
    // Idempotent: if we've already wrapped the contents, do nothing on re-connect.
    if (this.querySelector("a.concept-ref")) return;

    const id = (this.getAttribute("to") ?? "").trim();

    const a = document.createElement("a");
    a.className = "concept-ref";
    a.setAttribute("href", id ? `/concepts/${id}.html` : "#");
    // Move the author's inline content (text, <primer-math>, …) into the anchor.
    while (this.firstChild) a.appendChild(this.firstChild);
    this.appendChild(a);

    // The confidence dot, painted from the TARGET concept's rating and kept in sync. It's a
    // second link to the same page (a mouse convenience), but hidden from assistive tech and
    // taken out of the tab order so the anchor above stays the single accessible reference.
    if (id) {
      const dot = document.createElement("a");
      dot.className = "concept-ref-dot";
      dot.setAttribute("href", `/concepts/${id}.html`);
      dot.setAttribute("aria-hidden", "true");
      dot.setAttribute("tabindex", "-1");
      this.appendChild(dot);
      this.#dot = dot;
      this.#paintDot(id);

      // Repaint when the learner re-rates this target (a click elsewhere fires this), and
      // when the theme changes (the dot's fill is an inline hsl built from theme tokens, so
      // unlike a CSS var it won't update itself).
      this.#onConfidence = (e) => {
        if (/** @type {any} */ (e).detail?.conceptId === id) this.#paintDot(id);
      };
      document.addEventListener("confidence-change", this.#onConfidence);
      this.#onTheme = () => this.#paintDot(id);
      document.addEventListener("theme-change", this.#onTheme);
    }

    // No author text → use the target's title. Show a fallback immediately, then upgrade
    // to the real (locale-aware) title once the graph loads. Never block the lesson on it.
    if (id && (a.textContent ?? "").trim() === "") {
      a.textContent = leaf(id);
      try {
        const { byId } = await loadGraph();
        if (!this.isConnected) return;
        const c = byId.get(id);
        if (c) a.textContent = c.titles?.[getLocale()] ?? c.title ?? leaf(id);
      } catch {
        // Keep the fallback label — a missing graph must not break the page.
      }
    }
  }

  disconnectedCallback() {
    if (this.#onConfidence) document.removeEventListener("confidence-change", this.#onConfidence);
    this.#onConfidence = null;
    if (this.#onTheme) document.removeEventListener("theme-change", this.#onTheme);
    this.#onTheme = null;
  }

  /** Set the dot's fill from the target's rating; empty (CSS default) when unrated. @param {string} id */
  #paintDot(id) {
    if (this.#dot) this.#dot.style.background = confidenceColor(id) ?? "";
  }
}

if (!customElements.get("primer-ref")) {
  customElements.define("primer-ref", PrimerRef);
}
