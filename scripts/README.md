# scripts/ — repo tooling (Node, run from the repo root)

Plain-JS Node scripts (they import framework modules straight from `src/*.ts` — Node 24 strips the
types at load):

- **`build.mjs`** — THE framework build (`npm run build` / `--dev`): esbuild-bundles `src/` into
  hashed, code-split `dist/bundle/` chunks, emits static CSS/font/wasm assets to `dist/assets/`,
  generates the classic scripts (`js/boot.js` with the bundle hash stamped in, `js/analytics.js`,
  `sw.js`), and writes `dist/asset-manifest.json` + `dist/precache.json` for the service worker.
- **`build-graph.js`** — scans `concepts/**` into the knowledge graph: validates ids/edges/levels,
  writes `dist/graph.json`, `sitemap.xml`, `robots.txt` (`npm run graph`, `--check`, `--stale`).
- **`i18n-check.js`** — the two-layer translation gate: content overlays (`i18n/`) and UI catalogs
  (`src/i18n/`) against their source hashes (`npm run i18n:check`, bless via `i18n:bless`).
- **`serve.js`** — the tiny static dev server on :8080 (`npm run serve`; reuse it, don't spawn a
  second).
- **`smoke-pages.mjs`** — headless Chromium sweep of every concept page, failing on any collected
  JS error (`npm run test:pages`; `--filter`, `--changed`, `--shard i/n`, `--dev`).
- **`trim-png.js`** — crops whitespace off PNGs (`npm run trim:png`).
- **`creator-videos/`** — the YouTube explainer-video matching pipeline (own README).
