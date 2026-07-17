# The per-page toolchain (one include)

Every concept page is a plain `.html` file — **content needs no build step** (edit → refresh). The
*framework* it loads, however, is built: TypeScript in `src/` is bundled by esbuild
(`scripts/build.mjs`) into content-hashed, code-split ES modules under `/dist/bundle/`. This page
explains how one script tag connects the two.

## The one tag

A page has **no `<head>` at all**: just its content cards, the inline `concept-meta` JSON, and

```html
<script src="/js/boot.js"></script>
```

first in the `<body>`. `/js/boot.js` is a small **generated** classic script (from
[`src/boot.ts`](../src/boot.ts); never edit the output) with a stable URL, so pages never change
when the framework does. Being a classic, render-blocking script placed first, it can do
synchronous pre-paint work and guarantee ordering:

1. **Pre-paint state** — sets `data-theme` and `<html lang>` synchronously (saved choice / OS
   preference / `?lang=`), so there is no flash of the wrong theme or language; installs the
   `window.__primerErrors` bucket the smoke harness reads; anti-FOUC reveal gating.
2. **Head injection** — viewport, icons/PWA meta, the reading font, `css/primer.css`, KaTeX's CSS
   (from `/dist/assets/`), and the analytics loader.
3. **The import map** — a single entry resolving the bare specifier inline scene scripts use:

   ```json
   { "imports": { "primer": "/dist/bundle/primer-<hash>.js" } }
   ```

   The hash is **stamped into boot.js at build time** (esbuild's metafile → a placeholder
   replacement), so the map always points at the current immutable bundle. Because boot.js runs
   before any content is parsed, the map exists before any `import … from "primer"` resolves.
4. **Boot** — `import()`s the hashed bundle directly (not via the map, so it can't race it). The
   bundle self-boots: it registers every custom element and mounts the page shell.
5. **Offline** — registers the service worker (`/sw.js`, generated from `src/sw.ts`) after `load`.

## The bundle architecture

- **Core bundle** `primer-<hash>.js` — the renderer, all components, KaTeX, JSXGraph; everything a
  typical page needs, in one request.
- **Lazy chunks** — the heavy, rarely-used libraries stay behind dynamic `import()` boundaries in
  their loaders, so esbuild emits them as separate hashed chunks fetched on first use: manim(+
  MathJax), QuickJS-WASM (runnable code), MathLive (math input), sucrase (TS transpile),
  compute-engine (symbolic grading).
- **App bundle** `app-<hash>.js` — for the standalone pages (index / concepts / progress /
  offline), which have their own `<head>` and import it via `dist/asset-manifest.json` instead of
  using boot.js.
- Content-hashed names make every bundle immutable/cache-forever; a deploy changes the hashes and
  boot.js's stamped URL, which is the whole cache-busting story (the service worker piggybacks on
  it).

Inside a page, an inline scene script therefore just writes:

```html
<script type="module">
  import { registerGeometryScene } from "primer";
  registerGeometryScene("myFigure", ({ board, colors, step }) => { /* … */ });
</script>
```

`src/types/primer.d.ts` declares the `"primer"` module ambiently so IDEs type these inline blocks.

## Notes

- **Authoring** is documented in [`/CLAUDE.md`](../CLAUDE.md) (lean core) and
  [`authoring-reference.md`](authoring-reference.md) (full API) — not here. Note the modern page
  skeleton: no authored `id`/`title` in `concept-meta` (path + `<primer-title>` carry them), and
  machinery sits after `</html>`.
- **Dependency versions** are pinned in `package.json` and resolved from `node_modules` at build
  time — no CDN at runtime, the site is fully self-contained (and offline-capable).
- **Why boot.js survives the bundler**: a bundled `type=module` script can neither run before first
  paint (theme/locale would flash) nor inject an import map synchronously. The classic-script
  loader is irreducible — so it's kept tiny, generated, and revalidate-always while everything else
  is hashed and immutable.
