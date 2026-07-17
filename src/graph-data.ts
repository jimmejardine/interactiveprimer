/**
 * Browser-side loader for the emitted knowledge graph (`dist/graph.json`). Fetches and
 * indexes it once per page, caching the promise on `window` so every component that
 * needs it (the pathway map, a concept's level badge, …) shares a single request.
 *
 * Run `npm run graph` after adding or editing concepts so this reflects the tree.
 * @module
 */

import { indexConcepts } from "./graph.ts";
import type { ResolvedConcept } from "./types/domain.ts";

/**
 * Load + index the graph once for the whole page. Rejects on any fetch/parse problem.
 */
export function loadGraph(): Promise<{ raw: any, byId: Map<string, ResolvedConcept> }> {
  const w = window as any;
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
