# docs/ — contributor documentation

- **`authoring-reference.md`** — the deep authoring reference for concept pages: the rarely-used
  elements (manim, 3-D charts, geometry problems, program exercises, video, courses), the geometry
  toolkit, localization contract, and the accessibility checklist. `/CLAUDE.md` is the lean core;
  this is the long tail it links to.
- **`deploy.md`** — how interactiveprimer.com deploys: the site now requires `npm ci && npm run
  build` (the repo is source-only; `dist/` and `sw.js` are build outputs), so deploys go
  through CI — Cloudflare Pages (intended) or GitHub Pages via an Actions build. Includes the
  do-not-serve-`main`-verbatim warning, DNS, and the SEO notes.
- **`import-map.md`** — the per-page toolchain: how the one `<script src="/dist/boot.js">` tag (a
  generated classic script with the bundle hash stamped in) injects the one-entry import map
  (`primer` → the hashed core bundle), boots the framework, and how the core/lazy/app bundles are
  split.
