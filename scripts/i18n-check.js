// @ts-check
/**
 * i18n staleness checker. Two surfaces, one tool:
 *
 *  1. LESSONS — each English concept page under concepts/ has a "translatable surface"
 *     (its `<primer-title>` + prose + quiz + manim captions + scene-strings, but NOT the
 *     language-independent scene JS nor the concept-meta prerequisites/level). We hash that
 *     surface and compare to the `sourceHash` each per-locale overlay (i18n/<locale>/<id>.html)
 *     records in a trailing `<!-- sourceHash: … -->` comment, reporting stale / missing / orphan
 *     overlays — plus a scene-version retention check (an overlay must only pin scenes the
 *     English page still registers).
 *
 *  2. CHROME — the UI string catalogs (src/i18n/<locale>.ts) vs src/i18n/en.ts (the source of
 *     truth), at PER-KEY granularity. Each locale carries a sidecar src/i18n/<locale>.hashes.json
 *     recording the English hash each key was translated from; we report stale / missing /
 *     orphan keys.
 *
 * Usage:
 *   node scripts/i18n-check.js              # check; non-zero exit if any ERROR-level issue
 *   node scripts/i18n-check.js --update es  # (re)stamp src/i18n/es.hashes.json from English
 *
 * Severity: STALE/ORPHAN/broken-scene-pin are ERRORS (something existing is inconsistent and
 * must be fixed); MISSING is a WARNING (not yet translated — expected during a rollout), so
 * incremental translation doesn't keep CI red.
 * @module
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { LOCALES, DEFAULT_LOCALE } from "../src/i18n.ts";
import enCatalog from "../src/i18n/en.ts";
import { parseJsonc } from "../src/jsonc.ts";
import { parseVariables } from "../src/quiz-vars.ts";
import { placeholderNames, expressionPlaceholders } from "../src/scene-string-lint.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONCEPTS_DIR = join(ROOT, "concepts");
const I18N_DIR = join(ROOT, "i18n");
const CATALOG_DIR = join(ROOT, "src", "i18n");

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

/** A concept id from a file path under `baseDir` (e.g. concepts/ or i18n/<locale>/).
 * @param {string} file @param {string} baseDir @returns {string} */
function idFromPath(file, baseDir) {
  return relative(baseDir, file).replace(/\.html$/i, "").split(sep).join("/");
}

/** Read an overlay's declared source hash from its trailing `<!-- sourceHash: … -->` comment.
 * @param {string} html @returns {string | undefined} */
function extractSourceHash(html) {
  const m = html.match(/<!--\s*sourceHash:\s*([0-9a-f]+)\s*-->/i);
  return m ? m[1] : undefined;
}

/**
 * The translatable surface of a page: everything a translator must mirror, normalized and
 * hashed. We drop the language-independent / non-translatable parts: the concept-meta block
 * (prerequisites/level), external scripts (boot.js), inline module scripts (the scene JS),
 * and HTML comments. What remains — the `<primer-title>`, prose, manim captions, the quiz
 * bank, and the scene-strings blocks — is the surface.
 * @param {string} html
 * @returns {string}
 */
function translatableSurface(html) {
  let s = html;
  s = s.replace(/<script[^>]*class=["'][^"']*\bconcept-meta\b[^"']*["'][^>]*>[\s\S]*?<\/script>/i, "");
  s = s.replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, "");
  s = s.replace(/<script\b[^>]*\btype=["']module["'][^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
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

/** Quiz names referenced by `<primer-quiz name="…">`. @param {string} html @returns {Set<string>} */
function referencedQuizzes(html) {
  const out = new Set();
  const re = /<primer-quiz\b[^>]*\bname=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.add(m[1]);
  return out;
}

/** Quiz names registered by `registerQuiz("…")`. @param {string} html @returns {Set<string>} */
function registeredQuizzes(html) {
  const out = new Set();
  const re = /registerQuiz\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) out.add(m[1]);
  return out;
}

/** Every (namespace, key, string-value) triple across a page's `class="scene-strings"` blocks.
 * @param {string} html @returns {{ ns: string, key: string, value: string }[]} */
function sceneStringValues(html) {
  /** @type {{ ns: string, key: string, value: string }[]} */
  const out = [];
  const re = /<script\b[^>]*class=["'][^"']*\bscene-strings\b[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let parsed;
    try {
      parsed = parseJsonc(m[1]);
    } catch {
      continue; // malformed block; render.js would skip it too
    }
    if (!parsed || typeof parsed !== "object") continue;
    for (const [ns, kv] of Object.entries(parsed)) {
      if (!kv || typeof kv !== "object") continue;
      for (const [key, value] of Object.entries(kv)) {
        if (typeof value === "string") out.push({ ns, key, value });
      }
    }
  }
  return out;
}

/** The union of quiz variable names declared by `variables: "…"` specs on a page. @param {string} html @returns {Set<string>} */
function quizVarNames(html) {
  const names = new Set();
  const re = /variables:\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      for (const v of parseVariables(m[1])) names.add(v.name);
    } catch {
      // a malformed spec is reported by the quiz engine at runtime; ignore here.
    }
  }
  return names;
}

/**
 * Scene-strings guardrails (the i18n "prose/maths split" contract):
 *   A. No EXPRESSIONS in a translatable string — a `{…}` over the page's drawn quiz variables
 *      (e.g. `{10*t + o}`) is not evaluated by fillVars and renders literally. Precompute it in
 *      the builder and pass a named value instead.
 *   B. A locale overlay must reference the SAME `{placeholders}` as its English source (a dropped
 *      or renamed token silently breaks interpolation in that one locale).
 * @param {Problem[]} problems
 */
async function checkSceneStrings(problems) {
  // English canonical: id → Map("ns.key" → placeholder set). Run Check A while reading.
  /** @type {Map<string, Map<string, Set<string>>>} */
  const canonical = new Map();
  for (const file of await listHtml(CONCEPTS_DIR)) {
    const html = await readFile(file, "utf8");
    const id = idFromPath(file, CONCEPTS_DIR);
    const vars = quizVarNames(html);
    /** @type {Map<string, Set<string>>} */
    const keys = new Map();
    for (const { ns, key, value } of sceneStringValues(html)) {
      for (const expr of expressionPlaceholders(value, vars)) {
        problems.push({
          sev: "error",
          msg: `lesson "${id}" scene-string "${ns}.${key}" contains expression {${expr}} — sceneStrings interpolates only simple {name} placeholders; precompute it in the builder and pass it as a named variable`,
        });
      }
      keys.set(`${ns}.${key}`, placeholderNames(value));
    }
    canonical.set(id, keys);
  }

  // Check B — every locale overlay's scene-strings must keep the English placeholders.
  for (const { id: locale } of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const dir = join(I18N_DIR, locale);
    for (const file of await listHtml(dir)) {
      const id = idFromPath(file, dir);
      const enKeys = canonical.get(id);
      if (!enKeys) continue; // ORPHAN overlay — already reported by checkLessons
      const html = await readFile(file, "utf8");
      for (const { ns, key, value } of sceneStringValues(html)) {
        const en = enKeys.get(`${ns}.${key}`);
        if (!en) continue; // key absent from English — not a placeholder-consistency concern
        const loc = placeholderNames(value);
        const same = en.size === loc.size && [...en].every((k) => loc.has(k));
        if (!same) {
          problems.push({
            sev: "error",
            msg: `lesson [${locale}] "${id}" scene-string "${ns}.${key}" placeholders differ from English (en: {${[...en].sort().join(", ")}}; ${locale}: {${[...loc].sort().join(", ")}})`,
          });
        }
      }
    }
  }
}

/** Load a locale's chrome catalog (the default export). @param {string} locale */
async function loadCatalog(locale) {
  const url = pathToFileURL(join(CATALOG_DIR, `${locale}.ts`)).href;
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
      problems.push({ sev: "warn", msg: `chrome [${locale}] MISSING catalog src/i18n/${locale}.ts` });
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
  // Index every English canonical concept by id: its surface hash + the scene and quiz names it
  // registers (so an overlay can only pin scenes/quizzes the English page still provides).
  /** @type {Map<string, { surfaceHash: string, registered: Set<string>, quizzes: Set<string> }>} */
  const canonical = new Map();
  for (const file of await listHtml(CONCEPTS_DIR)) {
    const html = await readFile(file, "utf8");
    canonical.set(idFromPath(file, CONCEPTS_DIR), {
      surfaceHash: hash(translatableSurface(html)),
      registered: registeredScenes(html),
      quizzes: registeredQuizzes(html),
    });
  }

  for (const { id: locale } of LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const dir = join(I18N_DIR, locale);

    /** @type {Map<string, { sourceHash?: string, html: string }>} */
    const overlays = new Map();
    for (const file of await listHtml(dir)) {
      const html = await readFile(file, "utf8");
      // The overlay's id is its path under i18n/<locale>/; its declared source hash is the
      // trailing `<!-- sourceHash: … -->` comment (overlays no longer carry a concept-meta).
      const id = idFromPath(file, dir);
      overlays.set(id, { sourceHash: extractSourceHash(html), html });
      if (!canonical.has(id)) {
        problems.push({ sev: "error", msg: `lesson [${locale}] ORPHAN "${id}" — no English concept at that id` });
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
      for (const name of referencedQuizzes(ov.html)) {
        if (!c.quizzes.has(name)) {
          problems.push({
            sev: "error",
            msg: `lesson [${locale}] "${id}" pins quiz "${name}" the English page no longer registers — keep it registered (versioned) or re-pin the overlay`,
          });
        }
      }
    }
  }
}

/** Re-stamp src/i18n/<locale>.hashes.json from the current English hashes. @param {string} locale */
async function update(locale) {
  if (locale === DEFAULT_LOCALE) {
    console.error(`Nothing to bless for the default locale "${DEFAULT_LOCALE}".`);
    process.exit(1);
  }
  let cat;
  try {
    cat = await loadCatalog(locale);
  } catch {
    console.error(`No catalog src/i18n/${locale}.ts to bless.`);
    process.exit(1);
  }
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of Object.keys(cat).sort()) {
    if (k in enCatalog) out[k] = hash(enCatalog[k]);
  }
  await writeFile(join(CATALOG_DIR, `${locale}.hashes.json`), JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Stamped src/i18n/${locale}.hashes.json (${Object.keys(out).length} keys).`);
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
  await checkSceneStrings(problems);

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
