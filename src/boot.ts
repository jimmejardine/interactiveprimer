/**
 * src/boot.ts — TEMPLATE for the single tag every concept page includes:
 *
 *   <script src="/js/boot.js"></script>
 *
 * The build (scripts/build.mjs) transpiles this to js/boot.js, replacing the one
 * `__PRIMER_BUNDLE__` placeholder with the hashed core-bundle URL (e.g.
 * /dist/bundle/primer-EIHECFBJ.js). Edit THIS file, never js/boot.js (generated).
 *
 * Together with the bundle it loads, it replaces the ENTIRE per-page <head>: the
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
 * scene's `import { registerManimScene } from "primer"`) resolves.
 *
 * The whole framework + its deps live in ONE content-hashed bundle under
 * /dist/bundle/ (built from src/ + node_modules by scripts/build.mjs); the static CSS
 * and fonts it needs are emitted to /dist/assets/.
 *
 * Being a classic script, this file uses no top-level import/export (only the
 * dynamic import() at the end), which also keeps `tsc` treating it as a script.
 */

(function boot() {
  // Supported locales — the single list this script keys off (kept in step with LOCALES in
  // src/i18n.ts). Declared first because the overlay-redirect below already needs it.
  const SUPPORTED = ["en", "es"];

  // Translation overlays (i18n/<locale>/<id>.html) are normally FETCHED as data by render.ts,
  // never served as a page — but they now carry this same boot.js so a DIRECT visit isn't a
  // bare, shell-less fragment. Detect that case and redirect to the canonical lesson with
  // ?lang=<locale>, which sets the locale (see initLocale in src/i18n.ts). location.replace
  // leaves no back-button bounce. This runs FIRST, before the double-include guard.
  try {
    const m = location.pathname.match(/^\/i18n\/([^/]+)\/(.+)$/);
    if (m && SUPPORTED.indexOf(m[1]) !== -1) {
      location.replace(`/concepts/${m[2]}?lang=${m[1]}`);
      return;
    }
  } catch (e) {
    /* non-fatal: fall through and boot normally */
  }

  // Guard against accidental double-inclusion.
  if ((window as any).__primerBooted) return;
  (window as any).__primerBooted = true;

  // Record uncaught errors + unhandled promise rejections on window.__primerErrors so an out-of-page
  // test harness (scripts/smoke-pages.mjs) can detect a broken page. This inline recorder IS the single
  // implementation of the global handlers: boot is a classic pre-module script, so it must capture the
  // earliest errors itself. (Components report their caught errors via reportError from
  // src/report-error.ts, which pushes onto the same bucket.)
  const errHost = window as any;
  errHost.__primerErrors = errHost.__primerErrors || [];
  window.addEventListener("error", (e) => {
    errHost.__primerErrors.push({
      source: "window.error",
      message: (e.error && e.error.message) || e.message || "uncaught error",
      stack: e.error && e.error.stack,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = (e as any).reason;
    errHost.__primerErrors.push({
      source: "unhandledrejection",
      message: (r && r.message) || (typeof r === "string" ? r : "unhandled rejection"),
      stack: r && r.stack,
    });
  });

  // Theme, set synchronously BEFORE the stylesheet is injected so there is no flash of
  // the wrong palette. src/theme.ts (loaded later) reconciles + persists this. Keep this
  // in step with pickInitialTheme(): stored choice wins, else follow the OS preference.
  let theme = "light";
  try {
    let stored: string | null = null;
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
  // has loaded AND render.ts has built the shell (see `reveal`), then fade it in.
  //
  // `color-scheme` makes the browser's DEFAULT page background follow the theme, so the
  // brief hidden phase is dark in dark mode (no white flash) and the scrollbars/form
  // controls match — without hardcoding any colour here. css/primer.css paints the exact
  // --primer-bg once it loads. Only `dark` is a dark theme; this mirrors the per-theme
  // `scheme` in src/theme.ts (which applyTheme uses authoritatively, incl. on theme change).
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
  function reveal(): void {
    if (revealed) return;
    revealed = true;
    document.documentElement.classList.add("primer-ready");
  }
  function maybeReveal(): void {
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
  // Fallback so a CSS/render failure never leaves the page blank-and-invisible forever.
  const REVEAL_FALLBACK_MS = 2500;
  setTimeout(reveal, REVEAL_FALLBACK_MS);

  // Locale, set synchronously BEFORE first paint so chrome renders in the right language
  // with no flash. Mirrors pickInitialLocale() in src/i18n.ts (loaded later, which reconciles
  // + persists): a valid stored choice wins, else the first matching browser language, else
  // English. Keep SUPPORTED in step with LOCALES in src/i18n.ts.
  try {
    let locale = "";
    // An explicit ?lang=<locale> wins and is persisted (the "open in Spanish" share link).
    // src/i18n.ts initLocale() re-applies + strips it authoritatively after paint; setting it
    // here keeps <html lang> correct from the first synchronous tick.
    try {
      const fromParam = (new URLSearchParams(location.search).get("lang") || "").toLowerCase();
      if (SUPPORTED.indexOf(fromParam) !== -1) {
        locale = fromParam;
        try {
          localStorage.setItem("primer:locale", locale);
        } catch (e) {
          /* localStorage blocked */
        }
      }
    } catch (e) {
      /* URLSearchParams/location unavailable */
    }
    if (!locale) {
      try {
        locale = localStorage.getItem("primer:locale") || "";
      } catch (e) {
        /* localStorage blocked */
      }
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

  // The framework bundle + the static CSS/fonts it needs are build outputs under /dist/
  // (see scripts/build.mjs). __PRIMER_BUNDLE__ is stamped with the hashed core-bundle URL at
  // build time; the lazy library chunks are reached from inside that bundle (esbuild rewrites
  // the import()s), so this loader needs only the ONE URL.
  const PRIMER_BUNDLE = "__PRIMER_BUNDLE__";
  const KATEX_CSS = "/dist/assets/katex.min.css";
  // The reading typeface: STIX Two Text (harmonises with KaTeX's Computer-Modern math).
  const FONT_CSS = "/dist/assets/stix.css";

  const head = document.head;

  // 0) The viewport meta the page no longer writes. (The document title is set from
  //    the concept-meta block by render.ts, which runs after that block is parsed —
  //    boot.js is first in the body, so the block doesn't exist yet here.)
  if (!document.querySelector('meta[name="viewport"]')) {
    const vp = document.createElement("meta");
    vp.name = "viewport";
    vp.content = "width=device-width, initial-scale=1";
    head.appendChild(vp);
  }

  // Icons + PWA / mobile meta. Concept pages write no <head>, so inject the full set here (guarded so
  // a page that already declares them wins). The favicon/app icons live under /images/icons/; the
  // manifest + apple/android tags make the site installable, and theme-color tints the mobile browser
  // chrome to the current theme's --primer-bg (kept in sync on theme change by src/theme.ts).
  /** Append static <head> tags parsed from an HTML string. */
  const injectHead = (html: string): void => {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    head.appendChild(tpl.content);
  };
  if (!document.querySelector('link[rel~="icon"]')) {
    injectHead(
      '<link rel="icon" href="/images/icons/favicon.ico" sizes="any">' +
        '<link rel="icon" type="image/png" sizes="32x32" href="/images/icons/favicon-32x32.png">' +
        '<link rel="icon" type="image/png" sizes="16x16" href="/images/icons/favicon-16x16.png">' +
        '<link rel="apple-touch-icon" href="/images/icons/apple-touch-icon.png">' +
        '<link rel="apple-touch-startup-image" href="/images/banner-portrait.jpg">' +
        '<link rel="manifest" href="/site.webmanifest">' +
        '<meta name="apple-mobile-web-app-capable" content="yes">' +
        '<meta name="mobile-web-app-capable" content="yes">' +
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">' +
        '<meta name="apple-mobile-web-app-title" content="InteractivePrimer.com">',
    );
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    const tc = document.createElement("meta");
    tc.name = "theme-color";
    tc.content = theme === "dark" ? "#14171f" : theme === "fun" ? "#fff7fb" : "#f8f4ec";
    head.appendChild(tc);
  }

  // The reading typeface: loaded eagerly (light + dark both use it); `display=swap` shows the
  // Georgia fallback first, then swaps in with no blocking. The fun theme's rounded display font
  // is still loaded on demand by src/theme.ts.
  const fontLink = document.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = FONT_CSS;
  head.appendChild(fontLink);

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

  // 1b) Cookieless visitor analytics (Cloudflare Web Analytics). Concept pages have no static
  //     <head>, so load the shared injector here; it's a no-op until a token is configured.
  const analytics = document.createElement("script");
  analytics.src = "/js/analytics.js";
  analytics.defer = true;
  head.appendChild(analytics);

  // 2) Import map resolving the "primer" bare specifier used by inline scene scripts
  //    (e.g. `import { registerManimScene } from "primer"`) to the hashed core bundle.
  //    Inserting this element registers the map for every module script parsed after it.
  const importMap = document.createElement("script");
  importMap.type = "importmap";
  importMap.textContent = JSON.stringify({ imports: { primer: PRIMER_BUNDLE } });
  head.appendChild(importMap);

  // 3) Kick off the framework by importing the hashed core bundle directly (not the bare
  //    "primer" specifier) so this first import doesn't depend on the import-map timing; the
  //    bundle self-boots (entry.ts imports render.ts) and inline scenes then resolve "primer"
  //    through the map above.
  // @ts-ignore — a build-stamped absolute URL; tsc can't follow it.
  import(PRIMER_BUNDLE).catch((err) => {
    console.error("Primer failed to load:", err);
  });

  // 4) Register the service worker (offline mode). Guarded + best-effort: unsupported or a failed
  //    registration is a silent no-op, so it never blocks the page. It precaches the app shell on
  //    install (dist/precache.json) and keeps content fresh online (see src/sw.ts → /sw.js).
  //    Deferred to `load` so it never competes with the first paint / the framework import above.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline features unavailable — the site still works online */
      });
    });
  }
})();
