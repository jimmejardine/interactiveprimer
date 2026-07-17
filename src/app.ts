/**
 * app.ts — the bundle entry for the STANDALONE app-shell pages (index, concepts,
 * progress, offline). Built by scripts/build.mjs into `dist/bundle/app-<hash>.js`;
 * those pages fetch the hash from `dist/asset-manifest.json` and `import()` it (no
 * import map, no hard-coded hash).
 *
 * Unlike `entry.ts` (concept pages), this entry does NOT import render.ts — the
 * standalone pages own their own <head> and layout; they just need the framework's
 * components + a handful of app-shell modules (theme, i18n, the graph, the
 * tree/search/dashboard mounters, the offline manager). It re-exports the whole
 * `primer` barrel (which registers <primer-math> etc. — used by the tree map and
 * dashboards) plus the extras those pages need.
 * @module
 */

export * from "./primer.ts"; // components + authoring API (incl. initTheme, getLocale, t) — no render.ts
export { initLocale } from "./i18n.ts"; // the one i18n init not in the primer barrel
export { loadGraph } from "./graph-data.ts";
export { mountConceptSearch, mountCourseSearch, SEARCH_BOX_CSS } from "./concept-search-box.ts";
export { mountConceptGraph } from "./concept-graph.ts";
export { mountProgressDashboard } from "./progress-dashboard.ts";
export { runProgressMigration } from "./progress-migration.ts";
export { maybeShowWelcomeBack } from "./welcome-back.ts";
export * as offline from "./offline.ts";

import "./components/primer-menu.ts"; // the hamburger every app-shell page mounts
