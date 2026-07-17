// scripts/build.mjs — the framework build. Bundles js/ + its npm deps into content-hashed,
// code-split ES modules under /dist/bundle/, emits the static CSS/font/wasm assets they need
// under /dist/assets/, and stamps the core bundle's hashed URL into the generated js/boot.js.
// Deps come from node_modules (this REPLACES scripts/vendor.mjs + the committed /3rdparty/).
//
//   npm run build            production (hashed, minified)
//   node scripts/build.mjs --dev   dev (unhashed names, unminified, easy reloads)
//
// `npm run build` chains `node scripts/build-graph.js` for dist/graph.json + precache.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = (...p) => path.join(ROOT, ...p);
const nm = (...p) => path.join(ROOT, "node_modules", ...p);
const DEV = process.argv.includes("--dev");

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
const copyDir = (fromDir, toDir, filter = () => true) => {
  fs.mkdirSync(toDir, { recursive: true });
  for (const f of fs.readdirSync(fromDir)) {
    const src = path.join(fromDir, f);
    if (fs.statSync(src).isDirectory() || !filter(f)) continue;
    copy(src, path.join(toDir, f));
  }
};
const walkFiles = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
};
const walkJs = (dir, out = []) => walkFiles(dir).filter((p) => p.endsWith(".js"));

// Stub bare Node built-ins to empty modules for browser bundling (carried over from vendor.mjs);
// warn so a runtime path that actually needs one is caught.
const stubNode = {
  name: "stub-node-builtins",
  setup(build) {
    const re = /^(node:)?(buffer|path|fs|os|util|stream|crypto|events|url|assert|module|worker_threads|child_process|tty|net|http|https|zlib|process|vm|perf_hooks)$/;
    build.onResolve({ filter: re }, (a) => {
      console.warn("    ⚠ stubbed node builtin:", a.path);
      return { path: a.path, namespace: "stub" };
    });
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {};" }));
  },
};

fs.rmSync(r("dist/bundle"), { recursive: true, force: true });
fs.rmSync(r("dist/assets"), { recursive: true, force: true });

// ── 1) Bundle the framework (core + lazy chunks) ──────────────────────────────────────────────────
const result = await esbuild.build({
  entryPoints: { primer: r("src/entry.ts"), app: r("src/app.ts") }, // → dist/bundle/{primer,app}-<hash>.js
  outdir: r("dist/bundle"),
  bundle: true,
  format: "esm",
  splitting: true, // lazy import()s → separate hashed chunks
  minify: !DEV,
  entryNames: DEV ? "[name]" : "[name]-[hash]",
  chunkNames: DEV ? "chunks/[name]" : "chunks/[name]-[hash]",
  assetNames: DEV ? "assets/[name]" : "assets/[name]-[hash]",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  logLevel: "info",
  metafile: true,
  loader: { ".wasm": "file", ".ttf": "file", ".woff": "file", ".woff2": "file" },
  plugins: [stubNode],
});

// Find the core entry output (the one whose entryPoint is js/entry.js).
const outputs = result.metafile.outputs;
let coreFile = null;
let appFile = null;
for (const [file, meta] of Object.entries(outputs)) {
  const ep = meta.entryPoint && meta.entryPoint.replace(/\\/g, "/");
  if (ep && ep.endsWith("src/entry.ts")) coreFile = "/" + path.relative(ROOT, r(file)).replace(/\\/g, "/");
  if (ep && ep.endsWith("src/app.ts")) appFile = "/" + path.relative(ROOT, r(file)).replace(/\\/g, "/");
}
if (!coreFile) throw new Error("build: could not find core entry output in metafile");
if (!appFile) throw new Error("build: could not find app entry output in metafile");

// ── 2) QuickJS wasm: the @jitl wasmfile variant loads it at runtime via
//    `new URL("emscripten-module.wasm", import.meta.url)` (no leading "./", so esbuild doesn't
//    auto-emit it). import.meta.url is the emscripten chunk's own URL (in dist/bundle/chunks/),
//    so drop the .wasm alongside the chunks with the exact name the variant asks for. ──────────────
copy(
  nm("@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm"),
  r("dist/bundle/chunks/emscripten-module.wasm"),
);

// ── 3) Static CSS / font / manim assets → /dist/assets/ (stable, unhashed paths the framework
//    references directly: boot.js, jsx-board.js, theme.js, mathfield.js). ──────────────────────────
const A = (...p) => r("dist/assets", ...p);
fs.mkdirSync(A(), { recursive: true });

// KaTeX: stylesheet + its glyph fonts (the CSS uses url(fonts/KaTeX_*) → dist/assets/fonts/).
copy(nm("katex/dist/katex.min.css"), A("katex.min.css"));
copyDir(nm("katex/dist/fonts"), A("fonts"));
// JSXGraph stylesheet (adopted into each <primer-chart> shadow root).
copy(nm("jsxgraph/distrib/jsxgraph.css"), A("jsxgraph.css"));
// MathLive glyph fonts (MFE.fontsDirectory = /dist/assets/mathlive-fonts).
copyDir(nm("mathlive/fonts"), A("mathlive-fonts"));

// Self-hosted reading/display fonts (Fontsource) → dist/assets/<slug>/ + a generated <name>.css.
function fontCss(pkg, family, faces, slug, outName) {
  fs.mkdirSync(A(slug), { recursive: true });
  const files = nm(pkg, "files");
  let css = "";
  for (const { w, style } of faces) {
    const base = `${slug}-latin-${w}-${style}`;
    for (const ext of ["woff2", "woff"]) {
      const f = `${base}.${ext}`;
      if (fs.existsSync(path.join(files, f))) copy(path.join(files, f), A(slug, f));
    }
    css +=
      `@font-face{font-family:'${family}';font-style:${style};font-weight:${w};font-display:swap;` +
      `src:url(/dist/assets/${slug}/${base}.woff2) format('woff2'),url(/dist/assets/${slug}/${base}.woff) format('woff');}\n`;
  }
  fs.writeFileSync(A(outName), css);
}
// boot.js → /dist/assets/stix.css ; theme.js → /dist/assets/fredoka.css
fontCss("@fontsource/stix-two-text", "STIX Two Text",
  [{ w: 400, style: "normal" }, { w: 500, style: "normal" }, { w: 600, style: "normal" }, { w: 700, style: "normal" }, { w: 400, style: "italic" }, { w: 600, style: "italic" }],
  "stix-two-text", "stix.css");
fontCss("@fontsource/fredoka", "Fredoka",
  [{ w: 500, style: "normal" }, { w: 600, style: "normal" }, { w: 700, style: "normal" }],
  "fredoka", "fredoka.css");

// manim-web's runtime sub-resources: MathJax v3 es5 (script-injected global) + gif.js worker
// (separate thread). Both are npm deps; emit them as assets and repoint manim's hardcoded CDN
// URLs at them (below). Also repoint the katex.min.css URL manim injects.
copy(nm("mathjax/es5/tex-svg-full.js"), A("manim", "mathjax-tex-svg-full.js"));
copy(nm("gif.js/dist/gif.worker.js"), A("manim", "gif.worker.js"));

// ── 4) Repoint manim's hardcoded CDN URLs (string literals inside its lazy chunk) at the local
//    assets. Post-hash rewrite is fine — the hash is a cache key, not an integrity check. ──────────
const urlMap = {
  "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js": "/dist/assets/manim/mathjax-tex-svg-full.js",
  "https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js": "/dist/assets/manim/gif.worker.js",
};
let rewrites = 0;
for (const file of walkJs(r("dist/bundle"))) {
  let code = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const [from, to] of Object.entries(urlMap)) {
    if (code.includes(from)) { code = code.split(from).join(to); rewrites++; changed = true; }
  }
  const katexCss = /https:\/\/cdn\.jsdelivr\.net\/npm\/katex@[\d.]+\/dist\/katex\.min\.css/g;
  if (katexCss.test(code)) { code = code.replace(katexCss, "/dist/assets/katex.min.css"); rewrites++; changed = true; }
  if (changed) fs.writeFileSync(file, code);
}

// ── 5) Generate the classic (non-module) browser scripts from their TypeScript sources: the
//    stable-URL loaders js/boot.js (hashed core-bundle URL stamped in) + js/analytics.js, and the
//    root service worker sw.js. These are plain transpiles (type strip, no bundling — none of the
//    three imports anything); js/ and sw.js are generated-only and gitignored. ───────────────────
const transpile = async (srcRel) => {
  const code = fs.readFileSync(r(srcRel), "utf8");
  return (await esbuild.transform(code, { loader: "ts", target: "es2022" })).code;
};
fs.mkdirSync(r("js"), { recursive: true });
const bootJs = await transpile("src/boot.ts");
if (!bootJs.includes("__PRIMER_BUNDLE__")) throw new Error("build: src/boot.ts is missing the __PRIMER_BUNDLE__ placeholder");
fs.writeFileSync(r("js/boot.js"), bootJs.split("__PRIMER_BUNDLE__").join(coreFile));
fs.writeFileSync(r("js/analytics.js"), await transpile("src/analytics.ts"));
fs.writeFileSync(r("sw.js"), await transpile("src/sw.ts"));

// ── 6) Asset manifest (logical name → hashed URL) for tooling / the service worker. ───────────────
fs.writeFileSync(
  r("dist/asset-manifest.json"),
  JSON.stringify({ primer: coreFile, app: appFile, generated: "npm run build" }, null, 2),
);

// ── 7) Precache manifest for the service worker (Phase 2 offline). The EAGER app shell = everything
//    a normal page visit already downloads: boot.js, the hashed core bundle, the reading CSS, and the
//    light CSS/font assets (KaTeX/STIX/JSXGraph/Fredoka). The heavy on-demand libraries (manim's
//    MathJax, MathLive fonts) and the lazy JS chunks are NOT shell — they're cached lazily as pages
//    use them, or by a course download. `version` (the core hash) lets the SW name/rotate its cache. ─
const assetShell = [];
for (const f of walkFiles(r("dist/assets"))) {
  const rel = path.relative(r("dist/assets"), f).replace(/\\/g, "/");
  if (rel.startsWith("manim/") || rel.startsWith("mathlive-fonts/")) continue; // heavy / on-demand only
  if (rel.endsWith(".ttf") || rel.endsWith(".woff")) continue; // woff2 covers every modern browser
  assetShell.push("/dist/assets/" + rel);
}
const version = (coreFile.match(/primer-([^.]+)\.js$/) || [, "dev"])[1];
const shell = [
  "/js/boot.js",
  coreFile,
  appFile,
  "/dist/asset-manifest.json",
  "/js/analytics.js",
  "/css/primer.css",
  ...assetShell.sort(),
  "/offline.html",
  "/site.webmanifest",
  "/images/icons/favicon.ico",
  "/images/icons/favicon-32x32.png",
  "/images/icons/favicon-16x16.png",
  "/images/icons/apple-touch-icon.png",
];
// `libs` = the heavy, on-demand parts NOT in the eager shell: every lazy JS chunk (manim, QuickJS,
// MathLive, sucrase, compute-engine) plus manim's MathJax/gif worker and the MathLive glyph fonts.
// A course download caches these so its interactive widgets (charts already work via the core;
// runnable code, manim, mathfields) function fully offline. All are content-hashed / stable.
const shellSet = new Set(shell);
const libs = [];
for (const f of jsOutputsForLibs()) {
  const u = "/" + path.relative(ROOT, f).replace(/\\/g, "/"); // f is already an absolute path
  if (u !== coreFile) libs.push(u); // every chunk except the core (already shell)
}
for (const f of walkFiles(r("dist/assets/manim"))) libs.push("/dist/assets/manim/" + path.basename(f));
for (const f of walkFiles(r("dist/assets/mathlive-fonts"))) {
  const u = "/dist/assets/mathlive-fonts/" + path.basename(f);
  if (u.endsWith(".woff2") || u.endsWith(".woff")) libs.push(u);
}
fs.writeFileSync(
  r("dist/precache.json"),
  JSON.stringify({ version, generated: "npm run build", shell, libs: libs.filter((u) => !shellSet.has(u)) }, null, 2),
);
function jsOutputsForLibs() {
  return walkJs(r("dist/bundle"));
}

const jsOutputs = Object.keys(outputs).filter((f) => f.endsWith(".js"));
console.log(`\n✓ core bundle: ${coreFile}`);
console.log(`  ${jsOutputs.length} JS output(s) (core + lazy chunks); manim URL rewrites: ${rewrites}`);
console.log(`  boot.js generated → /js/boot.js`);
for (const f of jsOutputs.sort()) {
  console.log(`   · /${path.relative(ROOT, r(f)).replace(/\\/g, "/")}  (${(outputs[f].bytes / 1024).toFixed(0)} KB)`);
}
