// @ts-check
/**
 * Walk every concept page, validate the knowledge tree (the DAG), compute each
 * concept's implicit numeric level, and emit a JSON graph for the knowledge
 * explorer to ingest.
 *
 *   node scripts/build-graph.js              # validate + write dist/graph.json
 *   node scripts/build-graph.js --check      # validate only, write nothing (CI)
 *   node scripts/build-graph.js --out x.json # custom output path
 *
 * Each concept's id is its file path under concepts/ (without .html); its title is read from
 * the page's `<primer-title>` element; and its prerequisites/level come from the inline JSON
 * block (which may sit after `</html>`, and may be omitted entirely for a base concept):
 *   <script type="application/json" class="concept-meta"> { "prerequisites": [...] } </script>
 *
 * Exit code is non-zero when any error-severity diagnostic is found, so this can
 * gate CI.
 * @module
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConceptMeta } from "../js/concept-meta.js";
import { extractConceptRefs, extractForwardRefs, extractSoftRefs, extractTodoRefs, extractCourseMembers } from "../js/concept-refs.js";
import { decodeEntities } from "../js/html-entities.js";
import { validateGraph, indexConcepts, buildDependents, attachOrphans } from "../js/graph.js";
import { LOCALES, DEFAULT_LOCALE } from "../js/i18n.js";
import { parseJsonc } from "../js/jsonc.js";

/** @typedef {import("../js/types/domain.js").Concept} Concept */
/** @typedef {import("../js/types/domain.js").ResolvedConcept} ResolvedConcept */
/** @typedef {import("../js/types/domain.js").Diagnostic} Diagnostic */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONCEPTS_DIR = join(ROOT, "concepts");
const I18N_DIR = join(ROOT, "i18n");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const outArgIndex = args.indexOf("--out");
const OUT = outArgIndex !== -1 ? args[outArgIndex + 1] : join(ROOT, "dist", "graph.json");

/**
 * Recursively list all .html files under a directory.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listHtml(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listHtml(full)));
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

/**
 * Extract and parse the inline concept-meta JSON block from page HTML, or null when the page
 * carries no such block (a base concept may omit it entirely).
 * @param {string} html
 * @returns {unknown | null}
 */
function extractMeta(html) {
  const m = html.match(
    /<script[^>]*class=["'][^"']*\bconcept-meta\b[^"']*["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  return m ? parseJsonc(m[1]) : null;
}

/**
 * Read the raw inner markup of the page's `<primer-title>` element (collapsed whitespace), which
 * may contain inline elements such as `<primer-math>`. Returns null when there is no title element.
 * @param {string} html
 * @returns {string | null}
 */
function extractTitleRaw(html) {
  const m = html.match(/<primer-title[^>]*>([\s\S]*?)<\/primer-title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

/** Strip HTML tags to plain text — decode entities + collapse whitespace (so a title like
 * `Forces &amp; Motion` becomes `Forces & Motion`, not the literal entity). @param {string} s */
function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * Read the concept's plain-text title from `<primer-title>` (tags stripped) — what every text
 * consumer (tooltip, sort, SEO, SVG graph fallback) wants. See {@link extractTitleRaw} for the
 * markup form used to typeset a math title.
 * @param {string} html
 * @returns {string | null}
 */
function extractTitle(html) {
  const raw = extractTitleRaw(html);
  return raw === null ? null : stripTags(raw);
}

/**
 * Turn a concepts/-relative file path into the expected concept id.
 * @param {string} file Absolute path to the .html file.
 * @returns {string}
 */
function idFromPath(file) {
  return relative(CONCEPTS_DIR, file).replace(/\.html$/i, "").split(sep).join("/");
}

/**
 * Harvest translated concept titles from the per-locale overlays under i18n/<locale>/, so
 * the explorer can label nodes in the active language. Returns a Map of concept id →
 * `{ [locale]: title }`. Overlay validity (missing/stale/orphan) is i18n-check's job.
 * @returns {Promise<Map<string, Record<string, string>>>}
 */
async function collectTranslatedTitles() {
  /** @type {Map<string, Record<string, string>>} */
  const byId = new Map();
  for (const { id: locale } of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const dir = join(I18N_DIR, locale);
    let files;
    try {
      files = await listHtml(dir);
    } catch {
      continue; // no overlays for this locale yet
    }
    for (const file of files) {
      // The overlay's id is its path under i18n/<locale>/; its title is its <primer-title>.
      const html = await readFile(file, "utf8");
      const id = relative(dir, file).replace(/\.html$/i, "").split(sep).join("/");
      const title = extractTitle(html);
      if (!title) continue;
      const map = byId.get(id) ?? {};
      map[locale] = title;
      byId.set(id, map);
    }
  }
  return byId;
}

async function main() {
  /** @type {Concept[]} */
  const concepts = [];
  /** @type {Diagnostic[]} */
  const fileDiagnostics = [];
  // `<primer-ref forward to="X">` on page P means P is a prerequisite of X — the reverse of a
  // normal ref. Collect them here, then wire them into the targets after every page is read.
  /** @type {Map<string, string[]>} concept id → ids it forward-refs */
  const forwardByConcept = new Map();
  // `<primer-ref soft to="X">` creates NO edge — we collect them only to validate X exists.
  /** @type {Map<string, string[]>} concept id → ids it soft-refs */
  const softByConcept = new Map();
  // `<primer-ref todo to="…">` placeholders — no edge, never validated; tracked only to report how
  // many planned-but-unwritten concepts are still referenced.
  /** @type {Set<string>} */
  const todoTargets = new Set();
  let todoPages = 0;

  const files = (await listHtml(CONCEPTS_DIR)).sort();
  for (const file of files) {
    const id = idFromPath(file);
    try {
      const html = await readFile(file, "utf8");
      const raw = extractMeta(html);
      const parsed = raw === null ? { prerequisites: [] } : parseConceptMeta(raw);
      // Prerequisites are the union of the concept-meta header and the inline `<primer-ref>`s
      // in the prose (each ref is a backward edge to a concept this page builds on). A ref to
      // an unknown id then surfaces via the existing dangling-prerequisite check; a ref pointed
      // the wrong way creates a cycle, which detectCycles flags. Self-references are dropped.
      const refs = extractConceptRefs(html).filter((r) => r !== id);
      // The title is read as plain text; when the <primer-title> carries inline markup (e.g.
      // <primer-math> for a math title) we ALSO keep the raw markup as `titleHtml`, so the page
      // header and the explorers can typeset it while `title` stays clean for text uses.
      const rawTitle = extractTitleRaw(html);
      /** @type {Concept} */
      const meta = {
        ...parsed,
        id, // the node key is the file path under concepts/ (no longer authored in the block)
        title: (rawTitle === null ? null : stripTags(rawTitle)) ?? id, // from <primer-title>
        // `prerequisites` is the UNION the rest of the system uses; `explicitPrerequisites` keeps
        // just the concept-meta–declared ones, so implicit (<primer-ref>) edges stay distinguishable
        // (implicit = prerequisites − explicitPrerequisites).
        explicitPrerequisites: parsed.prerequisites,
        prerequisites: [...new Set([...parsed.prerequisites, ...refs])],
      };
      if (rawTitle && /<[^>]+>/.test(rawTitle)) meta.titleHtml = rawTitle;
      // A course page (`"course": true`) carries its ordered member list. The FIRST member is the
      // course page itself (the course starts at its own overview), followed by every normal or soft
      // `<primer-ref>` on the page (de-duped). Members are ordinary refs, so they're validated as
      // prerequisites (normal) or by the soft-ref existence check below.
      if (parsed.course) {
        meta.courseMembers = [id, ...extractCourseMembers(html).filter((r) => r !== id)];
      }
      concepts.push(meta);
      // Stash this page's forward refs; they're reversed onto their targets below.
      const fwd = extractForwardRefs(html).filter((r) => r !== id);
      if (fwd.length) forwardByConcept.set(id, fwd);
      // Stash this page's soft refs; they add no edge, just an existence check below.
      const soft = extractSoftRefs(html).filter((r) => r !== id);
      if (soft.length) softByConcept.set(id, soft);
      // Tally `<primer-ref todo>` placeholder refs (no edge, no validation — just reported).
      const todos = extractTodoRefs(html);
      if (todos.length) {
        todoPages++;
        for (const tdo of todos) todoTargets.add(tdo);
      }
    } catch (err) {
      fileDiagnostics.push({
        severity: "error",
        code: "metadata-error",
        concept: id,
        message: `${relative(ROOT, file)}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Reverse-wire forward refs: a `<primer-ref forward to="X">` on page P makes P an IMPLICIT
  // prerequisite of X (added to X's `prerequisites`, NOT its `explicitPrerequisites`, so it stays
  // a weak/thin edge like any harvested ref). Done before attachOrphans/validateGraph so X stops
  // being an orphan and any cycle the reverse edge creates is still caught by detectCycles.
  const indexed = indexConcepts(concepts);
  for (const [p, targets] of forwardByConcept) {
    for (const x of targets) {
      const target = indexed.get(x);
      if (!target) {
        fileDiagnostics.push({
          severity: "error",
          code: "dangling-prerequisite",
          concept: p,
          message: `forward <primer-ref to="${x}"> names no concept`,
        });
        continue;
      }
      if (!target.prerequisites.includes(p)) target.prerequisites.push(p);
    }
  }

  // Soft refs add no edge — but a typo'd target should still fail the build, like forward refs do.
  for (const [p, targets] of softByConcept) {
    for (const x of targets) {
      if (!indexed.get(x)) {
        fileDiagnostics.push({
          severity: "error",
          code: "dangling-prerequisite",
          concept: p,
          message: `soft <primer-ref to="${x}"> names no concept`,
        });
      }
    }
  }

  // Re-parent any orphan (a page with no resolvable prerequisite) under the "orphans"
  // maintenance node before validating, so the tree stays connected without authors wiring
  // base pages to the root by hand.
  attachOrphans(concepts);

  const { diagnostics, resolved } = validateGraph(concepts);
  const all = [...fileDiagnostics, ...diagnostics];

  // Report.
  const errors = all.filter((d) => d.severity === "error");
  const warnings = all.filter((d) => d.severity === "warning");
  for (const d of all) {
    const where = d.concept ? ` [${d.concept}]` : "";
    console.log(`${d.severity === "error" ? "✖ ERROR " : "⚠ WARN  "}${d.code}${where}: ${d.message}`);
  }
  console.log(
    `\nScanned ${files.length} page(s) → ${concepts.length} concept(s); ` +
      `${errors.length} error(s), ${warnings.length} warning(s).`,
  );
  if (todoTargets.size > 0) {
    console.log(`📝 ${todoTargets.size} todo placeholder(s) referenced across ${todoPages} page(s).`);
  }

  if (errors.length > 0) {
    console.error("\nGraph is invalid — not emitting output.");
    process.exit(1);
  }

  // Attach each concept's immediate successors (the direct mirror of prerequisites)
  // so the reverse direction is first-class data for the navigation pathway widget, plus
  // any translated titles harvested from the per-locale overlays.
  const dependents = buildDependents(indexConcepts(resolved));
  const translatedTitles = await collectTranslatedTitles();
  const withSuccessors = resolved.map((r) => {
    /** @type {any} */
    const node = { ...r, successors: [...(dependents.get(r.id) ?? [])].sort() };
    const titles = translatedTitles.get(r.id);
    if (titles && Object.keys(titles).length) node.titles = titles;
    return node;
  });

  const sorted = withSuccessors.sort((a, b) => (a.level - b.level) || a.id.localeCompare(b.id));
  const output = {
    version: 1,
    conceptCount: sorted.length,
    concepts: sorted,
  };

  if (checkOnly) {
    console.log("\n--check: graph is valid (no file written).");
    return;
  }

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${relative(ROOT, OUT)} (${sorted.length} concepts).`);

  await writeSeoFiles(sorted);
}

/**
 * Emit /sitemap.xml and /robots.txt at the repo root for SEO. There's no server build,
 * so these are committed artifacts refreshed by `npm run graph` (like dist/graph.json).
 * The production origin is read from the committed CNAME file (single source of truth).
 *
 * A translated lesson is the same URL with `?lang=<locale>` (see js/render.js). For each
 * concept that has translations (a non-empty `titles`), we emit a `<url>` for the English
 * version AND for each `?lang=<locale>` variant, every entry carrying the SAME `xhtml:link`
 * hreflang alternate set (Google's bidirectional requirement) so each language is indexed as
 * its own page rather than a duplicate of English. Untranslated concepts stay plain.
 * @param {ResolvedConcept[]} concepts
 */
async function writeSeoFiles(concepts) {
  let origin = "https://interactiveprimer.com";
  try {
    const cname = (await readFile(join(ROOT, "CNAME"), "utf8")).trim().split(/\s+/)[0];
    if (cname) origin = `https://${cname}`;
  } catch {
    /* no CNAME (e.g. a fork) — fall back to the default origin */
  }

  /** The shared hreflang alternate block for a concept (en + each translated locale + x-default).
   * @param {string} enUrl @param {string[]} locales @returns {string} */
  const alternates = (enUrl, locales) =>
    [
      `    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}"/>`,
      ...locales.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${enUrl}?lang=${l}"/>`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${enUrl}"/>`,
    ].join("\n");

  /** @type {string[]} */
  const entries = [`  <url><loc>${origin}/</loc></url>`];
  for (const c of concepts) {
    const enUrl = `${origin}/concepts/${c.id}.html`;
    const locales = Object.keys(c.titles ?? {})
      .filter((l) => l !== DEFAULT_LOCALE)
      .sort();
    if (locales.length === 0) {
      entries.push(`  <url><loc>${enUrl}</loc></url>`);
      continue;
    }
    const alt = alternates(enUrl, locales);
    // The English version plus each translated variant, all sharing the alternate set.
    for (const loc of [enUrl, ...locales.map((l) => `${enUrl}?lang=${l}`)]) {
      entries.push(`  <url>\n    <loc>${loc}</loc>\n${alt}\n  </url>`);
    }
  }

  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    entries.join("\n") +
    `\n</urlset>\n`;
  await writeFile(join(ROOT, "sitemap.xml"), sitemap, "utf8");

  const robots = `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`;
  await writeFile(join(ROOT, "robots.txt"), robots, "utf8");

  console.log(`Wrote sitemap.xml (${entries.length} urls) + robots.txt for ${origin}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
