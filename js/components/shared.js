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
    padding: 1.25rem 1.5rem;
    box-shadow: var(--primer-shadow-md, 0 6px 18px rgba(0,0,0,0.06));
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

  /* Base button: a quiet surface chip that warms its border on hover and shows a clear
     accent focus ring. Icon/link buttons (stars, play, "needs attention") opt out by
     re-setting border/background themselves; they keep their own focus styles. */
  button {
    font-family: var(--primer-font-ui, sans-serif);
    cursor: pointer;
    border: 1px solid var(--primer-border, #ccc);
    background: var(--primer-surface, #fff);
    color: var(--primer-ink, #111);
    border-radius: 0.5rem;
    padding: 0.4rem 0.8rem;
    transition: background-color 0.13s ease, border-color 0.13s ease, color 0.13s ease,
      box-shadow 0.13s ease, transform 0.06s ease;
  }
  button:hover { border-color: var(--primer-accent, #46e); }
  button:active { transform: translateY(0.5px); }
  button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--primer-ring, rgba(70,90,230,0.4));
    border-color: var(--primer-accent, #46e);
  }
  button[aria-pressed="true"],
  button.is-active {
    background: var(--primer-accent, #46e);
    color: var(--primer-accent-ink, #fff);
    border-color: transparent;
  }

  /* Honour "reduce motion" inside shadow roots — the document-level reset in css/primer.css
     can't cross the shadow boundary, so each component that adopts this sheet gets it here. */
  @media (prefers-reduced-motion: reduce) {
    * {
      transition-duration: 0.001ms !important;
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
    }
    button:active { transform: none; }
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

/**
 * The href of the page's KaTeX stylesheet `<link>`, for cloning into a shadow root so KaTeX markup
 * typesets there (a document-level `<link>` can't cross the shadow boundary; fonts still resolve via
 * the document link). "" if the page has none yet. One canonical selector, replacing the two that had
 * drifted (`href*="katex"` vs `href*="katex.min.css"`).
 * @returns {string}
 */
export function katexHref() {
  return (
    /** @type {HTMLLinkElement | null} */ (document.querySelector('link[rel="stylesheet"][href*="katex"]'))?.href ?? ""
  );
}

/** How long a scene component waits for its deferred `registerX(...)` before giving up. */
export const REGISTRATION_TIMEOUT_MS = 4000;

/**
 * Wait for a `primer:<x>-registered` event whose `detail.name` matches `name`, then call `onReady`;
 * if it hasn't arrived within `timeoutMs`, call `onTimeout` (e.g. show a "no scene" message for a
 * typo'd name). Returns a **cancel** function (removes the listener + clears the timer); calling it —
 * or letting either path fire — is idempotent. Replaces the hand-rolled copy in every scene component.
 * @param {string} eventName  e.g. "primer:chart-registered"
 * @param {string} name  the scene name to match on `detail.name`
 * @param {{ onReady: () => void, onTimeout?: () => void, timeoutMs?: number }} handlers
 * @returns {() => void} cancel
 */
export function awaitRegistration(eventName, name, { onReady, onTimeout, timeoutMs = REGISTRATION_TIMEOUT_MS }) {
  let done = false;
  /** @param {Event} e */
  const onReg = (e) => {
    if (/** @type {CustomEvent} */ (e).detail?.name !== name) return;
    cancel();
    onReady();
  };
  const timer = setTimeout(() => {
    cancel();
    onTimeout?.();
  }, timeoutMs);
  const cancel = () => {
    if (done) return;
    done = true;
    document.removeEventListener(eventName, onReg);
    clearTimeout(timer);
  };
  document.addEventListener(eventName, onReg);
  return cancel;
}

/**
 * The play triangle as inline SVG (24×24, `fill: currentColor`) — it renders identically on every
 * platform and recolours with the theme, unlike the Unicode ▶ glyph which each OS draws with its own
 * font/emoji. Shared by every "big play" facade (`<primer-manim>`, `<primer-geometry>`).
 */
export const PLAY_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

/**
 * Styles for the big centred play button overlaid on an idle stage (an accent disc holding the
 * {@link PLAY_ICON_SVG} triangle, gently pulsing unless the user prefers reduced motion). Interpolate
 * into a component's shadow `<style>` next to a `.stage`-relative `<button class="big-play">`; the
 * host component owns showing/hiding it.
 */
export const BIG_PLAY_CSS = `
  .big-play { position: absolute; inset: 0; display: grid; place-items: center; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .big-play .disc { width: 4.5rem; height: 4.5rem; border-radius: 50%; background: var(--primer-accent, #5b6ee1); display: grid; place-items: center;
    box-shadow: 0 0 0 1px var(--primer-accent, #5b6ee1), 0 0 18px var(--primer-ring, rgba(70,90,230,0.7)), 0 2px 10px rgba(0, 0, 0, 0.25); }
  .big-play svg { width: 2.4rem; height: 2.4rem; fill: var(--primer-accent-ink, #fff); margin-left: 0.25rem; /* optical-centre the triangle */ }
  .big-play:hover .disc, .big-play:focus-visible .disc { filter: brightness(1.1); }
  @keyframes primer-big-play-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
  @media (prefers-reduced-motion: no-preference) { .big-play .disc { animation: primer-big-play-pulse 1.8s ease-in-out infinite; } }
`;
