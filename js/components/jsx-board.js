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
const JSXGRAPH_CSS = "/dist/assets/jsxgraph.css";

/** @type {Promise<CSSStyleSheet | null> | null} Shared across all instances. */
let jsxCssPromise = null;

/**
 * Resolve the JSXGraph namespace from the lazily-imported module, whichever export shape the vendored
 * build ships — `mod.default`, `mod.JXG`, or the module object itself. Centralises the idiom that was
 * copy-pasted across every JSXGraph-backed component.
 * @param {any} mod  the awaited `import("jsxgraph")` module
 * @returns {Record<string, any>}
 */
export function resolveJXG(mod) {
  return mod.default ?? mod.JXG ?? mod;
}

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
 * Free a JSXGraph board safely. JSXGraph re-fits a board when its container (or the window) resizes
 * — `resize.enabled` on our boards. A resize that fires schedules a THROTTLED `setTimeout` (~200ms)
 * that calls `board.updateContainerDims()` → `resizeContainer()` → `renderer.resize()`. When such a
 * resize happens just before the board is torn down — which is routine, because render.js MOVES each
 * authored figure into the lesson shell (a detach/attach that resizes the container) — `freeBoard`
 * removes the resize listeners and deletes `board.renderer`, but it cannot cancel the already-queued
 * `setTimeout`. When that stray timer fires it hits `renderer.resize` on the freed board and throws
 * an async, uncatchable `TypeError: Cannot read properties of undefined (reading 'resize')` into the
 * console. Stubbing `updateContainerDims` to a no-op (and disconnecting the resize observer, if the
 * observer path is in use instead) makes any pending resize inert. Best-effort + null-safe.
 * @param {any} JSXGraph  the `JXG.JSXGraph` namespace (has `freeBoard`)
 * @param {any} board  the board to free (may be null)
 */
export function disposeBoard(JSXGraph, board) {
  if (!board) return;
  try {
    board.updateContainerDims = () => {}; // neutralize any pending throttled resize (see above)
    board.resizeObserver?.disconnect?.();
  } catch {
    /* best-effort: already torn down */
  }
  try {
    JSXGraph?.freeBoard?.(board);
  } catch {
    /* best-effort */
  }
}

/**
 * Return a copy of the JXG namespace whose `JSXGraph.initBoard` injects our teaching-graph defaults
 * (no copyright/nav chrome, no pan/zoom, re-fit on resize, a faint theme-tinted grid) and reports
 * the created board via `onBoard(board, JSXGraph)`. A builder's own initBoard options override the
 * defaults (e.g. `grid: false`, `keepaspectratio: true`). Read `colors` fresh per call (a theme
 * rebuild re-wraps) so the grid re-tints.
 * Pass `opts.interactive: true` for a board the learner manipulates (e.g. `<primer-geometry-problem>`):
 * the pointer/touch handlers are KEPT (so points drag and tools click) — pan/zoom stay disabled — and
 * the board claims the gesture with `touch-action: none`. The default (read-only figures) strips those
 * handlers so the page keeps scrolling on touch.
 * @param {Record<string, any>} JXG
 * @param {ThemeColors} colors
 * @param {(board: any, JSXGraph: any) => void} onBoard
 * @param {{ interactive?: boolean }} [opts]
 * @returns {Record<string, any>}
 */
export function wrapBoard(JXG, colors, onBoard, opts = {}) {
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
    if (opts.interactive) {
      // A manipulable construction surface: KEEP the pointer/touch handlers so points drag and tools
      // click (pan/zoom are still disabled above). The board claims the gesture so a drag isn't read
      // as a page scroll.
      if (board.containerObj) board.containerObj.style.touchAction = "none";
    } else {
      // Read-only teaching figures (no panning/dragging, sliders live in external DOM), but JSXGraph
      // still binds pointer/touch listeners that `preventDefault()` on every touch — swallowing the
      // page's vertical scroll on phones. Drop just those two handler sets (NOT the broad
      // removeEventHandlers(), which would also stop the resize ResizeObserver we rely on to re-fit),
      // and un-claim the gesture for the browser via `touch-action: pan-y`.
      try {
        board.removePointerEventHandlers?.();
        board.removeTouchEventHandlers?.();
      } catch {
        /* best-effort: a board without input handlers is fine, these figures are static */
      }
      if (board.containerObj) board.containerObj.style.touchAction = "pan-y";
    }
    onBoard(board, JSXGraph);
    return board;
  };
  return Object.assign(Object.create(JXG), { JSXGraph: wrappedJSXGraph });
}
