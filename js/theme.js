// @ts-check
/**
 * Theming: light, dark, and a playful "fun" theme for kids. A theme is just a value
 * of `data-theme` on <html>; the palettes live in css/primer.css as per-theme token
 * blocks, so most of the UI re-themes automatically via `var(--primer-*)`. This module
 * owns selecting/persisting the theme and exposing the active visualisation palette to
 * JS (for the manim animations).
 *
 * No-flash: `data-theme` is set synchronously before first paint by js/boot.js (and the
 * inline script in index.html); `initTheme()` here simply reconciles + persists.
 * @module
 */

/** @typedef {"light" | "dark" | "fun"} ThemeId */

/** Available themes, in display order. @type {ReadonlyArray<{ id: ThemeId, label: string }>} */
export const THEMES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "fun", label: "Fun" },
];

export const STORAGE_KEY = "primer:theme";

/** Google Fonts stylesheet for the fun theme's rounded display font. */
const FUN_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap";
const FUN_FONT_ID = "primer-fun-font";

const VALID = new Set(THEMES.map((t) => t.id));

/**
 * Decide the initial theme: a valid stored choice wins; otherwise follow the OS
 * preference (dark/light). The fun theme is opt-in only, never auto-selected. Pure, so
 * it is unit-tested.
 * @param {string | null | undefined} stored
 * @param {boolean} prefersDark
 * @returns {ThemeId}
 */
export function pickInitialTheme(stored, prefersDark) {
  if (stored && VALID.has(/** @type {ThemeId} */ (stored))) return /** @type {ThemeId} */ (stored);
  return prefersDark ? "dark" : "light";
}

/** The currently applied theme (from <html data-theme>, defaulting to light). @returns {ThemeId} */
export function getTheme() {
  const t = document.documentElement.dataset.theme;
  return t && VALID.has(/** @type {ThemeId} */ (t)) ? /** @type {ThemeId} */ (t) : "light";
}

/**
 * Apply a theme: set `data-theme`, persist it, load/unload the fun font, and announce
 * the change so live components (menu, future widgets) can react.
 * @param {ThemeId} id
 */
export function applyTheme(id) {
  if (!VALID.has(id)) id = "light";
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* persistence is best-effort */
  }
  ensureFunFont(id === "fun");
  document.dispatchEvent(new CustomEvent("theme-change", { detail: { theme: id } }));
}

/** Reconcile the synchronously-set theme with storage on startup (idempotent). */
export function initTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* localStorage unavailable */
  }
  const prefersDark =
    typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(pickInitialTheme(stored, prefersDark));
}

/**
 * The active visualisation palette as hex strings, read from the live CSS tokens — so
 * manim scenes (which draw on a canvas, outside CSS) can colour themselves to match the
 * theme. Call this inside a scene builder; replaying after a theme change picks up the
 * new colours.
 * @returns {{ bg: string, stroke: string, ink: string, a: string, b: string, c: string, accent: string }}
 */
export function vizColors() {
  const s = getComputedStyle(document.documentElement);
  /** @param {string} name @param {string} fallback */
  const get = (name, fallback) => s.getPropertyValue(name).trim() || fallback;
  return {
    bg: get("--primer-viz-bg", "#ffffff"),
    stroke: get("--primer-viz-stroke", "#1f2430"),
    ink: get("--primer-viz-ink", "#1f2430"),
    a: get("--primer-viz-a", "#5b6ee1"),
    b: get("--primer-viz-b", "#2ca58d"),
    c: get("--primer-viz-c", "#e0a100"),
    accent: get("--primer-viz-accent", "#e0a100"),
  };
}

/**
 * Add or remove the fun theme's display-font stylesheet (only loaded while in use).
 * @param {boolean} wanted
 */
function ensureFunFont(wanted) {
  const existing = document.getElementById(FUN_FONT_ID);
  if (wanted && !existing) {
    const link = document.createElement("link");
    link.id = FUN_FONT_ID;
    link.rel = "stylesheet";
    link.href = FUN_FONT_HREF;
    document.head.appendChild(link);
  } else if (!wanted && existing) {
    existing.remove();
  }
}
