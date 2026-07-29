/**
 * Watches for a short text selection in the lesson prose and pops a Wikipedia-summary card next
 * to it (src/wiki-card.ts). Selection-driven — nothing is authored in the page. A whole-sentence
 * selection is left alone (see {@link shouldLookup}) so ordinary copying still works.
 * @module
 */

import { shouldLookup, fetchWikiSummary } from "./wiki.ts";
import { showWikiCard, hideWikiCard } from "./wiki-card.ts";
import { getLocale } from "./i18n.ts";

let inited = false;
/** Bumped on every selection so a slow fetch resolving after a newer selection is ignored. */
let lookupToken = 0;

/**
 * True if `node` sits inside the lesson prose (a `.card` / `<primer-concept>`), rather than the
 * chrome (menu), a form field, or the lookup card itself.
 */
function inProse(node: Node | null): boolean {
  let el: Element | null =
    node == null ? null : node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  for (; el; el = el.parentElement) {
    const tag = el.tagName;
    if (tag === "PRIMER-MENU" || tag === "INPUT" || tag === "TEXTAREA") return false;
    if (el.classList.contains("wiki-card")) return false;
    if (tag === "PRIMER-CONCEPT" || el.classList.contains("card")) return true;
  }
  return false;
}

async function handleSelection(): Promise<void> {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return; // native collapse handled by the card
  const text = sel.toString().trim();
  const token = ++lookupToken;
  if (!shouldLookup(text) || !inProse(sel.anchorNode)) {
    hideWikiCard(); // e.g. a whole-sentence selection — get out of the way of copying
    return;
  }

  // Fetch first: only pop the card when there is actually an article (no "not found" state).
  const summary = await fetchWikiSummary(text, [...new Set([getLocale(), "en"])]);
  if (token !== lookupToken || !summary) return; // superseded, or no article → show nothing

  // Re-read the (still-live) selection so the card is anchored to where it is now.
  const cur = window.getSelection();
  if (!cur || cur.isCollapsed || cur.toString().trim() !== text) return;
  const rect = cur.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  showWikiCard(rect, summary);
}

/** Mount the selection watcher once for the page. */
export function initWikiLookup(): void {
  if (inited || typeof document === "undefined") return;
  inited = true;
  // Fire when a selection gesture ends (selectionchange is too noisy). A tiny defer lets the
  // browser settle the final selection first.
  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(handleSelection, 10);
  };
  document.addEventListener("mouseup", schedule);
  document.addEventListener("touchend", schedule);
}
