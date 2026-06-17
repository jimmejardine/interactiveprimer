// @ts-check
/**
 * Internationalization: the active locale (a user setting, like the theme in js/theme.js),
 * the chrome-string catalogs, and the helpers pages/components use to localize.
 *
 * The locale is simply `lang` on <html>. js/boot.js (and the inline script in index.html)
 * set it synchronously before first paint from the persisted `primer:locale`, mirroring how
 * the theme is set; `initLocale()` reconciles + persists. English is the default and the
 * fallback for any missing translation — a lesson with no overlay, or a string with no
 * translation, simply shows English.
 *
 * Lesson CONTENT is not translated here — only the framework's own chrome. Lesson prose and
 * scene narration live in per-locale overlays under /i18n/<locale>/ (see js/render.js).
 * @module
 */

import en from "./i18n/en.js";
import es from "./i18n/es.js";

/** @typedef {"en" | "es"} LocaleId */

/** Supported locales, in display order. `en` is the default + fallback. Labels are endonyms. */
export const LOCALES = /** @type {ReadonlyArray<{ id: LocaleId, label: string }>} */ ([
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
]);

export const STORAGE_KEY = "primer:locale";

/** The default + fallback locale. */
export const DEFAULT_LOCALE = "en";

/** Chrome-string catalogs by locale (`en` is the source of truth + fallback). */
const CATALOGS = /** @type {Record<string, Record<string, string>>} */ ({ en, es });

/** BCP-47 language tags for speech synthesis, by locale. */
const BCP47 = /** @type {Record<string, string>} */ ({ en: "en-US", es: "es-ES" });

const VALID = new Set(LOCALES.map((l) => l.id));

/** @param {string | null | undefined} id @returns {id is LocaleId} */
function isLocale(id) {
  return !!id && VALID.has(/** @type {LocaleId} */ (id));
}

/**
 * The supported locale named by a URL query string's `lang` param (case-insensitive), or
 * null when absent/unsupported/malformed. This is the "open in Spanish" share link —
 * `?lang=es` — that `initLocale()` turns into a persisted choice. Pure (no DOM), so it is
 * unit-tested.
 * @param {string} search  e.g. location.search ("?lang=es")
 * @returns {LocaleId | null}
 */
export function localeFromSearch(search) {
  try {
    const v = new URLSearchParams(search).get("lang");
    const base = v ? v.toLowerCase() : "";
    return isLocale(base) ? base : null;
  } catch {
    return null;
  }
}

/**
 * Decide the initial locale: a valid stored choice wins; otherwise the first browser
 * language whose base subtag matches a supported locale; otherwise the default. Pure, so
 * it is unit-tested.
 * @param {string | null | undefined} stored
 * @param {readonly string[]} [navLangs]  e.g. navigator.languages (["es-MX", "en"])
 * @returns {LocaleId}
 */
export function pickInitialLocale(stored, navLangs) {
  if (isLocale(stored)) return stored;
  for (const tag of navLangs ?? []) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** The active locale, read from <html lang> (defaulting to English). @returns {LocaleId} */
export function getLocale() {
  const l = document.documentElement.lang;
  return isLocale(l) ? l : DEFAULT_LOCALE;
}

/**
 * BCP-47 tag for the given (or active) locale — pass to `speak(text, { lang })` so the
 * browser picks the right voice/pronunciation.
 * @param {LocaleId} [locale]
 * @returns {string}
 */
export function bcp47(locale) {
  return BCP47[locale ?? getLocale()] ?? "en-US";
}

/**
 * Interpolate `{name}` placeholders in a template from `vars`. Pure, exported for tests.
 * @param {string} template
 * @param {Record<string, string | number>} vars
 * @returns {string}
 */
export function fillVars(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * Look up a chrome string for an explicit locale. Falls back to the English catalog, then
 * to the key itself, so a missing/late translation degrades gracefully. Pure (no DOM), so
 * it is unit-tested directly.
 * @param {LocaleId} locale
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function lookup(locale, key, vars) {
  const template = CATALOGS[locale]?.[key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key;
  return vars ? fillVars(template, vars) : template;
}

/**
 * Translate a chrome string key for the ACTIVE locale, interpolating `{vars}`.
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function t(key, vars) {
  return lookup(getLocale(), key, vars);
}

/**
 * Apply a locale: set <html lang>, persist it, announce the change, and reload so the page
 * re-resolves its translation overlay + chrome strings under the new locale. A no-op (no
 * reload) when the locale is unchanged.
 * @param {LocaleId} id
 */
export function applyLocale(id) {
  if (!isLocale(id)) id = DEFAULT_LOCALE;
  const changed = getLocale() !== id;
  document.documentElement.lang = id;
  persist(id);
  document.dispatchEvent(new CustomEvent("locale-change", { detail: { locale: id } }));
  if (changed) location.reload();
}

/**
 * Reconcile the synchronously-set locale with storage + the browser's languages on startup
 * (idempotent; does NOT reload). boot.js already set <html lang>; this persists the resolved
 * choice so it sticks.
 *
 * An explicit `?lang=<locale>` in the URL is the one authority: it WINS over storage/browser,
 * is persisted (so the whole site stays in that language — a shareable "open in Spanish"
 * link), and is then stripped from the URL so a later menu switch / reload can't snap back to
 * the language the link named. Because the concept-page body stays hidden behind boot.js's
 * anti-FOUC veil until `primer:rendered`, resolving the locale here is flash-free.
 */
export function initLocale() {
  const fromParam = localeFromSearch(location.search);
  if (fromParam) {
    document.documentElement.lang = fromParam;
    persist(fromParam);
    stripLangParam();
    return;
  }

  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* localStorage unavailable */
  }
  const navLangs =
    typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  const id = pickInitialLocale(stored, navLangs);
  document.documentElement.lang = id;
  persist(id);
}

/**
 * Remove the `lang` query param from the address bar (keeping any other params + the hash),
 * without a navigation, after it has been applied + persisted. Best-effort.
 */
function stripLangParam() {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has("lang")) return;
    url.searchParams.delete("lang");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  } catch {
    /* history/URL unavailable — leaving ?lang in the URL is harmless */
  }
}

/** @param {LocaleId} id */
function persist(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* best-effort persistence */
  }
}
