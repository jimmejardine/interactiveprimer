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
 * After the words it appends a small ⧉ glyph (a monochrome text character, so it takes a
 * colour) tinted with the target concept's confidence shading — the very same
 * RED→YELLOW→GREEN star ramp the pathway nodes use (see js/confidence-color.js) — so a
 * reference shows, at a glance, how well you know where it leads. Unrated, it falls back to
 * the default ink colour. It repaints live when the rating or theme changes.
 *
 * The `to` ids are a machine-readable record of cross-references: like `prerequisites`,
 * they can later be harvested, and build-graph could flag a `to` that names no concept.
 *
 * The optional `forward` / `soft` attributes only affect the GRAPH BUILD (js/concept-refs.js),
 * not this control — it renders the same styled link + confidence dot regardless. `forward`
 * reverses the harvested edge (this page becomes a prerequisite of the target); `soft` harvests
 * no edge at all (a plain "see also" between concepts with no learning dependency).
 * @module
 */

import { loadGraph } from "../graph-data.js";
import { getLocale, t } from "../i18n.js";
import { confidenceColor } from "../confidence-color.js";
import { createContextMenu } from "../context-menu.js";
import { isTodoRef } from "../concept-refs.js";

/** Last path segment of an id — a readable label before/without the graph. @param {string} id */
function leaf(id) {
  return id.split("/").pop() ?? id;
}

/** Whether the document-wide concept-ref context menu has been wired (do it once). */
let refTriggersWired = false;

/**
 * Make right-click (and touch long-press) on any concept reference open the same Open/Explore popup
 * the graph explorers use. Delegated at the document level so it covers every <primer-ref> with a
 * single set of listeners, no matter how many are on the page. Idempotent.
 */
function ensureRefContextMenu() {
  if (refTriggersWired) return;
  refTriggersWired = true;

  const menu = createContextMenu(document.body, [
    // "Open" — same as clicking the reference: go to that concept's lesson.
    { label: t("contextmenu.open"), run: (id) => { window.location.href = `/concepts/${id}.html`; } },
    // "Explore" — open the full map centred on that concept.
    { label: t("menu.explore"), run: (id) => { window.location.href = `/concepts.html?id=${encodeURIComponent(id)}`; } },
  ]);

  /** The real concept id of the <primer-ref> under an event (empty/`todo/…` → null, so a placeholder
   * gets no Open/Explore menu — there's no page to open). @param {Event} e */
  const refIdAt = (e) => {
    const ref = /** @type {Element} */ (e.target)?.closest?.("primer-ref");
    const id = ref?.getAttribute("to")?.trim();
    return id && !isTodoRef(id) ? id : null;
  };

  // Right-click a concept reference → our menu (in place of the browser's default link menu).
  document.addEventListener("contextmenu", (e) => {
    const id = refIdAt(e);
    if (!id) return;
    e.preventDefault();
    menu.open(id, /** @type {MouseEvent} */ (e).clientX, /** @type {MouseEvent} */ (e).clientY);
  });

  // Touch long-press → the same menu; the finger-up's click on the <a> is swallowed so it doesn't
  // also navigate. (A mouse uses the native `contextmenu` event above.)
  let timer = 0, sx = 0, sy = 0, suppressClick = false;
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = 0; } };
  document.addEventListener("pointerdown", (e) => {
    suppressClick = false;
    if (e.pointerType === "mouse") return;
    const id = refIdAt(e);
    if (!id) return;
    sx = e.clientX; sy = e.clientY;
    clearTimer();
    timer = window.setTimeout(() => {
      timer = 0;
      suppressClick = true;
      menu.open(id, sx, sy);
    }, 500);
  }, true);
  document.addEventListener("pointermove", (e) => {
    if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimer();
  }, true);
  document.addEventListener("pointerup", clearTimer, true);
  document.addEventListener("pointercancel", clearTimer, true);
  document.addEventListener("click", (e) => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; }
  }, true);
}

export class PrimerRef extends HTMLElement {
  /** @type {HTMLElement | null} */
  #icon = null;
  /** @type {((e: Event) => void) | null} */
  #onConfidence = null;
  /** @type {(() => void) | null} */
  #onTheme = null;

  async connectedCallback() {
    // Right-click / long-press on any concept ref opens the same Open/Explore menu as the explorers
    // (wired once, document-wide).
    ensureRefContextMenu();

    // Idempotent: if we've already wrapped the contents, do nothing on re-connect.
    if (this.querySelector(".concept-ref")) return;

    const id = (this.getAttribute("to") ?? "").trim();

    // A `todo/…` placeholder: a planned-but-unwritten concept. Render a muted, NON-link "todo" chip —
    // there's no page to open, no rating to show, and no graph entry to look up.
    if (isTodoRef(id)) {
      const span = document.createElement("span");
      span.className = "concept-ref concept-todo";
      span.title = t("ref.todoTitle");
      while (this.firstChild) span.appendChild(this.firstChild);
      if (!(span.textContent ?? "").trim()) span.textContent = leaf(id).replace(/-/g, " ");
      const tag = document.createElement("span");
      tag.className = "concept-todo-tag";
      tag.textContent = t("ref.todo");
      this.append(span, tag);
      return;
    }

    const a = document.createElement("a");
    a.className = "concept-ref";
    a.setAttribute("href", id ? `/concepts/${id}.html` : "#");
    // Move the author's inline content (text, <primer-math>, …) into the anchor.
    while (this.firstChild) a.appendChild(this.firstChild);
    this.appendChild(a);

    // The ⧉ confidence icon, tinted from the TARGET concept's rating and kept in sync. It's a
    // second link to the same page (a mouse convenience), but hidden from assistive tech and
    // taken out of the tab order so the anchor above stays the single accessible reference.
    if (id) {
      const icon = document.createElement("a");
      icon.className = "concept-ref-icon";
      icon.setAttribute("href", `/concepts/${id}.html`);
      icon.setAttribute("aria-hidden", "true");
      icon.setAttribute("tabindex", "-1");
      icon.textContent = "⧉";
      this.appendChild(icon);
      this.#icon = icon;
      this.#paintIcon(id);

      // Repaint when the learner re-rates this target (a click elsewhere fires this), and
      // when the theme changes (the glyph's colour is an inline hsl built from theme tokens,
      // so unlike a CSS var it won't update itself).
      this.#onConfidence = (e) => {
        if (/** @type {any} */ (e).detail?.conceptId === id) this.#paintIcon(id);
      };
      document.addEventListener("confidence-change", this.#onConfidence);
      this.#onTheme = () => this.#paintIcon(id);
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

  /** Tint the icon from the target's rating; empty (CSS default ink) when unrated. @param {string} id */
  #paintIcon(id) {
    if (this.#icon) this.#icon.style.color = confidenceColor(id) ?? "";
  }
}

if (!customElements.get("primer-ref")) {
  customElements.define("primer-ref", PrimerRef);
}
