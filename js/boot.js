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
  let theme = "light";
  try {
    let stored = null;
    try {
      stored = localStorage.getItem("primer:theme");
    } catch (e) {
      /* localStorage blocked */
    }
    if (stored === "light" || stored === "dark" || stored === "fun") {
      theme = stored;
    } else {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    /* non-fatal: fall back to the :root (light) default */
    document.documentElement.dataset.theme = theme;
  }

  // Anti-FOUC. This page has no <head>, so the stylesheet is injected by JS below and
  // does NOT block the first paint — the raw cards would otherwise flash unstyled, then
  // the shell builds and restyles. Instead: keep the content hidden until the stylesheet
  // has loaded AND render.js has built the shell (see `reveal`), then fade it in.
  //
  // `color-scheme` makes the browser's DEFAULT page background follow the theme, so the
  // brief hidden phase is dark in dark mode (no white flash) and the scrollbars/form
  // controls match — without hardcoding any colour here. css/primer.css paints the exact
  // --primer-bg once it loads. Only `dark` is a dark theme; this mirrors the per-theme
  // `scheme` in js/theme.js (which applyTheme uses authoritatively, incl. on theme change).
  document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
  const critical = document.createElement("style");
  critical.textContent =
    "body{opacity:0}html.primer-ready body{opacity:1;transition:opacity .18s ease}";
  document.head.appendChild(critical);

  // Reveal once BOTH the stylesheet has loaded and the shell is built — or a fallback
  // timeout, so a CSS/render failure never leaves the page blank.
  let cssReady = false;
  let domReady = false;
  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    document.documentElement.classList.add("primer-ready");
  }
  function maybeReveal() {
    if (cssReady && domReady) reveal();
  }
  document.addEventListener(
    "primer:rendered",
    () => {
      domReady = true;
      maybeReveal();
    },
    { once: true },
  );
  setTimeout(reveal, 2500);

  // Locale, set synchronously BEFORE first paint so chrome renders in the right language
  // with no flash. Mirrors pickInitialLocale() in js/i18n.js (loaded later, which reconciles
  // + persists): a valid stored choice wins, else the first matching browser language, else
  // English. Keep SUPPORTED in step with LOCALES in js/i18n.js.
  try {
    const SUPPORTED = ["en", "es"];
    let locale = "";
    try {
      locale = localStorage.getItem("primer:locale") || "";
    } catch (e) {
      /* localStorage blocked */
    }
    if (SUPPORTED.indexOf(locale) === -1) {
      const langs =
        navigator.languages && navigator.languages.length
          ? navigator.languages
          : [navigator.language || "en"];
      locale = "en";
      for (const tag of langs) {
        const base = String(tag || "").toLowerCase().split("-")[0];
        if (SUPPORTED.indexOf(base) !== -1) {
          locale = base;
          break;
        }
      }
    }
    document.documentElement.lang = locale;
  } catch (e) {
    /* non-fatal: keep the authored lang="en" */
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

  // 1) Stylesheets: the Primer look-and-feel plus KaTeX's font glyph CSS. The local
  //    primer.css gates the anti-FOUC reveal (treat an error as "ready" too, so a
  //    failed stylesheet never leaves the page hidden).
  for (const href of ["/css/primer.css", KATEX_CSS]) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    if (href === "/css/primer.css") {
      const onCss = () => {
        cssReady = true;
        maybeReveal();
      };
      link.addEventListener("load", onCss);
      link.addEventListener("error", onCss);
    }
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
