// @ts-check
/**
 * boot.js — the single tag every concept page includes:
 *
 *   <script src="/js/boot.js"></script>
 *
 * Together with the renderer it loads, it replaces the ENTIRE per-page <head>: the
 * title, the viewport meta, the CSS links, the import map, and the `import "primer"`
 * module script. So a page is just its inline `<script class="concept-meta">` JSON
 * block, the body's <primer-card> content, and this one tag. (The charset comes from
 * the server's `Content-Type: text/html; charset=utf-8` header.)
 *
 * Placement: put it FIRST in <body>, so it is always in the same place. It is a
 * CLASSIC (non-module) script with no defer/async, so the browser runs it where it
 * sits and injects the import map synchronously — before the parser reaches the
 * concept-meta block, the cards, or any inline scene `<script type="module">`. Being
 * first, the import map is always present before any bare-specifier module (e.g. a
 * scene's `import { registerScene } from "primer"`) resolves.
 *
 * The pinned CDN versions live here in ONE place. Self-hosting later is a drop-in:
 * point these URLs at /vendor/ and nothing else changes.
 *
 * Being a classic script, this file uses no top-level import/export (only the
 * dynamic import() at the end), which also keeps `tsc` treating it as a script.
 */

(function boot() {
  // Guard against accidental double-inclusion.
  if (/** @type {any} */ (window).__primerBooted) return;
  /** @type {any} */ (window).__primerBooted = true;

  // Theme, set synchronously BEFORE the stylesheet is injected so there is no flash of
  // the wrong palette. js/theme.js (loaded later) reconciles + persists this. Keep this
  // in step with pickInitialTheme(): stored choice wins, else follow the OS preference.
  try {
    let theme = null;
    try {
      theme = localStorage.getItem("primer:theme");
    } catch (e) {
      /* localStorage blocked */
    }
    if (theme !== "light" && theme !== "dark" && theme !== "fun") {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    /* non-fatal: fall back to the :root (light) default */
  }

  // Pinned dependency URLs — the single source of truth for versions.
  const KATEX_VERSION = "0.16.11";
  const MANIM_VERSION = "0.3.22";
  const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
  const KATEX_MJS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.mjs`;
  const MANIM_JS = `https://cdn.jsdelivr.net/npm/manim-web@${MANIM_VERSION}/dist/manim-web.browser.js`;

  const head = document.head;

  // 0) The viewport meta the page no longer writes. (The document title is set from
  //    the concept-meta block by render.js, which runs after that block is parsed —
  //    boot.js is first in the body, so the block doesn't exist yet here.)
  if (!document.querySelector('meta[name="viewport"]')) {
    const vp = document.createElement("meta");
    vp.name = "viewport";
    vp.content = "width=device-width, initial-scale=1";
    head.appendChild(vp);
  }

  // 1) Stylesheets: the Primer look-and-feel plus KaTeX's font glyph CSS.
  for (const href of ["/css/primer.css", KATEX_CSS]) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    head.appendChild(link);
  }

  // 2) Import map resolving the toolchain's bare specifiers. Inserting this element
  //    registers the map for every module script parsed after it.
  const importMap = document.createElement("script");
  importMap.type = "importmap";
  importMap.textContent = JSON.stringify({
    imports: {
      katex: KATEX_MJS,
      "manim-web": MANIM_JS,
      primer: "/js/primer.js",
    },
  });
  head.appendChild(importMap);

  // 3) Kick off the framework. The renderer is loaded by absolute path (not the
  //    bare "primer" specifier) so this first import doesn't depend on the map
  //    timing; render.js then freely uses bare imports for its own dependencies.
  // Server-absolute path (resolved by the browser, not on disk) — tsc can't follow it.
  // @ts-ignore
  import("/js/render.js").catch((err) => {
    console.error("Primer failed to load:", err);
  });
})();
