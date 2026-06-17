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
 * Each concept's metadata is read from its inline JSON block:
 *   <script type="application/json" class="concept-meta"> { ... } </script>
 * and the concept id is also expected to equal the file path under concepts/
 * (without the .html extension), which is verified as an extra CI check.
 *
 * Exit code is non-zero when any error-severity diagnostic is found, so this can
 * gate CI.
 * @module
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConceptMeta } from "../js/concept-meta.js";
import { extractConceptRefs } from "../js/concept-refs.js";
import { validateGraph, indexConcepts, buildDependents } from "../js/graph.js";
import { LOCALES, DEFAULT_LOCALE } from "../js/i18n.js";
import { parseJsonc } from "../js/jsonc.js";

/** @typedef {import("../js/types/domain.js").Concept} Concept */
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
 * Extract and parse the inline concept-meta JSON block from page HTML.
 * @param {string} html
 * @returns {unknown}
 */
function extractMeta(html) {
  const m = html.match(
    /<script[^>]*class=["'][^"']*\bconcept-meta\b[^"']*["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) throw new Error("no <script class=\"concept-meta\"> block found");
  return parseJsonc(m[1]);
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
      try {
        const meta = parseConceptMeta(extractMeta(await readFile(file, "utf8")));
        const map = byId.get(meta.id) ?? {};
        map[locale] = meta.title;
        byId.set(meta.id, map);
      } catch {
        /* malformed overlay — i18n-check reports it */
      }
    }
  }
  return byId;
}

async function main() {
  /** @type {Concept[]} */
  const concepts = [];
  /** @type {Diagnostic[]} */
  const fileDiagnostics = [];

  const files = (await listHtml(CONCEPTS_DIR)).sort();
  for (const file of files) {
    const expectedId = idFromPath(file);
    try {
      const html = await readFile(file, "utf8");
      const meta = parseConceptMeta(extractMeta(html));
      // Prerequisites are the union of the concept-meta header and the inline `<primer-ref>`s
      // in the prose (each ref is a backward edge to a concept this page builds on). A ref to
      // an unknown id then surfaces via the existing dangling-prerequisite check; a ref pointed
      // the wrong way creates a cycle, which detectCycles flags. Self-references are dropped.
      const refs = extractConceptRefs(html).filter((r) => r !== meta.id);
      meta.prerequisites = [...new Set([...meta.prerequisites, ...refs])];
      if (meta.id !== expectedId) {
        fileDiagnostics.push({
          severity: "error",
          code: "id-path-mismatch",
          concept: meta.id,
          message: `id "${meta.id}" does not match its path-derived id "${expectedId}" (${relative(ROOT, file)})`,
        });
      }
      concepts.push(meta);
    } catch (err) {
      fileDiagnostics.push({
        severity: "error",
        code: "metadata-error",
        concept: expectedId,
        message: `${relative(ROOT, file)}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

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
 * @param {Concept[]} concepts
 */
async function writeSeoFiles(concepts) {
  let origin = "https://interactiveprimer.com";
  try {
    const cname = (await readFile(join(ROOT, "CNAME"), "utf8")).trim().split(/\s+/)[0];
    if (cname) origin = `https://${cname}`;
  } catch {
    /* no CNAME (e.g. a fork) — fall back to the default origin */
  }

  // English URLs only (translations are applied client-side at the same URL).
  const urls = ["/", ...concepts.map((c) => `/concepts/${c.id}.html`)];
  const sitemap =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${origin}${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`;
  await writeFile(join(ROOT, "sitemap.xml"), sitemap, "utf8");

  const robots = `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`;
  await writeFile(join(ROOT, "robots.txt"), robots, "utf8");

  console.log(`Wrote sitemap.xml (${urls.length} urls) + robots.txt for ${origin}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
