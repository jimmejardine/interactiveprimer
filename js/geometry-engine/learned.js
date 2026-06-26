// @ts-check
/**
 * Prerequisite-DAG gating for the theorem engine. A generated problem may only chain theorems the
 * learner has already met — operationalised as: a rule's `conceptId` must be in the **prerequisite
 * closure** (all transitive ancestors) of the page the problem sits on. This module is the pure graph
 * math; the element fetches `dist/graph.json` and feeds it here. DOM-free, unit-tested.
 * @module
 */

/**
 * Build an adjacency map `id → prerequisites[]` from the `dist/graph.json` shape
 * (`{ concepts: [{ id, prerequisites }] }`) or a plain array of such entries.
 * @param {{ concepts?: Array<{ id: string, prerequisites?: string[] }> } | Array<{ id: string, prerequisites?: string[] }>} graph
 * @returns {Map<string, string[]>}
 */
export function buildAdjacency(graph) {
  const list = Array.isArray(graph) ? graph : (graph.concepts ?? []);
  /** @type {Map<string, string[]>} */
  const adj = new Map();
  for (const c of list) adj.set(c.id, c.prerequisites ?? []);
  return adj;
}

/**
 * The transitive prerequisite closure (all ancestors) of `id` — the concepts it is built on, i.e. the
 * theorems "already learned" by the time a learner reaches `id`. Excludes `id` itself.
 * @param {Map<string, string[]> | Record<string, string[]>} adjacency
 * @param {string} id
 * @returns {Set<string>}
 */
export function prereqClosure(adjacency, id) {
  const get = (/** @type {string} */ k) =>
    adjacency instanceof Map ? (adjacency.get(k) ?? []) : (adjacency[k] ?? []);
  /** @type {Set<string>} */
  const seen = new Set();
  const stack = [...get(id)];
  while (stack.length) {
    const cur = /** @type {string} */ (stack.pop());
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const p of get(cur)) if (!seen.has(p)) stack.push(p);
  }
  return seen;
}

/**
 * The theorem `conceptId`s a problem on `id` may use: those rule concepts that are in the page's
 * prerequisite closure. `ruleConceptIds` is the set of all theorems the engine knows. An optional
 * `override` (test/authoring) pins the pool explicitly, ignoring the graph.
 * @param {Map<string, string[]> | Record<string, string[]>} adjacency
 * @param {string} id
 * @param {Iterable<string>} ruleConceptIds
 * @param {Iterable<string>} [override]
 * @returns {Set<string>}
 */
export function allowedTheorems(adjacency, id, ruleConceptIds, override) {
  if (override) return new Set(override);
  const closure = prereqClosure(adjacency, id);
  return new Set([...ruleConceptIds].filter((c) => closure.has(c)));
}
