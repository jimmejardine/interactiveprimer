/**
 * smoke-pages.mjs — load every concept page in headless Chromium and report JavaScript errors.
 *
 * Interactive widgets (`<primer-geometry>`, `<primer-chart>`, `<primer-quiz>`, `<primer-manim>`,
 * `<primer-program>`) catch builder errors and show them only inside the widget — so a broken page looks
 * fine to a naive console listener. js/report-error.js now records every such error (plus uncaught errors
 * and unhandled rejections) on `window.__primerErrors`; this script reads that after each page settles.
 *
 * The framework + its deps come from the built bundle under /dist (run `npm run build` first), so this
 * runs fully offline against the local server.
 *
 * Usage:
 *   node scripts/smoke-pages.mjs                     # every page (own private server, own asset cache)
 *   node scripts/smoke-pages.mjs --filter algebra    # only ids containing "algebra"
 *   node scripts/smoke-pages.mjs --changed           # only concept pages changed in git
 *   node scripts/smoke-pages.mjs --shard 1/4         # shard 1 of 4 (for CI parallelism)
 *   node scripts/smoke-pages.mjs --max 50 --concurrency 12
 *   node scripts/smoke-pages.mjs --dev               # run against the existing :8080 dev server (don't spawn)
 *   node scripts/smoke-pages.mjs --server http://localhost:3000
 *   node scripts/smoke-pages.mjs --dev --no-cache    # let EVERY request hit the dev server (debug what loads)
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
// Accept `-- --concurrency N` (canonical), or `--concurrency N` without `--` (npm exposes it as
// npm_config_concurrency), or `CONCURRENCY=N npm run test:pages`.
const concurrency =
  Number(opt("--concurrency", "") || process.env.npm_config_concurrency || process.env.CONCURRENCY || "16") ||
  16;
const shardSpec = opt("--shard", "");
// Run against an existing server instead of spawning a private one: `--dev` = http://localhost:8080.
const serverArg = opt("--server", "") || (has("--dev") ? "http://localhost:8080" : "");
const noCache = has("--no-cache"); // disable the in-harness asset cache (watch every request hit the server)

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

// --- 2. Server: use an existing one (--dev / --server) or spin up a private ephemeral one ----------
const isUp = async (b) => {
  try {
    const r = await fetch(`${b}/js/boot.js`, { method: "HEAD" });
    return r.ok || r.status === 405 || r.status === 200;
  } catch {
    return false;
  }
};

let base;
let server = null; // the process WE spawned (null when reusing an existing server — never kill that one)
if (serverArg) {
  base = serverArg.replace(/\/+$/, "");
  if (!(await isUp(base))) {
    console.error(`No server responding at ${base} — start it first (e.g. \`npm run serve\`).`);
    process.exit(2);
  }
  console.log(`Using the existing server at ${base} (not spawning or stopping it).`);
} else {
  // A PRIVATE static server on an ephemeral port — NOT the user's :8080 dev server, so the run neither
  // floods its logs nor is coupled to it. Torn down at the end.
  const port = 8100 + Math.floor(Math.random() * 800);
  base = `http://localhost:${port}`;
  server = spawn(process.execPath, [join(ROOT, "scripts/serve.js"), String(port)], { cwd: ROOT, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    await sleep(100);
    ready = await isUp(base);
  }
  if (!ready) {
    console.error("Could not start scripts/serve.js for the smoke test.");
    server.kill();
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
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
  } catch {
    timedOut = true; // page never fired `load`; still read the error bucket below
  }
  // Wait for the framework's own "done" signal (render.js dispatches `primer:rendered` via .finally, so it
  // fires even on a render error) — far more reliable than network-idle, which many fine pages never reach.
  await page
    .waitForFunction(() => window.__primerRendered === true, { timeout: 15000 })
    .catch(() => {
      timedOut = true; // render never signalled — genuinely stuck (reported as "slow", not a JS error)
    });
  await sleep(600); // let async scene/chart builders finish after their imports resolve, post-render

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

// serve.js sends `cache-control: no-cache`, so Chromium re-fetches every asset on EVERY navigation. Give the
// harness its own in-memory cache instead: the first time an asset is seen it's fetched from the server and
// stored; every later page (across all tabs — this Map is shared) is served from memory. We cache every
// NON-HTML asset (js, css, json, fonts, wasm, images, /site.webmanifest, favicon…); the concept HTML pages
// themselves are unique per navigation and always fetched fresh. `--no-cache` disables all of this.
const assetCache = new Map(); // absolute url -> { contentType, body: Buffer }
const isCacheable = (pathname) => !pathname.endsWith(".html");

async function worker() {
  const page = await browser.newPage();
  // Set a flag when the framework finishes rendering — injected before each page's own scripts (survives
  // every navigation on this tab), so `checkPage`'s waitForFunction can't miss the `primer:rendered` event.
  await page.evaluateOnNewDocument(() => {
    document.addEventListener("primer:rendered", () => {
      window.__primerRendered = true;
    }, { once: true });
  });
  if (!noCache) {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const hit = isCacheable(new URL(req.url()).pathname) && assetCache.get(req.url());
      if (hit) req.respond({ status: 200, contentType: hit.contentType, body: hit.body });
      else req.continue();
    });
    page.on("response", async (resp) => {
      const url = resp.url();
      if (resp.ok() && isCacheable(new URL(url).pathname) && !assetCache.has(url)) {
        try {
          const body = await resp.buffer();
          assetCache.set(url, { contentType: resp.headers()["content-type"] || "application/octet-stream", body });
        } catch {
          /* some responses (e.g. redirects) can't be buffered — skip caching them */
        }
      }
    });
  }
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
if (server) server.kill(); // only the private server we spawned — never an existing/dev server

// --- 4. Report -------------------------------------------------------------------------------------
if (slow.length) {
  console.warn(`\n⚠ ${slow.length} page(s) never fired 'primer:rendered' within 15s (no JS error detected):`);
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
