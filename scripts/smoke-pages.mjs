/**
 * smoke-pages.mjs — load every concept page in headless Chromium and report JavaScript errors.
 *
 * Interactive widgets (`<primer-geometry>`, `<primer-chart>`, `<primer-quiz>`, `<primer-manim>`,
 * `<primer-program>`) catch builder errors and show them only inside the widget — so a broken page looks
 * fine to a naive console listener. js/report-error.js now records every such error (plus uncaught errors
 * and unhandled rejections) on `window.__primerErrors`; this script reads that after each page settles.
 *
 * All third-party libs are vendored under /3rdparty, so this runs fully offline against the local server.
 *
 * Usage:
 *   node scripts/smoke-pages.mjs                     # every page
 *   node scripts/smoke-pages.mjs --filter algebra    # only ids containing "algebra"
 *   node scripts/smoke-pages.mjs --changed           # only concept pages changed in git
 *   node scripts/smoke-pages.mjs --shard 1/4         # shard 1 of 4 (for CI parallelism)
 *   node scripts/smoke-pages.mjs --max 50 --concurrency 12
 *
 * Exit code 1 if any page has a JavaScript error; 0 otherwise.
 */
import { readFile } from "node:fs/promises";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import puppeteer from "puppeteer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const filter = opt("--filter", "");
const maxN = Number(opt("--max", "0")) || 0;
const concurrency = Number(opt("--concurrency", "8")) || 8;
const shardSpec = opt("--shard", "");

// --- 1. Enumerate concept ids from the graph -------------------------------------------------------
const graph = JSON.parse(await readFile(join(ROOT, "dist/graph.json"), "utf8"));
let ids = graph.concepts.map((c) => c.id).filter((id) => id && id !== "root");

if (has("--changed")) {
  const out = execSync("git status --porcelain -- concepts", { cwd: ROOT }).toString();
  const changed = new Set();
  for (const line of out.split("\n")) {
    const m = line.trim().match(/concepts\/(.+)\.html$/);
    if (m) changed.add(m[1]);
  }
  ids = ids.filter((id) => changed.has(id));
}
if (filter) ids = ids.filter((id) => id.includes(filter));
if (shardSpec) {
  const [i, n] = shardSpec.split("/").map(Number);
  ids = ids.filter((_, idx) => idx % n === i - 1);
}
if (maxN) ids = ids.slice(0, maxN);

if (ids.length === 0) {
  console.log("No pages match the given filters — nothing to check.");
  process.exit(0);
}

// --- 2. Ensure a server (reuse :8080 if it's already up; never kill someone else's) ----------------
const isUp = async (base) => {
  try {
    const r = await fetch(`${base}/js/boot.js`, { method: "HEAD" });
    return r.ok || r.status === 405 || r.status === 200;
  } catch {
    return false;
  }
};

let base = "http://localhost:8080";
let ownServer = null;
if (!(await isUp(base))) {
  const port = 8100 + Math.floor(Math.random() * 800);
  base = `http://localhost:${port}`;
  ownServer = spawn(process.execPath, [join(ROOT, "scripts/serve.js"), String(port)], {
    cwd: ROOT,
    stdio: "ignore",
  });
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    await sleep(100);
    ready = await isUp(base);
  }
  if (!ready) {
    console.error("Could not start scripts/serve.js for the smoke test.");
    ownServer.kill();
    process.exit(2);
  }
}

// --- 3. Visit each page in a pool of tabs ----------------------------------------------------------
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const queue = ids.slice();
const failures = []; // { id, errors: [{source, message}] }
const slow = []; // ids that timed out loading (reported separately, not a JS-error failure)
let done = 0;

/** Load one page, collect any JS errors. */
async function checkPage(page, id) {
  const url = `${base}/concepts/${id}.html`;
  const pageErrs = [];
  const onPageError = (err) => pageErrs.push(err.message);
  page.on("pageerror", onPageError);

  let timedOut = false;
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });
  } catch {
    timedOut = true; // slow/never-idle page; still read the error bucket below
  }
  await sleep(400); // let async scene/chart builders finish after their imports resolve

  let reported = [];
  try {
    reported = await page.evaluate(
      () => (window.__primerErrors || []).map((e) => ({ source: e.source, message: e.message })),
    );
  } catch {
    /* page context gone */
  }
  page.off("pageerror", onPageError);

  const errs = [...reported, ...pageErrs.map((m) => ({ source: "pageerror", message: m }))];
  const seen = new Set();
  const uniq = errs.filter((e) => {
    const k = `${e.source}|${e.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (uniq.length) failures.push({ id, errors: uniq });
  else if (timedOut) slow.push(id);

  done++;
  process.stdout.write(`\r  ${done}/${ids.length} checked · ${failures.length} broken   `);
}

async function worker() {
  const page = await browser.newPage();
  while (queue.length) {
    const id = queue.shift();
    await checkPage(page, id);
  }
  await page.close();
}

console.log(`Smoke-testing ${ids.length} page(s) at ${base} with ${concurrency} tab(s)…`);
await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
process.stdout.write("\n");

await browser.close();
if (ownServer) ownServer.kill();

// --- 4. Report -------------------------------------------------------------------------------------
if (slow.length) {
  console.warn(`\n⚠ ${slow.length} page(s) did not reach network-idle within 25s (no JS error detected):`);
  for (const id of slow.slice(0, 20)) console.warn(`    ${id}`);
  if (slow.length > 20) console.warn(`    …and ${slow.length - 20} more`);
}

if (failures.length) {
  console.error(`\n✖ ${failures.length} page(s) with JavaScript errors:\n`);
  for (const f of failures.sort((a, b) => a.id.localeCompare(b.id))) {
    console.error(`  ${f.id}`);
    for (const e of f.errors) console.error(`      [${e.source}] ${e.message}`);
  }
  process.exit(1);
}

console.log(`\n✔ All ${ids.length} page(s) rendered with no JavaScript errors.`);
process.exit(0);
