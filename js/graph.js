// @ts-check
/**
 * The knowledge "tree" (technically a DAG) and operations over it:
 *  - building an index of concepts by id,
 *  - resolving the full set of prerequisites for a concept,
 *  - computing each concept's effective level via downstream propagation.
 * @module
 */

import { maxLevel } from "./levels.js";

/** @typedef {import("./types/domain.js").Concept} Concept */
/** @typedef {import("./types/domain.js").ResolvedConcept} ResolvedConcept */
/** @typedef {import("./types/domain.js").Level} Level */

/**
 * Index concepts by id. Throws on duplicate ids.
 * @param {Concept[]} concepts
 * @returns {Map<string, Concept>}
 */
export function indexConcepts(concepts) {
  /** @type {Map<string, Concept>} */
  const byId = new Map();
  for (const c of concepts) {
    if (byId.has(c.id)) throw new Error(`Duplicate concept id: ${c.id}`);
    byId.set(c.id, c);
  }
  // Validate edges point at real concepts so authoring mistakes fail loudly.
  for (const c of concepts) {
    for (const pre of c.prerequisites) {
      if (!byId.has(pre)) {
        throw new Error(`Concept "${c.id}" lists unknown prerequisite "${pre}"`);
      }
    }
  }
  return byId;
}

/**
 * All transitive prerequisites of a concept, in dependency order (each id appears
 * after all of its own prerequisites). Excludes the concept itself.
 * @param {string} id
 * @param {Map<string, Concept>} byId
 * @returns {string[]}
 */
export function resolvePrerequisites(id, byId) {
  /** @type {string[]} */
  const ordered = [];
  /** @type {Set<string>} */
  const done = new Set();
  /** @type {Set<string>} */
  const onStack = new Set();

  /** @param {string} current */
  const visit = (current) => {
    if (done.has(current)) return;
    if (onStack.has(current)) {
      throw new Error(`Prerequisite cycle detected at "${current}"`);
    }
    onStack.add(current);
    const concept = byId.get(current);
    if (!concept) throw new Error(`Unknown concept: ${current}`);
    for (const pre of concept.prerequisites) visit(pre);
    onStack.delete(current);
    done.add(current);
    if (current !== id) ordered.push(current);
  };

  visit(id);
  return ordered;
}

/**
 * Effective level of one concept:
 *   max(declaredLevel, max effectiveLevel of all prerequisites).
 * Returns `null` when neither the concept nor any ancestor declared a level.
 * Uses memoised computation across the whole graph for efficiency.
 *
 * @param {string} id
 * @param {Map<string, Concept>} byId
 * @param {Map<string, Level | null>} [memo]  Internal/shared memo cache.
 * @returns {Level | null}
 */
export function effectiveLevel(id, byId, memo = new Map()) {
  if (memo.has(id)) return /** @type {Level | null} */ (memo.get(id));

  const concept = byId.get(id);
  if (!concept) throw new Error(`Unknown concept: ${id}`);

  // Cycle guard: resolvePrerequisites would also catch this, but compute here too.
  /** @type {Level | null} */
  let level = concept.declaredLevel ?? null;
  for (const pre of concept.prerequisites) {
    level = maxLevel(level, effectiveLevel(pre, byId, memo));
  }
  memo.set(id, level);
  return level;
}

/**
 * Resolve every concept's effective level in one pass.
 * @param {Concept[]} concepts
 * @returns {ResolvedConcept[]}
 */
export function resolveLevels(concepts) {
  const byId = indexConcepts(concepts);
  /** @type {Map<string, Level | null>} */
  const memo = new Map();
  return concepts.map((c) => ({
    ...c,
    effectiveLevel: effectiveLevel(c.id, byId, memo),
  }));
}
