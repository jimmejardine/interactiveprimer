/**
 * entry.ts — the single esbuild bundle entry for the framework (concept pages).
 *
 * It exists so the built `/dist/bundle/primer-<hash>.js` does BOTH jobs the old
 * two-file (boot.js → render.js + import-map "primer") split did:
 *
 *   1. Re-export the page-scripting API (`export * from "./primer.ts"`) so a concept
 *      page's inline scene `<script type="module">import { registerGeometryScene }
 *      from "primer"</script>` resolves against the bundle (via the import map that
 *      the generated dist/boot.js injects).
 *   2. Import `./render.ts` for its side effect (it registers the custom elements and
 *      mounts the page shell on load), so `import(PRIMER_BUNDLE)` in boot.js boots
 *      the page.
 *
 * The heavy, rarely used libraries stay behind dynamic `import()` in their lazy
 * loaders, so esbuild emits them as separate hash-named chunks loaded on demand.
 * @module
 */

export * from "./primer.ts";
import "./render.ts";
