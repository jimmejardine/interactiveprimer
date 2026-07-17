// @ts-check
/**
 * src/app.js — the bundle entry for the STANDALONE app-shell pages (index, concepts, progress,
 * offline). Built by scripts/build.mjs into `dist/bundle/app-<hash>.js`; those pages fetch the hash
 * from `dist/asset-manifest.json` and `import()` it (no import map, no hard-coded hash).
 *
 * Unlike `js/entry.js` (concept pages), this entry does NOT import render.js — the standalone pages
 * own their own <head> and layout; they just need the framework's components + a handful of app-shell
 * modules (theme, i18n, the graph, the tree/search/dashboard mounters, the offline manager). It
 * re-exports the whole `primer` barrel (which registers <primer-math> etc. — used by the tree map and
 * dashboards) plus the extras those pages import by raw path today. This is what lets us retire the
 * `/3rdparty/` import maps: every bare specifier (katex/json5/jsxgraph/primer) is resolved at build.
 */

export * from "../js/primer.js"; // components + authoring API (incl. initTheme, getLocale, t) — no render.js
export { initLocale } from "../js/i18n.js"; // the one i18n init not in the primer barrel
export { loadGraph } from "../js/graph-data.js";
export { mountConceptSearch, mountCourseSearch, SEARCH_BOX_CSS } from "../js/concept-search-box.js";
export { mountConceptGraph } from "../js/concept-graph.js";
export { mountProgressDashboard } from "../js/progress-dashboard.js";
export { runProgressMigration } from "../js/progress-migration.js";
export { maybeShowWelcomeBack } from "../js/welcome-back.js";
export * as offline from "../js/offline.js";

import "../js/components/primer-menu.js"; // the hamburger every app-shell page mounts
