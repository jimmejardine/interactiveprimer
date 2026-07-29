/**
 * Wikipedia article summaries for the selection-lookup popup (src/wiki-selection.ts +
 * src/wiki-card.ts). Uses Wikipedia's CORS-enabled REST summary endpoint —
 * `https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}` — which returns a plain-text
 * `extract`, an optional thumbnail, and the article URL (the same data behind Wikipedia's own
 * Page Previews). Results are memoized in-process and persisted to localStorage with a TTL.
 *
 * There is no CSP in this project and the service worker ignores cross-origin requests, so the
 * fetch works online; offline it simply rejects and callers show nothing.
 * @module
 */

import { safeGet, safeSet } from "./storage.ts";

export interface WikiSummary {
  title: string;
  extract: string;
  description?: string;
  thumbnail?: string;
  url: string;
  lang: string;
}

/** Longest selection (words) that triggers a lookup — a whole sentence stays copyable. */
export const WORDS_MAX = 5;

/**
 * Whether a selected string is worth looking up: non-empty, not too long, contains a letter
 * (skip pure numbers/punctuation), and at most {@link WORDS_MAX} words. Pure, so it is unit-tested.
 */
export function shouldLookup(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 60) return false;
  if (!/[a-zA-ZÀ-ɏ]/.test(t)) return false; // needs a (possibly accented) letter
  const words = t.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= WORDS_MAX;
}

const pathTitle = (title: string) => encodeURIComponent(title.trim().replace(/\s+/g, "_"));

/** REST summary endpoint URL for a title on a given language wiki. Pure (unit-tested). */
export function wikiSummaryUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${pathTitle(title)}?redirect=true`;
}

/** Human-facing article URL (fallback when the API doesn't return one). Pure (unit-tested). */
export function wikiArticleUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${pathTitle(title)}`;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // persist summaries (and misses) for a week
const pkey = (lang: string, title: string) => `primer:wiki:${lang}:${title.trim().toLowerCase()}`;

/** Read a persisted summary/miss, or `undefined` when absent or stale. */
function readPersisted(lang: string, title: string): WikiSummary | null | undefined {
  const raw = safeGet(pkey(lang, title));
  if (!raw) return undefined;
  try {
    const { data, ts } = JSON.parse(raw) as { data: WikiSummary | null; ts: number };
    if (typeof ts !== "number" || Date.now() - ts > TTL_MS) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

function writePersisted(lang: string, title: string, data: WikiSummary | null): void {
  safeSet(pkey(lang, title), JSON.stringify({ data, ts: Date.now() }));
}

/** Shape the API JSON into a {@link WikiSummary}, or null when there's no usable summary. */
function toSummary(j: any, lang: string, title: string): WikiSummary | null {
  if (!j || !j.extract || j.type === "disambiguation") return null;
  return {
    title: j.title ?? title,
    extract: j.extract,
    description: j.description,
    thumbnail: j.thumbnail?.source,
    url: j.content_urls?.desktop?.page ?? wikiArticleUrl(lang, j.title ?? title),
    lang,
  };
}

// Per-(lang, title) in-process cache, so concurrent hovers/re-selections share one request.
const memo = new Map<string, Promise<WikiSummary | null>>();

function fetchLang(lang: string, title: string): Promise<WikiSummary | null> {
  const key = `${lang}|${title.trim().toLowerCase()}`;
  const hit = memo.get(key);
  if (hit) return hit;

  const p = (async (): Promise<WikiSummary | null> => {
    const persisted = readPersisted(lang, title);
    if (persisted !== undefined) return persisted;
    try {
      const res = await fetch(wikiSummaryUrl(lang, title));
      if (res.status === 404) {
        writePersisted(lang, title, null); // a genuine "no such article" — cache the miss
        return null;
      }
      if (!res.ok) {
        memo.delete(key); // transient (5xx/rate-limit) — allow a later retry
        return null;
      }
      const result = toSummary(await res.json(), lang, title);
      writePersisted(lang, title, result);
      return result;
    } catch {
      memo.delete(key); // offline / network error — don't cache; retry when back online
      return null;
    }
  })();

  memo.set(key, p);
  return p;
}

/**
 * Fetch a summary for `title`, trying each language in order (e.g. `[locale, "en"]`) and
 * returning the first hit, or `null` if none/offline. Deduped + cached per language.
 */
export async function fetchWikiSummary(
  title: string,
  langs: string[],
): Promise<WikiSummary | null> {
  const clean = title.trim();
  if (!clean) return null;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  for (const lang of [...new Set(langs.filter(Boolean))]) {
    const s = await fetchLang(lang, clean);
    if (s) return s;
  }
  return null;
}
