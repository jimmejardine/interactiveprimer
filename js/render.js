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
import { getConceptMeta } from "./concept-meta.js";
import { initTheme } from "./theme.js";
import { initLocale, getLocale, DEFAULT_LOCALE, t } from "./i18n.js";
import { loadGraph } from "./graph-data.js";

/** Build the page shell once the DOM is ready. */
async function render() {
  const body = document.body;

  // Reconcile the synchronously-set theme (boot.js) with storage — this also loads the
  // fun display font when that theme is the saved choice.
  initTheme();
  // Reconcile the synchronously-set locale (boot.js) with storage + browser languages.
  initLocale();

  // Global page chrome: the top-right hamburger menu (theme + language), mounted once.
  if (!body.querySelector("primer-menu")) {
    body.appendChild(document.createElement("primer-menu"));
  }

  const meta = safeMeta();

  // The content is every direct element child of <body> that is authored lesson content —
  // i.e. NOT a <script> (leaving the concept-meta/scene-strings JSON blocks and any inline
  // scene script in place), and NOT the chrome we just mounted (the fixed <primer-menu>) or
  // a previously-built shell <main>. Excluding the menu matters: otherwise the overlay swap
  // would move or even remove it along with the canonical content.
  const SKIP = new Set(["SCRIPT", "PRIMER-MENU", "MAIN"]);
  let content = /** @type {Element[]} */ ([...body.children].filter((el) => !SKIP.has(el.tagName)));
  let pageTitle = meta?.title ?? null;

  // Non-English: apply the translation overlay IF one exists, else fall back to English.
  // We consult the emitted graph (which records a translated `titles[locale]` for every
  // concept that has an overlay) so we only fetch when a translation is actually there —
  // avoiding a noisy 404 in the console for the (common) untranslated case.
  const locale = getLocale();
  if (meta && locale !== DEFAULT_LOCALE) {
    const applied = (await hasOverlay(meta.id, locale))
      ? await applyOverlay(meta.id, locale, content)
      : null;
    if (applied) {
      content = applied.content;
      pageTitle = applied.title ?? pageTitle;
    } else {
      // No translation for this concept → render the whole page in English.
      document.documentElement.lang = DEFAULT_LOCALE;
    }
  }

  // Title from the (possibly translated) concept title (the page writes no <head>/<title>).
  if (pageTitle) document.title = `${pageTitle} — ${t("app.name")}`;

  // SEO metadata. Concept pages carry no static <head>, so inject it here; crawlers that
  // render JS (e.g. Googlebot) index the result. See README → SEO.
  injectSeo(pageTitle ?? meta?.title ?? "", firstText(content), getLocale(), meta?.declaredLevel);

  if (content.length === 0) return;

  const main = document.createElement("main");
  main.className = "primer-shell";
  const page = document.createElement("primer-page");
  const concept = document.createElement("primer-concept");

  // Move the (authored or translated) content into the concept body.
  concept.append(...content);

  // A navigation pathway at the top and bottom of the lesson; both slot into
  // <primer-page>'s single <slot> in order. Each fetches the graph and renders itself.
  const topPathway = document.createElement("primer-pathway");
  const bottomPathway = document.createElement("primer-pathway");
  page.append(topPathway, concept, bottomPathway);
  main.appendChild(page);
  body.appendChild(main);
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
 * caller falls back to English). Swaps the canonical content out of the DOM and replaces the
 * page's `scene-strings` block with the overlay's, so the reused scene JS narrates in the
 * target language.
 * @param {string} id
 * @param {string} locale
 * @param {Element[]} canonicalContent
 * @returns {Promise<{ content: Element[], title: string | null } | null>}
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
  const translated = [...doc.body.children].filter((el) => el.tagName !== "SCRIPT");
  if (translated.length === 0) return null;

  // Translated title from the overlay's own concept-meta block, if present.
  let title = null;
  try {
    title = getConceptMeta(doc)?.title ?? null;
  } catch {
    /* malformed overlay metadata — keep the English title */
  }

  // Update the live concept-meta title so <primer-concept> renders the translated <h1>
  // (it reads the title from this block). Id/prerequisites/level are left untouched — only
  // the display title changes, and the graph is built from files, not this live DOM.
  if (title) {
    const metaEl = document.querySelector("script.concept-meta");
    if (metaEl?.textContent) {
      try {
        const m = JSON.parse(metaEl.textContent);
        m.title = title;
        metaEl.textContent = JSON.stringify(m);
      } catch {
        /* leave the English title if the block can't be parsed */
      }
    }
  }

  // Remove the canonical (English) content from the DOM…
  for (const el of canonicalContent) el.remove();
  // …and swap the canonical scene-strings for the overlay's, so getSceneStrings() (read by
  // the reused scene JS at play time) returns the translated words.
  document.querySelector("script.scene-strings")?.remove();
  const overlayStrings = doc.querySelector("script.scene-strings");
  if (overlayStrings) document.body.appendChild(document.importNode(overlayStrings, true));

  const content = translated.map((el) => /** @type {Element} */ (document.importNode(el, true)));
  return { content, title };
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
 * Inject SEO tags into `<head>`: a description, a canonical link, and a LearningResource
 * JSON-LD. Idempotent (re-running updates the same elements).
 * @param {string} title
 * @param {string} description
 * @param {string} locale
 * @param {number} [level]
 */
function injectSeo(title, description, locale, level) {
  const canonical = location.origin + location.pathname; // clean URL (drops any ?lang)

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
