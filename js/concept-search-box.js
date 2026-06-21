// @ts-check
/**
 * A reusable concept-name search box: a text input plus a ranked dropdown (powered by the pure
 * `searchConcepts`). The full-screen explorer (js/concept-graph.js) and the per-lesson pathway
 * (js/components/primer-pathway.js) mount the SAME box, so search behaves identically everywhere —
 * each just supplies the concept list, a navigation callback, and where to mount.
 *
 * Styles live in `SEARCH_BOX_CSS`; inject them into a document `<head>` (light DOM) or a shadow
 * root (Web Component), matching where the box is mounted. Colours use `--primer-*` tokens.
 * @module
 */

import { searchConcepts } from "./concept-search.js";

/** Stylesheet for the box — themed; the caller injects it where the box lives. */
export const SEARCH_BOX_CSS = `
  .cg-search { position: relative; width: min(20rem, 70vw); font-family: var(--primer-font-ui, sans-serif); }
  /* Placement variants: "overlay" pins it over the explorer's canvas; "fixed" pins it to the
     viewport's top-left (mirroring the top-right hamburger); default flows in-place. */
  .cg-search--overlay { position: absolute; top: 0.7rem; left: 0.7rem; z-index: 5; }
  .cg-search--fixed { position: fixed; top: 0.75rem; left: 0.75rem; z-index: 1000; width: min(17rem, 58vw); }
  .cg-search-input {
    width: 100%; box-sizing: border-box; font: inherit; font-size: 0.92rem;
    padding: 0.5rem 0.7rem; border-radius: var(--primer-radius, 0.6rem);
    border: 1px solid var(--primer-border, #ccc);
    background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
    box-shadow: var(--primer-shadow-md, 0 2px 8px rgba(0, 0, 0, 0.12));
    transition: box-shadow 0.13s ease, border-color 0.13s ease;
  }
  .cg-search-input:focus {
    outline: none; border-color: var(--primer-accent, #46e);
    box-shadow: var(--primer-shadow-md, 0 2px 8px rgba(0,0,0,0.12)), 0 0 0 3px var(--primer-ring, rgba(70,90,230,0.4));
  }
  .cg-results {
    position: absolute; top: calc(100% + 0.4rem); left: 0; right: 0; z-index: 6;
    list-style: none; margin: 0; padding: 0.3rem; max-height: 16rem; overflow-y: auto;
    background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
    border: 1px solid var(--primer-border, #ccc); border-radius: var(--primer-radius, 0.6rem);
    box-shadow: var(--primer-shadow-lg, 0 12px 36px rgba(0, 0, 0, 0.18));
  }
  .cg-results[hidden] { display: none; }
  .cg-result { display: flex; flex-direction: column; gap: 0.05rem; padding: 0.35rem 0.5rem; border-radius: 0.4rem; cursor: pointer; }
  .cg-result:hover, .cg-result.is-active { background: var(--primer-accent, #46e); color: var(--primer-accent-ink, #fff); }
  .cg-result-title { font-size: 0.92rem; }
  .cg-result-id { font-size: 0.72rem; opacity: 0.7; }
  .cg-result:hover .cg-result-id, .cg-result.is-active .cg-result-id { opacity: 0.85; }
`;

/** Distinguishes element ids across multiple boxes on one page (explorer + two pathways). */
let seq = 0;

/**
 * Mount a search box into `host`. Typing ranks `items` by name and shows up to 10 matches; clicking
 * a row, or Enter on the active/first row, calls `onSelect(id)`. ArrowUp/Down move the active row,
 * Escape and an outside click close it.
 * @param {HTMLElement} host
 * @param {{ items: { id: string, title: string }[], onSelect: (id: string) => void, placement?: "inline" | "overlay" | "fixed", placeholder?: string }} opts
 * @returns {{ destroy: () => void }}
 */
export function mountSearchBox(host, { items, onSelect, placement = "inline", placeholder = "Search concepts…" }) {
  const uid = `cg-search-${++seq}`;
  const search = document.createElement("div");
  const variant = placement === "overlay" ? " cg-search--overlay" : placement === "fixed" ? " cg-search--fixed" : "";
  search.className = "cg-search" + variant;
  search.innerHTML =
    `<input class="cg-search-input" type="search" autocomplete="off" spellcheck="false"` +
    ` placeholder="${placeholder}" aria-label="${placeholder}" role="combobox"` +
    ` aria-expanded="false" aria-controls="${uid}" aria-autocomplete="list" />` +
    `<ul class="cg-results" id="${uid}" role="listbox" hidden></ul>`;
  host.appendChild(search);
  const input = /** @type {HTMLInputElement} */ (search.querySelector(".cg-search-input"));
  const list = /** @type {HTMLElement} */ (search.querySelector(".cg-results"));

  /** @type {{ id: string, title: string }[]} */
  let results = [];
  let activeIdx = -1;

  const closeList = () => {
    list.hidden = true;
    list.replaceChildren();
    results = [];
    activeIdx = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };
  /** Move the active row (wrapping); -1 clears it. @param {number} i */
  const setActive = (i) => {
    const els = [...list.children];
    activeIdx = els.length ? ((i % els.length) + els.length) % els.length : -1;
    els.forEach((el, idx) => el.classList.toggle("is-active", idx === activeIdx));
    if (activeIdx >= 0) {
      const el = /** @type {HTMLElement} */ (els[activeIdx]);
      input.setAttribute("aria-activedescendant", el.id);
      el.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  };
  /** @param {number} i */
  const select = (i) => {
    const r = results[i];
    if (!r) return;
    input.value = "";
    closeList();
    onSelect(r.id);
  };
  const renderResults = () => {
    results = searchConcepts(items, input.value, 10);
    list.replaceChildren();
    if (!results.length) return closeList();
    results.forEach((r, i) => {
      const li = document.createElement("li");
      li.className = "cg-result";
      li.id = `${uid}-opt-${i}`;
      li.setAttribute("role", "option");
      li.dataset.id = r.id;
      const title = document.createElement("span");
      title.className = "cg-result-title";
      title.textContent = r.title;
      const sub = document.createElement("span");
      sub.className = "cg-result-id";
      sub.textContent = r.id;
      li.append(title, sub);
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    setActive(0);
  };

  const onInput = () => renderResults();
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (list.hidden) renderResults();
      else setActive(activeIdx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(activeIdx - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(activeIdx >= 0 ? activeIdx : 0);
    } else if (e.key === "Escape") {
      input.value = "";
      closeList();
      input.blur();
    }
  };
  // Select on pointerdown (before the input blurs) so a click reliably opens the row.
  const onListDown = (/** @type {Event} */ e) => {
    const li = /** @type {Element} */ (e.target).closest?.(".cg-result");
    if (!li) return;
    e.preventDefault();
    const idx = [...list.children].indexOf(li);
    if (idx >= 0) select(idx);
  };
  const onDocDown = (/** @type {Event} */ e) => {
    if (!e.composedPath().includes(search)) closeList(); // composedPath is shadow-aware
  };
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKey);
  list.addEventListener("pointerdown", onListDown);
  document.addEventListener("pointerdown", onDocDown);

  return {
    destroy() {
      document.removeEventListener("pointerdown", onDocDown);
      search.remove();
    },
  };
}
