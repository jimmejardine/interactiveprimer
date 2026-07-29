/**
 * The shared Wikipedia-lookup popup — a single floating card reused for every selection lookup.
 * Positioning + dismissal mirror src/context-menu.ts (a `position: fixed` element on
 * `document.body`, viewport-clamped, dismissed on Escape / outside-pointerdown / scroll / resize).
 * Styling lives in css/primer.css (`.wiki-card`), so it re-themes via `--primer-*` tokens.
 * @module
 */

import { type WikiSummary } from "./wiki.ts";
import { t } from "./i18n.ts";

let card: HTMLDivElement | null = null;
let body: HTMLDivElement | null = null;
let anchor: DOMRect | null = null;
let attached = false;

/** Build the singleton card (once) and return it. */
function ensureCard(): HTMLDivElement {
  if (card) return card;
  card = document.createElement("div");
  card.className = "wiki-card";
  card.hidden = true;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", t("wiki.label"));

  const close = document.createElement("button");
  close.type = "button";
  close.className = "wiki-card-close";
  close.setAttribute("aria-label", t("wiki.close"));
  close.textContent = "✕";
  close.addEventListener("click", hideWikiCard);

  body = document.createElement("div");
  body.className = "wiki-card-body";

  card.append(close, body);
  document.body.appendChild(card);
  return card;
}

/** Place the card just below the selection, flipping above and clamping to the viewport. */
function place(): void {
  if (!card || !anchor) return;
  card.style.left = "0px";
  card.style.top = "0px";
  const r = card.getBoundingClientRect();
  const margin = 8;
  const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - r.width - margin));
  let top = anchor.bottom + 6;
  if (top + r.height > window.innerHeight - margin) {
    const above = anchor.top - r.height - 6;
    top = above >= margin ? above : Math.max(margin, window.innerHeight - r.height - margin);
  }
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function renderSummary(s: WikiSummary): void {
  if (!body) return;
  const nodes: Node[] = [];
  if (s.thumbnail) {
    const img = document.createElement("img");
    img.className = "wiki-card-thumb";
    img.src = s.thumbnail;
    img.alt = "";
    img.loading = "lazy";
    nodes.push(img);
  }
  nodes.push(makeText("wiki-card-title", s.title));
  nodes.push(makeText("wiki-card-extract", s.extract)); // textContent — XSS-safe

  const foot = document.createElement("div");
  foot.className = "wiki-card-foot";
  const link = document.createElement("a");
  link.className = "wiki-card-link";
  link.href = s.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = t("wiki.readMore") + " →";
  foot.appendChild(link);
  nodes.push(foot);

  body.replaceChildren(...nodes);
}

function makeText(className: string, text: string): HTMLElement {
  const el = document.createElement(className.includes("title") ? "div" : "p");
  el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Show the card anchored to `rect` (a selection's bounding box) with an already-fetched summary.
 * The caller only calls this when there IS an article — the card never shows a loading or
 * "not found" state.
 */
export function showWikiCard(rect: DOMRect, summary: WikiSummary): void {
  ensureCard();
  anchor = rect;
  renderSummary(summary);
  card!.hidden = false;
  place();
  attach();
}

/** Hide the card and drop its dismissal listeners. */
export function hideWikiCard(): void {
  if (card && !card.hidden) card.hidden = true;
  detach();
}

// --- Dismissal (capture-phase, like context-menu) -----------------------------------------------

const onDown = (e: Event) => {
  if (card && !e.composedPath().includes(card)) hideWikiCard();
};
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape") hideWikiCard();
};
const onSelChange = () => {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed) hideWikiCard();
};

function attach(): void {
  if (attached) return;
  attached = true;
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("selectionchange", onSelChange);
  window.addEventListener("scroll", hideWikiCard, true);
  window.addEventListener("resize", hideWikiCard);
}

function detach(): void {
  if (!attached) return;
  attached = false;
  document.removeEventListener("pointerdown", onDown, true);
  document.removeEventListener("keydown", onKey, true);
  document.removeEventListener("selectionchange", onSelChange);
  window.removeEventListener("scroll", hideWikiCard, true);
  window.removeEventListener("resize", hideWikiCard);
}
