// @ts-check
/**
 * Browser-side loader for the emitted knowledge graph (`dist/graph.json`). Fetches and
 * indexes it once per page, caching the promise on `window` so every component that
 * needs it (the pathway map, a concept's level badge, …) shares a single request.
 *
 * Run `npm run graph` after adding or editing concepts so this reflects the tree.
 * @module
 */

import { indexConcepts } from "./graph.js";

/** @typedef {import("./types/domain.js").ResolvedConcept} ResolvedConcept */

/**
 * Load + index the graph once for the whole page. Rejects on any fetch/parse problem.
 * @returns {Promise<{ raw: any, byId: Map<string, ResolvedConcept> }>}
 */
export function loadGraph() {
  const w = /** @type {any} */ (window);
  if (!w.__primerGraphPromise) {
    w.__primerGraphPromise = fetch("/dist/graph.json")
      .then((r) => {
        if (!r.ok) throw new Error(`graph.json HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => ({ raw, byId: indexConcepts(raw.concepts) }));
  }
  return w.__primerGraphPromise;
}
