// @ts-check
/**
 * Shared helpers for the Primer's Web Components: one constructable stylesheet
 * adopted by every component's shadow root, plus small DOM utilities. Keeping the
 * component styling in a single shared sheet is what guarantees a consistent
 * look-and-feel without a build step.
 * @module
 */

/**
 * Component-internal styles. These live INSIDE shadow roots, so selectors here
 * only see component markup. They consume the same --primer-* custom properties
 * defined in css/primer.css (custom properties cross the shadow boundary).
 */
const COMPONENT_CSS = `
  :host { display: block; }

  .card {
    background: var(--primer-surface, #fff);
    border: 1px solid var(--primer-border, #ddd);
    border-radius: var(--primer-radius, 0.5rem);
    padding: 1.25rem 1.4rem;
  }

  .badge {
    display: inline-block;
    font-family: var(--primer-font-ui, sans-serif);
    font-size: 0.72rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--primer-badge-ink, #334);
    background: var(--primer-badge-bg, #eef);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
  }

  .meta { font-family: var(--primer-font-ui, sans-serif); color: var(--primer-ink-soft, #667); }
  .meta a { color: var(--primer-accent, #46e); }

  h1, h2 { line-height: 1.2; font-family: var(--primer-font-display, var(--primer-font-body)); }

  button {
    font-family: var(--primer-font-ui, sans-serif);
    cursor: pointer;
    border: 1px solid var(--primer-border, #ccc);
    background: var(--primer-surface, #fff);
    color: var(--primer-ink, #111);
    border-radius: 0.4rem;
    padding: 0.35rem 0.7rem;
  }
  button[aria-pressed="true"],
  button.is-active {
    background: var(--primer-accent, #46e);
    color: var(--primer-accent-ink, #fff);
    border-color: transparent;
  }
`;

/** @type {CSSStyleSheet} */
export const sharedSheet = new CSSStyleSheet();
sharedSheet.replaceSync(COMPONENT_CSS);

/**
 * Attach an open shadow root that has already adopted the shared stylesheet.
 * @param {HTMLElement} host
 * @returns {ShadowRoot}
 */
export function attachShared(host) {
  const root = host.attachShadow({ mode: "open" });
  root.adoptedStyleSheets = [sharedSheet];
  return root;
}

/**
 * Turn a human title into a URL-safe slug (fallback for a missing concept id).
 * @param {string} text
 * @returns {string}
 */
export function slug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Parse a space/comma-separated attribute into a list of trimmed, non-empty ids.
 * @param {string | null} value
 * @returns {string[]}
 */
export function parseIdList(value) {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
