/**
 * src/prepaint.ts — TEMPLATE for the shared synchronous pre-paint script every STANDALONE app-shell
 * page (index / course / explore / offline / accessibility) includes in its <head>, BEFORE the
 * stylesheet:
 *
 *   <script src="/dist/prepaint.js"></script>
 *
 * It sets the theme (`data-theme` + `theme-color` meta) and the locale (`<html lang>`) from the
 * stored choice / `?lang=` / OS preference synchronously, so there is no flash of the wrong palette
 * or language before the app bundle's async initTheme()/initLocale() reconcile. This is the ONE copy
 * of what used to be duplicated inline in every standalone page. (Concept pages run the equivalent
 * logic inside dist/boot.js, which has no static <head> to work with.)
 *
 * A CLASSIC script (no import/export): scripts/build.mjs transpiles it to dist/prepaint.js and
 * replaces `["__SUPPORTED_LOCALES__"]` with the real locale id list from src/locales.ts.
 */

(function prepaint() {
  const SUPPORTED = ["__SUPPORTED_LOCALES__"];

  // Theme — mirrors pickInitialTheme() in src/theme.ts. Stored choice wins, else the OS preference.
  let theme: string | null = null;
  try {
    theme = localStorage.getItem("primer:theme");
  } catch (e) {
    /* localStorage blocked */
  }
  if (theme !== "light" && theme !== "dark" && theme !== "fun") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute("content", theme === "dark" ? "#14171f" : theme === "fun" ? "#fff7fb" : "#f8f4ec");

  // Locale — mirrors pickInitialLocale() in src/i18n.ts. An explicit ?lang=<locale> wins and is
  // persisted; else the stored choice; else the first matching browser language; else English.
  // initLocale() re-applies + strips ?lang after the app bundle loads.
  let locale = "";
  try {
    const q = (new URLSearchParams(location.search).get("lang") || "").toLowerCase();
    if (SUPPORTED.indexOf(q) !== -1) {
      locale = q;
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
      navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
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
})();
