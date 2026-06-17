// @ts-check
/**
 * i18n staleness checker. Two surfaces, one tool:
 *
 *  1. LESSONS — each English concept page under concepts/ has a "translatable surface"
 *     (its title + prose + quiz + manim captions + scene-strings, but NOT the
 *     language-independent scene JS nor the id/prerequisites/level). We hash that surface
 *     and compare to the `sourceHash` each per-locale overlay (i18n/<locale>/<id>.html)
 *     records, reporting stale / missing / orphan overlays — plus a scene-version retention
 *     check (an overlay must only pin scenes the English page still registers).
 *
 *  2. CHROME — the UI string catalogs (js/i18n/<locale>.js) vs js/i18n/en.js (the source of
 *     truth), at PER-KEY granularity. Each locale carries a sidecar js/i18n/<locale>.hashes.json
 *     recording the English hash each key was translated from; we report stale / missing /
 *     orphan keys.
 *
 * Usage:
 *   node scripts/i18n-check.js              # check; non-zero exit if any ERROR-level issue
 *   node scripts/i18n-check.js --update es  # (re)stamp js/i18n/es.hashes.json from English
 *
 * Severity: STALE/ORPHAN/broken-scene-pin are ERRORS (something existing is inconsistent and
 * must be fixed); MISSING is a WARNING (not yet translated — expected during a rollout), so
 * incremental translation doesn't keep CI red.
 * @module
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { parseConceptMeta } from "../js/concept-meta.js";
import { LOCALES, DEFAULT_LOCALE } from "../js/i18n.js";
import { parseJsonc } from "../js/jsonc.js";
import enCatalog from "../js/i18n/en.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONCEPTS_DIR = join(ROOT, "concepts");
const I18N_DIR = join(ROOT, "i18n");
const CATALOG_DIR = join(ROOT, "js", "i18n");

/** Short, stable content hash. @param {string} s @returns {string} */
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** @typedef {{ sev: "error" | "warn", msg: string }} Problem */

/**
 * Recursively list all .html files under a directory (empty if it doesn't exist).
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listHtml(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listHtml(full)));
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

/** Extract + parse the inline concept-meta JSON block. @param {string} html @returns {unknown} */
function extractMeta(html) {
  const m = html.match(
    /<script[^>]*class=["'][^"']*\bconcept-meta\b[^"']*["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) throw new Error('no <script class="concept-meta"> block found');
  return parseJsonc(m[1]);
}

/**
 * The translatable surface of a page: everything a translator must mirror, normalized and
 * hashed. We drop the language-independent / non-translatable parts: the concept-meta block
 * (id/prerequisites/level), external scripts (boot.js), inline module scripts (the scene
 * JS), and HTML comments. What remains — prose, manim captions, the quiz bank, and the
 * scene-strings block — plus the title is the surface.
 * @param {string} html
 * @param {string} title
 * @returns {string}
 */
function translatableSurface(html, title) {
  let s = html;
  s = s.replace(/<script[^>]*class=["'][^"']*\bconcept-meta\b[^"']*["'][^>]*>[\s\S]*?<\/script>/i, "");
  s = s.replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, "");
  s = s.replace(/<script\b[^>]*\btype=["']module["'][^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return `${title}\n${s}`;
}

/** Scene names referenced by `<primer-manim scene="…">`. @param {string} html @returns {Set<string>} */
function referencedScenes(html) {
  const out = new Set();
  const re = /<primer-manim\b[^>]*\bscene=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.add(m[1]);
  return out;
}

/** Scene names registered by `registerManimScene("…")`. @param {string} html @returns {Set<string>} */
function registeredScenes(html) {
  const out = new Set();
  const re = /registerManimScene\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) out.add(m[1]);
  return out;
}

/** Load a locale's chrome catalog (the default export). @param {string} locale */
async function loadCatalog(locale) {
  const url = pathToFileURL(join(CATALOG_DIR, `${locale}.js`)).href;
  return /** @type {Record<string, string>} */ ((await import(url)).default);
}

/** Load a locale's chrome source-hash sidecar (or {} if absent). @param {string} locale */
async function loadHashes(locale) {
  try {
    return /** @type {Record<string, string>} */ (
      JSON.parse(await readFile(join(CATALOG_DIR, `${locale}.hashes.json`), "utf8"))
    );
  } catch {
    return {};
  }
}

/** @param {Problem[]} problems */
async function checkChrome(problems) {
  /** @type {Record<string, string>} */
  const enHashes = {};
  for (const k of Object.keys(enCatalog)) enHashes[k] = hash(enCatalog[k]);

  for (const { id: locale } of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    /** @type {Record<string, string>} */
    let cat;
    try {
      cat = await loadCatalog(locale);
    } catch {
      problems.push({ sev: "warn", msg: `chrome [${locale}] MISSING catalog js/i18n/${locale}.js` });
      continue;
    }
    const stored = await loadHashes(locale);
    for (const k of Object.keys(enCatalog)) {
      if (!(k in cat)) {
        problems.push({ sev: "warn", msg: `chrome [${locale}] MISSING key "${k}"` });
      } else if (stored[k] !== enHashes[k]) {
        problems.push({
          sev: "error",
          msg: `chrome [${locale}] STALE key "${k}" — re-translate, then \`npm run i18n:bless -- ${locale}\``,
        });
      }
    }
    for (const k of Object.keys(cat)) {
      if (!(k in enCatalog)) problems.push({ sev: "error", msg: `chrome [${locale}] ORPHAN key "${k}" (not in en.js)` });
    }
  }
}

/** @param {Problem[]} problems */
async function checkLessons(problems) {
  // Index every English canonical concept by id: its surface hash + registered scene names.
  /** @type {Map<string, { surfaceHash: string, registered: Set<string> }>} */
  const canonical = new Map();
  for (const file of await listHtml(CONCEPTS_DIR)) {
    const html = await readFile(file, "utf8");
    let meta;
    try {
      meta = parseConceptMeta(extractMeta(html));
    } catch {
      continue; // build-graph reports canonical metadata errors
    }
    canonical.set(meta.id, {
      surfaceHash: hash(translatableSurface(html, meta.title)),
      registered: registeredScenes(html),
    });
  }

  for (const { id: locale } of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const dir = join(I18N_DIR, locale);

    /** @type {Map<string, { sourceHash?: string, html: string }>} */
    const overlays = new Map();
    for (const file of await listHtml(dir)) {
      const html = await readFile(file, "utf8");
      let meta;
      try {
        meta = parseConceptMeta(extractMeta(html));
      } catch (err) {
        problems.push({ sev: "error", msg: `overlay [${locale}] ${relative(ROOT, file)}: ${err instanceof Error ? err.message : String(err)}` });
        continue;
      }
      overlays.set(meta.id, { sourceHash: meta.sourceHash, html });
      if (!canonical.has(meta.id)) {
        problems.push({ sev: "error", msg: `lesson [${locale}] ORPHAN "${meta.id}" — no English concept at that id` });
      }
    }

    for (const [id, c] of canonical) {
      const ov = overlays.get(id);
      if (!ov) {
        problems.push({ sev: "warn", msg: `lesson [${locale}] MISSING "${id}" (translate; sourceHash ${c.surfaceHash})` });
        continue;
      }
      if (ov.sourceHash !== c.surfaceHash) {
        problems.push({
          sev: "error",
          msg: `lesson [${locale}] STALE "${id}" — English changed; re-translate and set sourceHash ${c.surfaceHash} (found ${ov.sourceHash ?? "none"})`,
        });
      }
      for (const name of referencedScenes(ov.html)) {
        if (!c.registered.has(name)) {
          problems.push({
            sev: "error",
            msg: `lesson [${locale}] "${id}" pins scene "${name}" the English page no longer registers — keep it registered (versioned) or re-pin the overlay`,
          });
        }
      }
    }
  }
}

/** Re-stamp js/i18n/<locale>.hashes.json from the current English hashes. @param {string} locale */
async function update(locale) {
  if (locale === DEFAULT_LOCALE) {
    console.error(`Nothing to bless for the default locale "${DEFAULT_LOCALE}".`);
    process.exit(1);
  }
  let cat;
  try {
    cat = await loadCatalog(locale);
  } catch {
    console.error(`No catalog js/i18n/${locale}.js to bless.`);
    process.exit(1);
  }
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of Object.keys(cat).sort()) {
    if (k in enCatalog) out[k] = hash(enCatalog[k]);
  }
  await writeFile(join(CATALOG_DIR, `${locale}.hashes.json`), JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Stamped js/i18n/${locale}.hashes.json (${Object.keys(out).length} keys).`);
}

async function main() {
  const args = process.argv.slice(2);
  const upd = args.indexOf("--update");
  if (upd !== -1) {
    const locale = args[upd + 1];
    if (!locale) {
      console.error("Usage: node scripts/i18n-check.js --update <locale>");
      process.exit(1);
    }
    await update(locale);
    return;
  }

  /** @type {Problem[]} */
  const problems = [];
  await checkChrome(problems);
  await checkLessons(problems);

  for (const p of problems) {
    console.log(`${p.sev === "error" ? "✖ ERROR" : "⚠ WARN "} ${p.msg}`);
  }
  const errors = problems.filter((p) => p.sev === "error").length;
  const warnings = problems.length - errors;
  console.log(`\ni18n: ${errors} error(s), ${warnings} warning(s).`);
  if (errors > 0) process.exit(1);
  console.log("No stale or broken translations.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
