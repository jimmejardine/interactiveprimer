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
 *       <primer-concept>     <h1> title + slotted body + confidence control
 *         ...the cards...
 *       </primer-concept>
 *     </primer-page>
 *   </main>
 *
 * <primer-page> and <primer-concept> read everything they need from the page's
 * `concept-meta` block (see js/concept-meta.js), so no attributes are required here.
 * @module
 */

import "primer";

/** Build the page shell once the DOM is ready. */
function render() {
  const body = document.body;

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
  page.appendChild(concept);
  main.appendChild(page);
  body.appendChild(main);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", render, { once: true });
} else {
  render();
}
