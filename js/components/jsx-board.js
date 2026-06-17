// @ts-check
/**
 * Shared JSXGraph board plumbing for the SVG components (`<primer-chart>`, `<primer-geometry>`):
 * lazy-loading the JSXGraph stylesheet into a shadow root, and wrapping the JSXGraph namespace so
 * every `initBoard` gets the same teaching-graph chrome defaults and reports its board back for
 * disposal + theme rebuild. Keeping this in one place stops the two components from drifting.
 * @module
 */

/**
 * @typedef {object} ThemeColors
 * @property {string} bg
 * @property {string} ink
 * @property {string} line
 * @property {string[]} cat
 */

/**
 * JSXGraph's stylesheet. Lazy-fetched once into a constructable sheet and adopted into each
 * component's shadow root (a document-level <link> can't cross the shadow boundary). Best-effort:
 * the board still renders if it fails to load. Keep the version in step with js/boot.js.
 */
const JSXGRAPH_CSS = "https://cdn.jsdelivr.net/npm/jsxgraph@1.12.2/distrib/jsxgraph.css";

/** @type {Promise<CSSStyleSheet | null> | null} Shared across all instances. */
let jsxCssPromise = null;

/**
 * Fetch jsxgraph.css once and wrap it in a constructable stylesheet. Resolves null on any failure
 * (CORS, offline) so a board never blocks on its stylesheet.
 * @returns {Promise<CSSStyleSheet | null>}
 */
export function loadJsxCss() {
  if (!jsxCssPromise) {
    jsxCssPromise = fetch(JSXGRAPH_CSS)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((css) => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        return sheet;
      })
      .catch(() => null);
  }
  return jsxCssPromise;
}

/**
 * Adopt the JSXGraph stylesheet into a shadow root once it loads (idempotent, best-effort).
 * @param {ShadowRoot} root
 * @param {() => boolean} stillConnected  Guard so we don't adopt into a disconnected element.
 */
export function adoptJsxCss(root, stillConnected) {
  void loadJsxCss().then((sheet) => {
    if (sheet && stillConnected() && !root.adoptedStyleSheets.includes(sheet)) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    }
  });
}

/**
 * Return a copy of the JXG namespace whose `JSXGraph.initBoard` injects our teaching-graph defaults
 * (no copyright/nav chrome, no pan/zoom, re-fit on resize, a faint theme-tinted grid) and reports
 * the created board via `onBoard(board, JSXGraph)`. A builder's own initBoard options override the
 * defaults (e.g. `grid: false`, `keepaspectratio: true`). Read `colors` fresh per call (a theme
 * rebuild re-wraps) so the grid re-tints.
 * @param {Record<string, any>} JXG
 * @param {ThemeColors} colors
 * @param {(board: any, JSXGraph: any) => void} onBoard
 * @returns {Record<string, any>}
 */
export function wrapBoard(JXG, colors, onBoard) {
  const JSXGraph = JXG.JSXGraph;
  const defaults = {
    showCopyright: false,
    showNavigation: false,
    showInfobox: false,
    pan: { enabled: false },
    zoom: { enabled: false },
    resize: { enabled: true, throttle: 200 },
    grid: {
      major: { strokeColor: colors.line, strokeOpacity: 0.05 },
      minor: { strokeOpacity: 0 },
      minorElements: 0,
    },
  };
  // Inherit every JSXGraph member via the prototype chain; override only initBoard.
  const wrappedJSXGraph = Object.create(JSXGraph);
  /** @param {any} box @param {any} [attributes] */
  wrappedJSXGraph.initBoard = (box, attributes) => {
    const board = JSXGraph.initBoard(box, { ...defaults, ...(attributes || {}) });
    onBoard(board, JSXGraph);
    return board;
  };
  return Object.assign(Object.create(JXG), { JSXGraph: wrappedJSXGraph });
}
