// @ts-check
/**
 * <primer-table> — wrap a plain <table> for consistent, themed presentation: centered
 * cells, hairline borders, a shaded header row, and horizontal scroll on overflow.
 * Light DOM; styling lives in css/primer.css (selector `primer-table > table`).
 */
export class PrimerTable extends HTMLElement {}

if (!customElements.get("primer-table")) {
  customElements.define("primer-table", PrimerTable);
}
