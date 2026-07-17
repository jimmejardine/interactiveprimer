// @ts-check
/**
 * entry.js — the single esbuild bundle entry for the framework.
 *
 * It exists so the built `/dist/primer.<hash>.js` does BOTH jobs the old two-file
 * (boot.js → render.js + import-map "primer") split did:
 *
 *   1. Re-export the page-scripting API (`export * from "./primer.js"`) so a concept
 *      page's inline scene `<script type="module">import { registerGeometryScene }
 *      from "primer"</script>` resolves against the bundle.
 *   2. Import `./render.js` for its side effect (it registers the custom elements via
 *      "primer" and mounts the page shell on load), so `import("primer")` in boot.js
 *      boots the page.
 *
 * esbuild is configured with an alias `primer → js/primer.js`, so render.js's own
 * `import "primer"` collapses into this same bundle (one singleton). The heavy, rarely
 * used libraries stay behind dynamic `import()` in their lazy loaders, so esbuild emits
 * them as separate hash-named chunks loaded on demand.
 * @module
 */

export * from "./primer.js";
import "./render.js";
