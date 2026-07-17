/**
 * <primer-title> — carries the concept's title, e.g.
 *
 *   <primer-title>Addition</primer-title>
 *
 * It renders nothing itself (hidden via css/primer.css): render.js reads its text content to
 * build the page's <h1> and document.title, and a translation overlay supplies the translated
 * title via its own <primer-title>. Keeping the title in a body element (rather than the
 * concept-meta JSON) makes it part of the translatable surface, so it lives with the prose a
 * translator edits — while the concept-meta block (prerequisites/level) stays language-neutral.
 * @module
 */

export class PrimerTitle extends HTMLElement {}

if (!customElements.get("primer-title")) {
  customElements.define("primer-title", PrimerTitle);
}
