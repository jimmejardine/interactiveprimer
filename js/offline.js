// @ts-check
/**
 * offline.js — client-side course-download manager for offline mode (Phase 2).
 *
 * Pairs with the service worker (`/sw.js`): the SW precaches the app SHELL and serves content, while
 * this module downloads a COURSE into its own cache (`primer-course-<id>`) so the learner can keep
 * going with no network. A download is:
 *   - the course's `courseMembers` PLUS **one level** of each member's direct prerequisites (no
 *     transitive closure — a deliberate scope limit), as `/concepts/<id>.html` pages;
 *   - every local `<img>` those pages reference;
 *   - (non-en locale) the `i18n/<locale>/<id>.html` translation overlays;
 *   - the heavy on-demand `libs` (manim/QuickJS/MathLive chunks + assets) from `dist/precache.json`,
 *     so interactive widgets work offline too. Libs are immutable/hashed → shared `primer-shell` cache.
 *
 * The SW's stale-while-revalidate then keeps a downloaded course fresh as the learner browses online.
 * @module
 */

import { loadGraph } from "./graph-data.js";
import { getLocale } from "./i18n.js";

const COURSE_PREFIX = "primer-course-";
const LIBS_CACHE = "primer-shell"; // immutable, hashed — the SW serves these cache-first
const REC_PREFIX = "primer:offline:"; // localStorage metadata per downloaded course

/** Register the service worker (idempotent, best-effort). Safe to call from any page. */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register("/sw.js").catch(() => null);
}

const pageUrl = (/** @type {string} */ id) => `/concepts/${id}.html`;

/**
 * The concept ids a course download covers: its `courseMembers` + one level of each member's direct
 * prerequisites (de-duplicated, order preserved with members first).
 * @param {string} courseId
 * @returns {Promise<string[]>}
 */
export async function computeCoursePages(courseId) {
  const { byId } = await loadGraph();
  const course = byId.get(courseId);
  if (!course || !Array.isArray(course.courseMembers)) {
    throw new Error(`"${courseId}" is not a course (no courseMembers)`);
  }
  const ids = new Set(course.courseMembers);
  for (const m of course.courseMembers) {
    const entry = byId.get(m);
    for (const pre of entry?.prerequisites || []) ids.add(pre); // one level only
  }
  return [...ids];
}

/** Page + overlay URLs for a course (images are discovered while downloading).
 * @param {string} courseId */
export async function computeCourseAssets(courseId) {
  const ids = await computeCoursePages(courseId);
  const locale = safeLocale();
  const overlayUrls = locale && locale !== "en" ? ids.map((id) => `/i18n/${locale}/${id}.html`) : [];
  return { ids, pageUrls: ids.map(pageUrl), overlayUrls };
}

/**
 * Download a course for offline use, reporting progress. Fetches every page (extracting its images),
 * the translation overlays, and the shared interactive libs; writes a metadata record.
 * @param {string} courseId
 * @param {(done: number, total: number, phase: string) => void} [onProgress]
 * @returns {Promise<{ pageCount: number, imageCount: number, bytes: number }>}
 */
export async function downloadCourse(courseId, onProgress = () => {}) {
  const { ids, pageUrls, overlayUrls } = await computeCourseAssets(courseId);
  const libs = await fetchLibs();
  const cache = await caches.open(COURSE_PREFIX + courseId);
  const libCache = await caches.open(LIBS_CACHE);

  const imageUrls = new Set();
  let done = 0;
  const total = pageUrls.length + overlayUrls.length + libs.length;

  for (const url of pageUrls) {
    try {
      const res = await fetch(url, { cache: "reload" });
      if (res.ok) {
        await cache.put(url, res.clone());
        collectImages(await res.text(), url, imageUrls);
      }
    } catch {
      /* skip a page that fails to fetch — the rest still download */
    }
    onProgress(++done, total, "pages");
  }
  for (const url of overlayUrls) {
    // Many overlays won't exist yet (translations are partial) — a 404 is fine, just skip it.
    try {
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res.clone());
    } catch {
      /* skip */
    }
    onProgress(++done, total, "overlays");
  }
  for (const url of libs) {
    try {
      const res = await fetch(url);
      if (res.ok) await libCache.put(url, res.clone());
    } catch {
      /* skip */
    }
    onProgress(++done, total, "libs");
  }
  // Images last (count unknown until pages are parsed) — best-effort.
  for (const url of imageUrls) {
    try {
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res.clone());
    } catch {
      /* skip */
    }
  }

  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* persistence is best-effort */
  }
  const bytes = await cacheBytes(cache);
  writeRecord(courseId, { downloadedAt: Date.now(), pageCount: ids.length, imageCount: imageUrls.size, bytes });
  return { pageCount: ids.length, imageCount: imageUrls.size, bytes };
}

/** Every downloaded course (id + its metadata record). */
export async function listDownloadedCourses() {
  const names = (await caches.keys()).filter((n) => n.startsWith(COURSE_PREFIX));
  return names.map((n) => ({ id: n.slice(COURSE_PREFIX.length), ...(readRecord(n.slice(COURSE_PREFIX.length)) || {}) }));
}

/** Is this course already downloaded? @param {string} courseId */
export async function isCourseDownloaded(courseId) {
  return (await caches.keys()).includes(COURSE_PREFIX + courseId);
}

/** Delete a downloaded course's cache + metadata (shared libs stay for other courses).
 * @param {string} courseId */
export async function removeCourse(courseId) {
  await caches.delete(COURSE_PREFIX + courseId);
  try {
    localStorage.removeItem(REC_PREFIX + courseId);
  } catch {
    /* localStorage blocked */
  }
}

/** Browser storage usage/quota, or null if unavailable. */
export async function storageEstimate() {
  try {
    return navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  } catch {
    return null;
  }
}

// ── internals ───────────────────────────────────────────────────────────────────────────────────
function safeLocale() {
  try {
    return getLocale();
  } catch {
    return "en";
  }
}

/** @type {Promise<string[]> | null} */
let libsPromise = null;
function fetchLibs() {
  if (!libsPromise) {
    libsPromise = fetch("/dist/precache.json")
      .then((r) => (r.ok ? r.json() : { libs: [] }))
      .then((j) => j.libs || [])
      .catch(() => []);
  }
  return libsPromise;
}

/** Parse a page's HTML for local `<img src>`, resolving page-relative paths; skip data:/external.
 * @param {string} html @param {string} forPageUrl @param {Set<string>} out */
function collectImages(html, forPageUrl, out) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const img of doc.querySelectorAll("img[src]")) {
      const src = img.getAttribute("src") || "";
      if (!src || src.startsWith("data:") || /^https?:/i.test(src)) continue;
      const u = src.startsWith("/") ? src : new URL(src, "http://_" + forPageUrl).pathname;
      out.add(u);
    }
  } catch {
    /* unparseable HTML — no images harvested from this page */
  }
}

/** @param {Cache} cache @returns {Promise<number>} */
async function cacheBytes(cache) {
  let total = 0;
  for (const req of await cache.keys()) {
    try {
      const res = await cache.match(req);
      if (res) total += (await res.blob()).size;
    } catch {
      /* skip an unreadable entry */
    }
  }
  return total;
}

/** @param {string} courseId @param {object} rec */
function writeRecord(courseId, rec) {
  try {
    localStorage.setItem(REC_PREFIX + courseId, JSON.stringify(rec));
  } catch {
    /* localStorage blocked — the cache still works, we just lose the metadata */
  }
}
/** @param {string} courseId */
function readRecord(courseId) {
  try {
    const s = localStorage.getItem(REC_PREFIX + courseId);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
