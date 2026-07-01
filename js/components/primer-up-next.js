// @ts-check
/**
 * <primer-up-next> — the "Up next…" control at the BOTTOM of every concept page (inserted by
 * js/render.js, replacing what used to be a second copy of the mini-explorer). It recommends where
 * to go next, computed by the pure `computeUpNext` (js/up-next.js) from:
 *
 *   • the reader's focused course (js/course.js) — a "(skipped)" catch-up link for the earliest
 *     genuinely-earlier unstarred member, and a "(next concept)" link for the first unstarred
 *     member after the current one;
 *   • the graph's direct successors (js/graph.js `neighborhood`) — up to three unstarred concepts
 *     closest in difficulty level.
 *
 * When nothing qualifies (e.g. no course and every nearby successor is already starred) it falls
 * back to rendering the mini-explorer (`<primer-pathway>`), so the bottom of the page is never empty.
 * Loads /dist/graph.json once (shared with the top pathway); any failure renders nothing.
 * @module
 */

import { attachShared } from "./shared.js";
import "./primer-pathway.js"; // the empty-state fallback element (also guarantees it's defined)
import { conceptIdFromPath } from "../concept-meta.js";
import { neighborhood } from "../graph.js";
import { loadGraph } from "../graph-data.js";
import { t, getLocale } from "../i18n.js";
import { getCurrentCourse } from "../course.js";
import { readEntry } from "../confidence-store.js";
import { formatLevel } from "../levels.js";
import { computeUpNext } from "../up-next.js";

/** @typedef {import("../types/domain.js").ResolvedConcept} ResolvedConcept */

const STYLE = `
  :host { display: block; margin: var(--primer-gap, 1.4rem) 0; }

  .upnext {
    background: var(--primer-surface, #fff);
    border: 1px solid var(--primer-border, #ddd);
    border-radius: var(--primer-radius, 0.6rem);
    box-shadow: var(--primer-shadow-md, 0 6px 18px rgba(0,0,0,0.06));
    padding: 1.15rem 1.4rem;
  }
  .heading {
    font-family: var(--primer-font-display, var(--primer-font-body, serif));
    font-size: 1.1rem; margin: 0 0 0.7rem; color: var(--primer-ink, #111);
  }

  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .row {
    display: flex; align-items: baseline; gap: 0.55rem;
    padding: 0.55rem 0.7rem; border-radius: 0.55rem;
    text-decoration: none; color: var(--primer-ink, #111);
    border: 1px solid var(--primer-border, #ddd);
    transition: border-color 0.13s ease, background-color 0.13s ease;
  }
  .row:hover { border-color: var(--primer-accent, #46e); }
  .row:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--primer-ring, rgba(70,90,230,0.4));
    border-color: var(--primer-accent, #46e);
  }
  .row-title { flex: 1 1 auto; min-width: 0; font-family: var(--primer-font-body, serif); }
  /* The (skipped) / (next concept) chip — a small accent-tinted label. */
  .tag {
    flex: 0 0 auto; font-family: var(--primer-font-ui, sans-serif);
    font-size: 0.72rem; letter-spacing: 0.01em;
    color: var(--primer-badge-ink, #3a45a6); background: var(--primer-badge-bg, #eef);
    border-radius: 999px; padding: 0.1rem 0.5rem;
  }
  .row-level {
    flex: 0 0 auto; font-family: var(--primer-font-ui, sans-serif);
    font-size: 0.72rem; color: var(--primer-ink-soft, #667);
  }

  @media (prefers-reduced-motion: reduce) { .row { transition: none; } }
`;

export class PrimerUpNext extends HTMLElement {
  /** @type {(() => void) | null} */
  #onCourseChange = null;

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    void this.#render(root);
    // Entering / leaving a course changes the recommendations — re-render in place.
    this.#onCourseChange = () => void this.#render(root);
    document.addEventListener("course-change", this.#onCourseChange);
  }

  disconnectedCallback() {
    if (this.#onCourseChange) document.removeEventListener("course-change", this.#onCourseChange);
    this.#onCourseChange = null;
  }

  /**
   * Compute and render the control (or the mini-explorer fallback). Best-effort: any failure
   * leaves the bottom of the page empty rather than breaking the lesson.
   * @param {ShadowRoot} root
   */
  async #render(root) {
    try {
      const id = conceptIdFromPath();
      if (!id) return;
      const { byId } = await loadGraph();
      if (!this.isConnected) return; // may have disconnected during the await
      if (!byId.has(id)) return;

      const locale = getLocale();
      const courseId = getCurrentCourse();
      const courseMembers = courseId ? byId.get(courseId)?.courseMembers ?? null : null;
      const successors = neighborhood(id, byId)?.successors ?? [];

      const items = computeUpNext({
        currentId: id,
        courseMembers,
        successors,
        isDone: (cid) => (readEntry(cid)?.stars ?? 0) > 0,
        levelOf: (cid) => byId.get(cid)?.level ?? 0,
        titleOf: (cid) => titleOf(byId.get(cid), locale, cid),
      });

      // Empty → fall back to the mini-explorer, so the page bottom is never blank.
      if (items.length === 0) {
        root.replaceChildren(document.createElement("primer-pathway"));
        return;
      }

      const rows = items
        .map((it) => {
          const node = byId.get(it.id);
          const title = esc(titleOf(node, locale, it.id));
          const tag =
            it.kind === "skipped"
              ? `<span class="tag">(${esc(t("upNext.skipped"))})</span>`
              : it.kind === "next"
                ? `<span class="tag">(${esc(t("upNext.next"))})</span>`
                : "";
          const level =
            node && Number.isFinite(node.level)
              ? `<span class="row-level">${esc(t("concept.level.label", { level: formatLevel(node.level) }))}</span>`
              : "";
          return (
            `<li><a class="row" href="/concepts/${esc(it.id)}.html">` +
            `<span class="row-title">${title}</span>${tag}${level}</a></li>`
          );
        })
        .join("");

      root.innerHTML =
        `<style>${STYLE}</style>` +
        `<nav class="upnext" aria-label="${esc(t("upNext.heading"))}">` +
        `<h2 class="heading">${esc(t("upNext.heading"))}</h2>` +
        `<ul class="rows">${rows}</ul></nav>`;
    } catch (err) {
      console.warn("primer-up-next:", err);
    }
  }
}

/**
 * A concept's title in the active locale (plain text — no titleHtml/KaTeX in this shadow root),
 * falling back to the English title, then the id's last path segment.
 * @param {ResolvedConcept | undefined} node @param {string} locale @param {string} id
 * @returns {string}
 */
function titleOf(node, locale, id) {
  return node?.titles?.[locale] ?? node?.title ?? (id.split("/").pop() ?? id);
}

/** Escape text for safe HTML interpolation. @param {string} s @returns {string} */
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

if (!customElements.get("primer-up-next")) {
  customElements.define("primer-up-next", PrimerUpNext);
}
