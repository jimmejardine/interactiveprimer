// @ts-check
/**
 * boot.js — the single tag every concept page includes:
 *
 *   <script src="/js/boot.js"></script>
 *
 * It replaces the per-page boilerplate (two CSS links, the import map, and the
 * `import "primer"` module script) so a page is just this include, its inline
 * `<script class="concept-meta">` JSON block, and the body's <primer-card> content.
 *
 * This is deliberately a CLASSIC (non-module) script with no defer/async: the
 * browser pauses parsing in <head> to fetch and run it, so everything it injects
 * lands in the DOM BEFORE the parser reaches any module script in the body. That
 * ordering is what lets a page's inline `import { ... } from "primer"` resolve the
 * bare specifier against the import map injected here.
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

  // Pinned dependency URLs — the single source of truth for versions.
  const KATEX_VERSION = "0.16.11";
  const MANIM_VERSION = "0.3.18";
  const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
  const KATEX_MJS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.mjs`;
  const MANIM_JS = `https://cdn.jsdelivr.net/npm/manim-web@${MANIM_VERSION}/dist/manim-web.browser.js`;

  const head = document.head;

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
