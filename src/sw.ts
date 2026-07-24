/* src/sw.ts — the Interactive Primer service worker (Phase 2 offline mode). TEMPLATE:
 * scripts/build.mjs transpiles this to the stable root `/sw.js` the pages register. Edit THIS
 * file, never sw.js (generated).
 *
 * Registered by dist/boot.js (concept pages) and the standalone pages. Scope: "/". It gives the site
 * three offline capabilities, layered on the content-hashed build:
 *
 *   1. APP SHELL, precached eagerly on install (dist/precache.json) so any already-visited page — and
 *      the /offline manager — work with no network. The shell is small (boot.js + the hashed core
 *      bundle + reading CSS/fonts); it's what a normal first visit already downloads.
 *   2. OPPORTUNISTIC FRESHNESS while online: the tiny stable entry (boot.js, manifests, css) and the
 *      often-changing dist/graph.json are stale-while-revalidate — served instantly from cache, then
 *      refreshed in the background. Immutable /dist/*-<hash>.* assets are cache-first forever (a new
 *      deploy = new hashes = automatic bust). Downloaded course pages + their images self-heal the same
 *      SWR way as the learner browses.
 *   3. COURSE DOWNLOADS live in their own caches ("primer-course-<id>", written by src/offline.ts). This
 *      SW only READS them on fetch (serve-then-revalidate); the client owns their lifecycle.
 *
 * Typing note: this file compiles in a DOM-lib program, so the ServiceWorker-scope APIs
 * (skipWaiting, clients, respondWith…) are reached through small `as any` casts rather than
 * lib.webworker (which conflicts with lib.dom in one tsconfig).
 */

const SHELL_CACHE = "primer-shell";
const RUNTIME_CACHE = "primer-runtime"; // SWR store for stable-entry + graph.json + visited pages/images
const COURSE_PREFIX = "primer-course-"; // per-course caches owned by src/offline.ts

// Immutable, content-hashed build output → cache forever, never revalidate (the hash busts it).
const isImmutable = (url: URL): boolean =>
  /\/dist\/(bundle|assets)\/.*-[A-Z0-9]{6,}\.[a-z0-9]+$/i.test(url.pathname) ||
  /\/dist\/bundle\/chunks\//.test(url.pathname);

// Tiny stable-named things we want kept FRESH while online (revalidate in the background).
const isStableEntry = (url: URL): boolean =>
  url.pathname === "/dist/boot.js" ||
  url.pathname === "/dist/prepaint.js" ||
  url.pathname === "/dist/analytics.js" ||
  url.pathname === "/dist/asset-manifest.json" ||
  url.pathname === "/dist/precache.json" ||
  url.pathname.startsWith("/css/");

const isGraph = (url: URL): boolean => url.pathname === "/dist/graph.json";

// A concept page or a local image — the things a course download stores, and which we serve
// stale-while-revalidate so a downloaded course silently updates as the learner browses online.
const isCourseContent = (url: URL): boolean =>
  url.pathname.startsWith("/concepts/") ||
  url.pathname.startsWith("/i18n/") ||
  url.pathname.startsWith("/images/");

// ── install: precache the shell (non-blocking; a failed asset doesn't abort the whole install) ──────
self.addEventListener("install", (event: any) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/dist/precache.json", { cache: "no-cache" });
        if (res.ok) {
          const { shell } = await res.json();
          const cache = await caches.open(SHELL_CACHE);
          // addAll is atomic (one 404 rejects all); add individually so a single missing asset is skipped.
          await Promise.all(
            ((shell || []) as string[]).map((u) =>
              cache.add(new Request(u, { cache: "reload" })).catch(() => {}),
            ),
          );
        }
      } catch {
        /* offline on first install — the shell fills in opportunistically as pages are visited */
      }
      await (self as any).skipWaiting();
    })(),
  );
});

// ── activate: take control immediately; drop stale shell/runtime caches (course caches are the client's) ─
self.addEventListener("activate", (event: any) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => !keep.has(n) && !n.startsWith(COURSE_PREFIX))
          .map((n) => caches.delete(n)),
      );
      await (self as any).clients.claim();
    })(),
  );
});

/** Serve from cache, and in the background refetch + update the cache (stale-while-revalidate).
 * The lookup falls back to a global `caches.match` so an entry precached into the SHELL cache
 * (e.g. /dist/boot.js on a first, uncontrolled visit) still serves offline before the runtime
 * cache has ever stored its own copy. */
async function staleWhileRevalidate(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = (await cache.match(request)) || (await caches.match(request));
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok && (res.type === "basic" || res.type === "default")) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || (await network) || (await fallback(request));
}

/** Cache-first for immutable assets: once stored, never hit the network again. */
async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) || (await fallback(request));
  }
}

/** For course content, look across ALL caches (shell, runtime, every course cache) before the network. */
async function courseContent(request: Request): Promise<Response> {
  const hit = await caches.match(request);
  const network = fetch(request)
    .then(async (res) => {
      if (res && res.ok && (res.type === "basic" || res.type === "default")) {
        (await caches.open(RUNTIME_CACHE)).put(request, res.clone());
      }
      return res;
    })
    .catch(() => null);
  return hit || (await network) || (await fallback(request));
}

/** Offline fallback: navigations → the cached /offline manager; other requests → a plain 504. */
async function fallback(request: Request): Promise<Response> {
  if (request.mode === "navigate") {
    const offline = await caches.match("/offline");
    if (offline) return offline;
  }
  return new Response("Offline — this content is not available.", {
    status: 504,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event: any) => {
  const request: Request = event.request;
  if (request.method !== "GET") return; // never intercept POST/etc.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin passes straight through

  if (isImmutable(url)) event.respondWith(cacheFirst(request, SHELL_CACHE));
  else if (isStableEntry(url)) event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  else if (isGraph(url)) event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  else if (isCourseContent(url)) event.respondWith(courseContent(request));
  // Everything else (navigations to app pages, misc): network-first; offline, serve the page's own
  // cached copy if we hold one (shell-precached pages like /course-quiz, or a runtime-cached visit)
  // before falling back to the /offline manager.
  else
    event.respondWith(
      fetch(request)
        .then(async (res) => {
          if (res && res.ok && request.mode === "navigate") {
            (await caches.open(RUNTIME_CACHE)).put(request, res.clone());
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) || fallback(request)),
    );
});
