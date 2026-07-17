# src/ — the framework (TypeScript source)

All framework code lives here, in strict TypeScript. `scripts/build.mjs` (esbuild) turns it into:

- `dist/bundle/primer-<hash>.js` — the concept-page bundle (entry `entry.ts`: the `primer` barrel
  + `render.ts`, which mounts the page shell), plus code-split lazy chunks for the heavy libraries
  (manim, QuickJS-WASM, MathLive, sucrase, compute-engine).
- `dist/bundle/app-<hash>.js` — the standalone-page bundle (entry `app.ts`; no renderer).
- Generated classic scripts at **stable URLs**: `dist/boot.js` (from `boot.ts`, bundle hash stamped
  in — the one tag every concept page includes), `dist/prepaint.js` (from `prepaint.ts` — the shared
  synchronous theme+locale set-up every standalone app-shell page includes in its `<head>`, so that
  boilerplate lives in ONE place), `dist/analytics.js` (from `analytics.ts`), and the service worker
  `sw.js` (from `sw.ts`). `dist/` and `sw.js` are gitignored build outputs.
- **Adding a locale** = edit `locales.ts` (the dependency-free single source of the supported-locale
  set: id + label) and add its catalog in `i18n/` (+ wire it into `i18n.ts`'s `CATALOGS`). The build
  stamps `locales.ts`'s id list into boot.js/prepaint.js's `SUPPORTED` — no hardcoded arrays to chase.

Conventions:

- **Internal imports use explicit `.ts` extensions** — the one specifier that resolves identically
  under tsc (`allowImportingTsExtensions`), esbuild, and plain Node's type stripping (Node runs the
  tests and the graph/i18n scripts directly on these sources).
- **Erasable syntax only** (enforced by `erasableSyntaxOnly`): no `enum`, `namespace`, or parameter
  properties — Node strips types, it doesn't compile.
- `primer.ts` is the public barrel that concept-page inline scripts import as `"primer"` (via the
  import map boot.js injects); keep `types/primer.d.ts` in sync with its export list.
- Subfolders: `components/` (custom elements), `geometry-engine/` (theorem engine), `i18n/` (UI
  string catalogs), `types/` (shared types). Everything else is flat single-purpose modules.

Verify with `npm run typecheck`, `npm test`, `npm run build`; `npm run test:pages` smoke-loads real
pages headlessly.
