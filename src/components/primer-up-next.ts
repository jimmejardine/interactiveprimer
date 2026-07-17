/**
 * <primer-up-next> — the "Up next…" control at the BOTTOM of every concept page (inserted by
 * src/render.ts, replacing what used to be a second copy of the mini-explorer). It recommends where
 * to go next, computed by the pure `computeUpNext` (src/up-next.ts) from:
 *
 *   • the reader's focused course (src/course.ts) — a "(skipped)" catch-up link for the earliest
 *     genuinely-earlier unstarred member, and a "(next concept)" link for the first unstarred
 *     member after the current one;
 *   • the graph's direct successors (src/graph.ts `neighborhood`) — up to three unstarred concepts
 *     closest in difficulty level.
 *
 * When nothing qualifies (e.g. no course and every nearby successor is already starred) it falls
 * back to rendering the mini-explorer (`<primer-pathway>`), so the bottom of the page is never empty.
 * Loads /dist/graph.json once (shared with the top pathway); any failure renders nothing.
 * @module
 */

import type { ResolvedConcept } from "../types/domain.ts";

import { attachShared } from "./shared.ts";
import "./primer-pathway.ts"; // the empty-state fallback element (also guarantees it's defined)
import { conceptIdFromPath } from "../concept-meta.ts";
import { neighborhood } from "../graph.ts";
import { loadGraph } from "../graph-data.ts";
import { t, getLocale } from "../i18n.ts";
import { getCurrentCourse } from "../course.ts";
import { readEntry } from "../confidence-store.ts";
import { formatLevel } from "../levels.ts";
import { computeUpNext } from "../up-next.ts";
import { escapeHtml as esc } from "../html-entities.ts";

const STYLE = `
  :host { display: block; margin: var(--primer-gap, 1.4rem) 0; }

  .upnext {
    background: var(--primer-surface, #fff);
    border: 1px solid var(--primer-border, #ddd);
    border-radius: var(--primer-radius, 0.6rem);
    box-shadow: var(--primer-shadow-md, 0 6px 18px rgba(0,0,0,0.06));
    padding: 1.15rem 1.4rem;
  }
  /* A small signpost icon sits just to the right of the "Up next" heading text. */
  .heading {
    display: flex; align-items: center; gap: 0.5rem;
    font-family: var(--primer-font-display, var(--primer-font-body, serif));
    font-size: 1.1rem; margin: 0 0 0.7rem; color: var(--primer-ink, #111);
  }
  .signpost { flex: 0 0 auto; width: auto; height: 1.35rem; }

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
  #onCourseChange: (() => void) | null = null;

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
   */
  async #render(root: ShadowRoot) {
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
        starsOf: (cid) => readEntry(cid)?.stars ?? 0,
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
          const tagKey =
            it.kind === "skipped" ? "upNext.skipped" : it.kind === "next" ? "upNext.next" : it.kind === "review" ? "upNext.review" : "";
          const tag = tagKey ? `<span class="tag">(${esc(t(tagKey))})</span>` : "";
          const level =
            node && Number.isFinite(node.level)
              ? `<span class="row-level">${esc(t("concept.level.label", { level: formatLevel(node.level) }))}</span>`
              : "";
          return (
            `<li><a class="row" href="/concepts/${esc(it.id)}">` +
            `<span class="row-title">${title}</span>${tag}${level}</a></li>`
          );
        })
        .join("");

      root.innerHTML =
        `<style>${STYLE}</style>` +
        `<nav class="upnext" aria-label="${esc(t("upNext.heading"))}">` +
        `<h2 class="heading">${esc(t("upNext.heading"))}` +
        `<img class="signpost" src="/images/up-next.png" alt="" aria-hidden="true" /></h2>` +
        `<ul class="rows">${rows}</ul></nav>`;
    } catch (err) {
      console.warn("primer-up-next:", err);
    }
  }
}

/**
 * A concept's title in the active locale (plain text — no titleHtml/KaTeX in this shadow root),
 * falling back to the English title, then the id's last path segment.
 */
function titleOf(node: ResolvedConcept | undefined, locale: string, id: string): string {
  return node?.titles?.[locale] ?? node?.title ?? (id.split("/").pop() ?? id);
}

if (!customElements.get("primer-up-next")) {
  customElements.define("primer-up-next", PrimerUpNext);
}
