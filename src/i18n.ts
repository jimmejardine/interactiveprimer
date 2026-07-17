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

import en from "./i18n/en.ts";
import es from "./i18n/es.ts";
import { safeGet, safeSet } from "./storage.ts";

export type LocaleId = "en" | "es";

/** Supported locales, in display order. `en` is the default + fallback. Labels are endonyms. */
export const LOCALES: ReadonlyArray<{ id: LocaleId; label: string }> = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];

export const STORAGE_KEY = "primer:locale";

/** The default + fallback locale. */
export const DEFAULT_LOCALE = "en";

/** Chrome-string catalogs by locale (`en` is the source of truth + fallback). */
const CATALOGS: Record<string, Record<string, string>> = { en, es };

/** BCP-47 language tags for speech synthesis, by locale. */
const BCP47: Record<string, string> = { en: "en-US", es: "es-ES" };

const VALID = new Set(LOCALES.map((l) => l.id));

function isLocale(id: string | null | undefined): id is LocaleId {
  return !!id && VALID.has(id as LocaleId);
}

/**
 * The supported locale named by a URL query string's `lang` param (case-insensitive), or
 * null when absent/unsupported/malformed. This is the "open in Spanish" share link —
 * `?lang=es` — that `initLocale()` turns into a persisted choice. Pure (no DOM), so it is
 * unit-tested.
 * @param search  e.g. location.search ("?lang=es")
 */
export function localeFromSearch(search: string): LocaleId | null {
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
 * @param navLangs  e.g. navigator.languages (["es-MX", "en"])
 */
export function pickInitialLocale(
  stored: string | null | undefined,
  navLangs?: readonly string[],
): LocaleId {
  if (isLocale(stored)) return stored;
  for (const tag of navLangs ?? []) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** The active locale, read from <html lang> (defaulting to English). */
export function getLocale(): LocaleId {
  const l = document.documentElement.lang;
  return isLocale(l) ? l : DEFAULT_LOCALE;
}

/**
 * BCP-47 tag for the given (or active) locale — pass to `speak(text, { lang })` so the
 * browser picks the right voice/pronunciation.
 */
export function bcp47(locale?: LocaleId): string {
  return BCP47[locale ?? getLocale()] ?? "en-US";
}

/**
 * Interpolate `{name}` placeholders in a template from `vars`. Pure, exported for tests.
 */
export function fillVars(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * Look up a chrome string for an explicit locale. Falls back to the English catalog, then
 * to the key itself, so a missing/late translation degrades gracefully. Pure (no DOM), so
 * it is unit-tested directly.
 */
export function lookup(
  locale: LocaleId,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const template = CATALOGS[locale]?.[key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key;
  return vars ? fillVars(template, vars) : template;
}

/**
 * Translate a chrome string key for the ACTIVE locale, interpolating `{vars}`.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  return lookup(getLocale(), key, vars);
}

/**
 * Apply a locale: set <html lang>, persist it, announce the change, and reload so the page
 * re-resolves its translation overlay + chrome strings under the new locale. A no-op (no
 * reload) when the locale is unchanged.
 */
export function applyLocale(id: LocaleId): void {
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
export function initLocale(): void {
  const fromParam = localeFromSearch(location.search);
  if (fromParam) {
    document.documentElement.lang = fromParam;
    persist(fromParam);
    stripLangParam();
    return;
  }

  const stored = safeGet(STORAGE_KEY);
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
function stripLangParam(): void {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has("lang")) return;
    url.searchParams.delete("lang");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  } catch {
    /* history/URL unavailable — leaving ?lang in the URL is harmless */
  }
}

function persist(id: LocaleId): void {
  safeSet(STORAGE_KEY, id);
}
