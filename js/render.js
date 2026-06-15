// @ts-check
/**
 * render.js — builds a concept page's shell at runtime so authors don't write it.
 *
 * A slim page's <body> contains only the content (one or more <primer-card>s) plus
 * the inline `concept-meta` JSON block and an optional inline scene <script>. This
 * module imports the Primer custom elements, then wraps that content in the shell
 * the pages used to spell out by hand:
 *
 *   <main class="primer-shell">
 *     <primer-page>          header (level badge + prerequisites) + footer
 *       <primer-pathway>     navigation map (top)
 *       <primer-concept>     <h1> title + slotted body + confidence control
 *         ...the cards...
 *       </primer-concept>
 *       <primer-pathway>     navigation map (bottom)
 *     </primer-page>
 *   </main>
 *
 * <primer-page> and <primer-concept> read everything they need from the page's
 * `concept-meta` block (see js/concept-meta.js), so no attributes are required here.
 * This module also sets the document title from that block (boot.js can't: it runs
 * first, before the block is parsed).
 * @module
 */

import "primer";
import { getConceptMeta } from "./concept-meta.js";

/** Build the page shell once the DOM is ready. */
function render() {
  const body = document.body;

  // Title from the concept metadata (the page writes no <head>/<title>).
  try {
    const meta = getConceptMeta();
    if (meta) document.title = `${meta.title} — Interactive Primer`;
  } catch {
    /* malformed metadata — the components surface the error on the page */
  }

  // The content is every direct element child of <body> that isn't a <script>:
  // this leaves the `concept-meta` JSON block and any inline scene script in place.
  const content = /** @type {Element[]} */ (
    [...body.children].filter((el) => el.tagName !== "SCRIPT")
  );
  if (content.length === 0) return;

  const main = document.createElement("main");
  main.className = "primer-shell";
  const page = document.createElement("primer-page");
  const concept = document.createElement("primer-concept");

  // Move the authored content into the concept body (it slots into <primer-concept>).
  concept.append(...content);

  // A navigation pathway at the top and bottom of the lesson; both slot into
  // <primer-page>'s single <slot> in order. Each fetches the graph and renders itself.
  const topPathway = document.createElement("primer-pathway");
  const bottomPathway = document.createElement("primer-pathway");
  page.append(topPathway, concept, bottomPathway);
  main.appendChild(page);
  body.appendChild(main);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", render, { once: true });
} else {
  render();
}
