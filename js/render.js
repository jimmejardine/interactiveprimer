// @ts-check
/**
 * render.js — builds a concept page's shell at runtime so authors don't write it.
 *
 * A slim page's <body> contains only the content (one or more <primer-card>s) plus the
 * inline `concept-meta` JSON block, an optional `scene-strings` JSON block, and an optional
 * inline scene <script>. This module imports the Primer custom elements, then wraps that
 * content in the shell the pages used to spell out by hand:
 *
 *   <main class="primer-shell">
 *     <primer-page>          footer back to the tree
 *       <primer-pathway>     navigation map (top)
 *       <primer-concept>     <h1> title (+ level badge) + slotted body + confidence control
 *         ...the cards...
 *       </primer-concept>
 *       <primer-pathway>     navigation map (bottom)
 *     </primer-page>
 *   </main>
 *
 * Internationalization: every lesson lives at ONE canonical URL (the English page). When the
 * active locale (a user setting; see js/i18n.js) is not English, this module fetches a
 * translation overlay at `/i18n/<locale>/<id>.html` and swaps in its translated content +
 * `scene-strings`, reusing the canonical page's (language-independent) inline scene JS. If no
 * overlay exists, it falls back to English so the lesson is never blocked.
 * @module
 */

import "primer";
import { getConceptMeta, conceptIdFromPath } from "./concept-meta.js";
import { initTheme } from "./theme.js";
import { initLocale, getLocale, DEFAULT_LOCALE, t } from "./i18n.js";
import { loadGraph } from "./graph-data.js";
import { mountSearchBox, SEARCH_BOX_CSS } from "./concept-search-box.js";
import { runProgressMigration } from "./progress-migration.js";

/** Build the page shell once the DOM is ready. */
async function render() {
  const body = document.body;

  // Reconcile the synchronously-set theme (boot.js) with storage — this also loads the
  // fun display font when that theme is the saved choice.
  initTheme();
  // Reconcile the synchronously-set locale (boot.js) with storage + browser languages.
  initLocale();

  // Recover confidence scores stranded by a moved concept BEFORE the shell (and its star control +
  // pathways) reads them, so a relocated lesson shows its stars on this very load. Uses the same
  // memoized graph the render below awaits, so it adds no extra fetch; never throws.
  await runProgressMigration();

  // Global page chrome: the top-right hamburger menu (theme + language), mounted once.
  if (!body.querySelector("primer-menu")) {
    body.appendChild(document.createElement("primer-menu"));
  }

  const meta = safeMeta();
  const id = conceptIdFromPath();

  // The content is every direct element child of <body> that is authored lesson content —
  // i.e. NOT a <script> (leaving the concept-meta/scene-strings JSON blocks and any inline
  // scene script in place), NOT the <primer-title> (its text is the page title, read below),
  // and NOT the chrome we just mounted (the fixed <primer-menu>) or a previously-built shell
  // <main>. Excluding the menu matters: otherwise the overlay swap would move or even remove
  // it along with the canonical content.
  const SKIP = new Set(["SCRIPT", "PRIMER-TITLE", "PRIMER-MENU", "MAIN"]);
  let content = /** @type {Element[]} */ ([...body.children].filter((el) => !SKIP.has(el.tagName)));
  // The title lives in the <primer-title> element (translatable, part of the body). We keep its
  // plain text (for <title>/SEO) AND the element itself: its child nodes — which may include a
  // <primer-math> for a math title — are slotted into the header below so the math typesets.
  const canonicalTitleEl = body.querySelector("primer-title");
  let pageTitle = canonicalTitleEl?.textContent?.trim() || null;
  /** @type {Element | null} */
  let titleEl = canonicalTitleEl;

  // Non-English: apply the translation overlay IF one exists, else fall back to English.
  // We consult the emitted graph (which records a translated `titles[locale]` for every
  // concept that has an overlay) so we only fetch when a translation is actually there —
  // avoiding a noisy 404 in the console for the (common) untranslated case.
  const locale = getLocale();
  if (id && locale !== DEFAULT_LOCALE) {
    const applied = (await hasOverlay(id, locale))
      ? await applyOverlay(id, locale, content)
      : null;
    if (applied) {
      content = applied.content;
      pageTitle = applied.title ?? pageTitle;
      if (applied.titleEl) titleEl = applied.titleEl; // slot the translated title (may carry math)
    } else {
      // No translation for this concept → render the whole page in English.
      document.documentElement.lang = DEFAULT_LOCALE;
    }
  }

  // Title from the (possibly translated) concept title (the page writes no <head>/<title>).
  if (pageTitle) document.title = `${pageTitle} — ${t("app.name")}`;

  // Which locales this concept is translated into (per the emitted graph) — the hreflang set.
  /** @type {string[]} */
  let altLocales = [];
  try {
    const { byId } = await loadGraph();
    altLocales = Object.keys(byId.get(id)?.titles ?? {});
  } catch {
    /* graph unavailable → no hreflang alternates (English-only indexing) */
  }

  // SEO metadata. Concept pages carry no static <head>, so inject it here; crawlers that
  // render JS (e.g. Googlebot) index the result. See README → SEO.
  injectSeo(pageTitle ?? "", firstText(content), getLocale(), meta?.declaredLevel, altLocales);

  if (content.length === 0) return;

  const main = document.createElement("main");
  main.className = "primer-shell";
  const page = document.createElement("primer-page");
  const concept = document.createElement("primer-concept");

  // Feed <primer-concept> the resolved title + id (it no longer reads them from concept-meta).
  if (pageTitle) concept.setAttribute("title", pageTitle);
  if (id) concept.setAttribute("concept-id", id);

  // Move the (authored or translated) content into the concept body.
  concept.append(...content);

  // Slot the title element's child nodes (which may include a <primer-math>) into the header's
  // named slot. They remain in the LIGHT DOM — so the document-level KaTeX CSS styles any math —
  // while being projected into the shadow <h1>. The plain `title` attribute set above is the
  // fallback shown when there is no slotted title (e.g. direct use without render.js).
  if (titleEl && titleEl.childNodes.length) {
    const titleSlot = document.createElement("span");
    titleSlot.setAttribute("slot", "title");
    titleSlot.append(...titleEl.childNodes);
    concept.appendChild(titleSlot);
  }

  // A navigation pathway at the top and bottom of the lesson; both slot into
  // <primer-page>'s single <slot> in order. Each fetches the graph and renders itself.
  const topPathway = document.createElement("primer-pathway");
  const bottomPathway = document.createElement("primer-pathway");
  page.append(topPathway, concept, bottomPathway);
  main.appendChild(page);
  body.appendChild(main);

  // A fixed top-left concept search, mirroring the top-right hamburger — jump to any concept by
  // name from any lesson. Mounted after the content scan above so it isn't treated as lesson body.
  void mountConceptSearch(body, locale);
}

/**
 * Mount the fixed top-left search box once on a lesson page. Loads the graph for the concept-name
 * list; selecting a result navigates to that concept.
 * @param {HTMLElement} body
 * @param {string} locale
 */
async function mountConceptSearch(body, locale) {
  if (body.querySelector(".cg-search")) return; // already mounted
  if (!document.getElementById("concept-search-style")) {
    const s = document.createElement("style");
    s.id = "concept-search-style";
    s.textContent = SEARCH_BOX_CSS;
    document.head.appendChild(s);
  }
  const graph = await loadGraph().catch(() => null);
  if (!graph) return; // no graph → no search (the page is otherwise fine)
  const items = [...graph.byId.values()].map((c) => ({ id: c.id, title: c.titles?.[locale] ?? c.title ?? c.id }));
  mountSearchBox(body, {
    items,
    placement: "fixed",
    onSelect: (id) => {
      window.location.href = `/concepts/${id}.html`;
    },
  });
}

/**
 * Whether a translation overlay exists for `id` in `locale`, per the emitted graph
 * (build-graph records a `titles[locale]` for every concept that has an overlay). Used to
 * skip the overlay fetch — and its console 404 — when nothing is translated. Returns false
 * if the graph can't be loaded (so we simply render English).
 * @param {string} id
 * @param {string} locale
 * @returns {Promise<boolean>}
 */
async function hasOverlay(id, locale) {
  try {
    const { byId } = await loadGraph();
    return Boolean(byId.get(id)?.titles?.[locale]);
  } catch {
    return false;
  }
}

/**
 * Fetch and apply the translation overlay for `id` in `locale`. Returns the translated
 * content elements (and title) to render, or null when there is no usable overlay (so the
 * caller falls back to English). Swaps the canonical content out of the DOM and appends the
 * overlay's `scene-strings` block tagged `data-locale`, KEEPING the English block as the
 * fallback source so the reused scene JS narrates in the target language and falls back to
 * English per-key (see js/scene-strings.js `makeStrings`).
 * @param {string} id
 * @param {string} locale
 * @param {Element[]} canonicalContent
 * @returns {Promise<{ content: Element[], title: string | null, titleEl: Element | null } | null>}
 */
async function applyOverlay(id, locale, canonicalContent) {
  let html;
  try {
    const res = await fetch(`/i18n/${locale}/${id}.html`);
    if (!res.ok) return null; // 404 etc. → no translation
    html = await res.text();
  } catch {
    return null; // network/parse failure → fall back to English
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const translated = [...doc.body.children].filter(
    (el) => el.tagName !== "SCRIPT" && el.tagName !== "PRIMER-TITLE",
  );
  if (translated.length === 0) return null;

  // Translated title from the overlay's <primer-title>. The caller sets the plain text on
  // <primer-concept> and slots the (imported) element so a translated math title typesets; the
  // canonical concept-meta block (prerequisites/level) is untouched.
  const titleSrc = doc.querySelector("primer-title");
  const title = titleSrc?.textContent?.trim() || null;
  const titleEl = titleSrc ? /** @type {Element} */ (document.importNode(titleSrc, true)) : null;

  // Remove the canonical (English) content from the DOM…
  for (const el of canonicalContent) el.remove();
  // …but KEEP the canonical (English) scene-strings block(s) in place and append EACH of the
  // overlay's blocks tagged with the active locale. A page may carry several blocks (e.g. quiz
  // strings kept separate from scene/chart strings); makeStrings merges them all by namespace and
  // resolves each key from the locale blocks, falling back to the retained English blocks per-key.
  for (const overlayStrings of doc.querySelectorAll("script.scene-strings")) {
    const node = /** @type {HTMLElement} */ (document.importNode(overlayStrings, true));
    node.setAttribute("data-locale", locale);
    document.body.appendChild(node);
  }

  const content = translated.map((el) => /** @type {Element} */ (document.importNode(el, true)));
  return { content, title, titleEl };
}

/** @returns {import("./types/domain.js").ConceptMeta | null} */
function safeMeta() {
  try {
    return getConceptMeta();
  } catch {
    return null;
  }
}

/**
 * A meta-description from the first non-empty card's text (collapsed, ~155 chars at a
 * word boundary).
 * @param {Element[]} content
 * @returns {string}
 */
function firstText(content) {
  for (const el of content) {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (text.length <= 155) return text;
    const cut = text.slice(0, 155);
    const sp = cut.lastIndexOf(" ");
    return `${(sp > 60 ? cut.slice(0, sp) : cut).replace(/[\s,.;:]+$/, "")}…`;
  }
  return "";
}

/** Set (or replace) a single `<head>` element matched by `selector`, creating it with `make`.
 * @param {string} selector @param {() => Element} make @returns {Element} */
function headTag(selector, make) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = make();
    document.head.appendChild(el);
  }
  return el;
}

/**
 * Inject SEO tags into `<head>`: a description, a per-language self-referential canonical, the
 * `hreflang` alternates linking every language version, and a LearningResource JSON-LD. Idempotent
 * (re-running updates the same elements).
 *
 * A translation is the same path with `?lang=<locale>`, so the canonical for a non-default locale is
 * the `?lang=` URL (self-referential) — without this Google would fold every language into the bare
 * English URL and never index the translations. `altLocales` (from the graph) are the locales this
 * concept is translated into; we emit `en` + each of them + `x-default` so the set cross-links.
 * @param {string} title
 * @param {string} description
 * @param {string} locale
 * @param {number} [level]
 * @param {string[]} [altLocales]
 */
function injectSeo(title, description, locale, level, altLocales = []) {
  const cleanUrl = location.origin + location.pathname; // ?lang has been stripped by initLocale
  const langUrl = (/** @type {string} */ loc) => (loc === DEFAULT_LOCALE ? cleanUrl : `${cleanUrl}?lang=${loc}`);
  const canonical = langUrl(locale); // self-referential: this rendering's own language URL

  if (description) {
    headTag('meta[name="description"]', () => {
      const m = document.createElement("meta");
      m.setAttribute("name", "description");
      return m;
    }).setAttribute("content", description);
  }

  headTag('link[rel="canonical"]', () => {
    const l = document.createElement("link");
    l.setAttribute("rel", "canonical");
    return l;
  }).setAttribute("href", canonical);

  // hreflang alternates — only meaningful when the concept actually has translations.
  const translated = altLocales.filter((l) => l !== DEFAULT_LOCALE);
  if (translated.length > 0) {
    for (const [hreflang, href] of [
      ["en", cleanUrl],
      ...translated.map((l) => [l, langUrl(l)]),
      ["x-default", cleanUrl],
    ]) {
      headTag(`link[rel="alternate"][hreflang="${hreflang}"]`, () => {
        const l = document.createElement("link");
        l.setAttribute("rel", "alternate");
        l.setAttribute("hreflang", hreflang);
        return l;
      }).setAttribute("href", href);
    }
  }

  /** @type {Record<string, any>} */
  const ld = {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: title,
    url: canonical,
    inLanguage: locale,
    isPartOf: { "@type": "WebSite", name: t("app.name"), url: `${location.origin}/` },
  };
  if (description) ld.description = description;
  if (typeof level === "number") ld.educationalLevel = `Level ${level}`;

  headTag('script.primer-seo[type="application/ld+json"]', () => {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.className = "primer-seo";
    return s;
  }).textContent = JSON.stringify(ld);
}

/**
 * Run render and, however it settles (success, empty-content early return, or error),
 * announce it so boot.js can lift the anti-FOUC veil and fade the page in.
 */
function start() {
  render().finally(() => document.dispatchEvent(new Event("primer:rendered")));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
