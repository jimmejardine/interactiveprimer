// scripts/vendor.mjs — vendor all runtime third-party assets into /3rdparty/ for OFFLINE use.
// Uniform methodology: npm is the single source of truth (node_modules); esbuild bundles all JS;
// CSS / fonts / WASM are copied. NO network (beyond `npm install`). Re-runnable: `npm run vendor`.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "3rdparty");
const NM = path.join(ROOT, "node_modules");
const nm = (...p) => path.join(NM, ...p);
const out = (...p) => path.join(OUT, ...p);
const version = (pkg) => JSON.parse(fs.readFileSync(nm(pkg, "package.json"), "utf8")).version;

const manifest = {};
function record(rel) {
  const buf = fs.readFileSync(out(rel));
  // Normalize separators so regenerating on Windows/mac/linux produces identical manifest keys.
  manifest[rel.split(path.sep).join("/")] = "sha256:" + crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}
function copy(from, toRel) {
  fs.mkdirSync(path.dirname(out(toRel)), { recursive: true });
  fs.copyFileSync(from, out(toRel));
  record(toRel);
  console.log("  · copy", toRel);
}
function copyDir(fromDir, toRelDir, filter = () => true) {
  for (const f of fs.readdirSync(fromDir)) if (filter(f)) copy(path.join(fromDir, f), path.join(toRelDir, f));
}

// Stub bare Node built-ins to empty modules for browser bundling; warn so the offline test can catch
// any that turn out to be used at runtime (none are expected on the browser code paths).
const stubNode = {
  name: "stub-node-builtins",
  setup(build) {
    const re = /^(node:)?(buffer|path|fs|os|util|stream|crypto|events|url|assert|module|worker_threads|child_process|tty|net|http|https|zlib|process|vm|perf_hooks)$/;
    build.onResolve({ filter: re }, (a) => { console.warn("    ⚠ stubbed node builtin:", a.path); return { path: a.path, namespace: "stub" }; });
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {};" }));
  },
};
async function bundle(entryAbs, toRel) {
  await esbuild.build({
    entryPoints: [entryAbs], outfile: out(toRel), bundle: true, format: "esm", minify: true,
    platform: "browser", legalComments: "none", logLevel: "warning", plugins: [stubNode],
  });
  record(toRel);
  console.log("  ✓ bundle", toRel, `(${(fs.statSync(out(toRel)).size / 1024).toFixed(0)} KB)`);
}

// ── run ─────────────────────────────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

console.log("esbuild JS bundles (from node_modules):");
await bundle(nm("katex/dist/katex.mjs"), "katex/katex.mjs");
await bundle(nm("jsxgraph/distrib/jsxgraphcore.mjs"), "jsxgraph/jsxgraphcore.mjs");
await bundle(nm("json5/dist/index.mjs"), "json5/index.min.mjs");
await bundle(nm("manim-web/dist/index.js"), "manim-web/manim-web.browser.js");
await bundle(nm("mathlive/mathlive.min.mjs"), "mathlive/mathlive.min.mjs");
await bundle(nm("sucrase/dist/esm/index.js"), "sucrase/sucrase.mjs");
await bundle(nm("quickjs-emscripten-core/dist/index.mjs"), "quickjs/core.mjs");
await bundle(nm("@cortex-js/compute-engine/dist/esm-min/compute-engine.js"), "compute-engine/compute-engine.mjs");
// The QuickJS singlefile variant is a WASM asset (an embedded emscripten module reached via lazy
// import()) — esbuild-bundling that graph drops the embedding, so copy its dist .mjs files verbatim
// (relative imports stay intact). VARIANT entry → quickjs/singlefile/index.mjs (see js/quickjs.js).
console.log("copy quickjs singlefile variant (WASM asset):");
copyDir(nm("@jitl/quickjs-singlefile-browser-release-sync/dist"), "quickjs/singlefile", (f) => f.endsWith(".mjs"));

console.log("copy CSS + font assets:");
copy(nm("katex/dist/katex.min.css"), "katex/katex.min.css");
copyDir(nm("katex/dist/fonts"), "katex/fonts");
copy(nm("jsxgraph/distrib/jsxgraph.css"), "jsxgraph/jsxgraph.css");
copyDir(nm("mathlive/fonts"), "mathlive/fonts");

console.log("self-hosted fonts (Fontsource):");
function fontCss(pkg, family, faces, slug) {
  const files = nm(pkg, "files");
  let css = "";
  for (const { w, style } of faces) {
    const base = `${slug}-latin-${w}-${style}`;
    for (const ext of ["woff2", "woff"]) {
      const f = `${base}.${ext}`;
      if (fs.existsSync(path.join(files, f))) copy(path.join(files, f), `fonts/${slug}/${f}`);
    }
    css +=
      `@font-face{font-family:'${family}';font-style:${style};font-weight:${w};font-display:swap;` +
      `src:url(/3rdparty/fonts/${slug}/${base}.woff2) format('woff2'),url(/3rdparty/fonts/${slug}/${base}.woff) format('woff');}\n`;
  }
  fs.writeFileSync(out(`fonts/${pkg.split("/").pop()}.css`), css);
  record(`fonts/${pkg.split("/").pop()}.css`);
  console.log("  ✓", `fonts/${pkg.split("/").pop()}.css`);
}
// boot.js → /3rdparty/fonts/stix.css ; theme.js → /3rdparty/fonts/fredoka.css
fontCss("@fontsource/stix-two-text", "STIX Two Text",
  [{ w: 400, style: "normal" }, { w: 500, style: "normal" }, { w: 600, style: "normal" }, { w: 700, style: "normal" }, { w: 400, style: "italic" }, { w: 600, style: "italic" }], "stix-two-text");
fontCss("@fontsource/fredoka", "Fredoka",
  [{ w: 500, style: "normal" }, { w: 600, style: "normal" }, { w: 700, style: "normal" }], "fredoka");
// rename outputs to the names boot.js/theme.js expect
fs.renameSync(out("fonts/stix-two-text.css"), out("fonts/stix.css"));

console.log("manim internal resources (MathJax / gif worker) + rewrite:");
copy(nm("mathjax/es5/tex-svg-full.js"), "manim-web/lib/mathjax_3_es5_tex-svg-full.js");
copy(nm("gif.js/dist/gif.worker.js"), "manim-web/lib/gif.js_0.2.0_dist_gif.worker.js");
{
  const f = out("manim-web/manim-web.browser.js");
  let code = fs.readFileSync(f, "utf8");
  const map = {
    "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js": "/3rdparty/manim-web/lib/mathjax_3_es5_tex-svg-full.js",
    "https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js": "/3rdparty/manim-web/lib/gif.js_0.2.0_dist_gif.worker.js",
  };
  let n = 0;
  for (const [u, local] of Object.entries(map)) if (code.includes(u)) { code = code.split(u).join(local); n++; }
  // any katex@x/dist/katex.min.css → our vendored katex
  code = code.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/katex@[\d.]+\/dist\/katex\.min\.css/g, () => { n++; return "/3rdparty/katex/katex.min.css"; });
  fs.writeFileSync(f, code);
  record("manim-web/manim-web.browser.js");
  console.log(`  ✓ rewrote ${n} manim url(s)`);
}

// ── manifest (provenance) ────────────────────────────────────────────────────────────────────────
const versions = Object.fromEntries(
  ["katex", "jsxgraph", "json5", "manim-web", "mathlive", "sucrase", "quickjs-emscripten-core",
    "@jitl/quickjs-singlefile-browser-release-sync", "@cortex-js/compute-engine", "mathjax", "gif.js",
    "@fontsource/stix-two-text", "@fontsource/fredoka"].map((p) => [p, version(p)]),
);
fs.writeFileSync(out("VENDORED.json"), JSON.stringify({ generated: "run npm run vendor", versions, files: manifest }, null, 2));
console.log("\nDone → /3rdparty/  (" + Object.keys(manifest).length + " files)");
