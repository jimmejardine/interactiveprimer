# docs/ — contributor documentation

- **`authoring-reference.md`** — the deep authoring reference for concept pages: the rarely-used
  elements (manim, 3-D charts, geometry problems, program exercises, video, courses), the geometry
  toolkit, localization contract, and the accessibility checklist. `/CLAUDE.md` is the lean core;
  this is the long tail it links to.
- **`deploy.md`** — ⚠ STALE: describes the original no-build GitHub Pages deploy. The site now has
  a framework build (`npm run build` → `dist/` + generated `js/` + `sw.js`) and is intended to be
  built in CI (Cloudflare Pages, `npm ci && npm run build`). Needs rewriting before the next
  deploy-process change.
- **`import-map.md`** — ⚠ STALE: describes the pre-build per-page import-map toolchain (multiple
  bare specifiers → vendored `/3rdparty/`). Since the esbuild build step, boot.js injects a
  one-entry map (`primer` → the hashed bundle). Kept for history; the current architecture is
  described in the root README and `src/README.md`.
