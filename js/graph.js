// @ts-check
/**
 * The knowledge "tree" (technically a DAG) and operations over it:
 *  - indexing concepts by id and finding roots,
 *  - resolving the transitive prerequisites of a concept,
 *  - reachability / orphan detection and cycle detection (non-throwing, for CI),
 *  - computing each concept's effective numeric level via downstream propagation,
 *  - a single {@link validateGraph} entry point that returns diagnostics + resolved
 *    concepts, used by both tests and the graph build script.
 * @module
 */

import { maxLevel, BASE_LEVEL } from "./levels.js";

/** @typedef {import("./types/domain.js").Concept} Concept */
/** @typedef {import("./types/domain.js").ResolvedConcept} ResolvedConcept */
/** @typedef {import("./types/domain.js").Level} Level */
/** @typedef {import("./types/domain.js").Diagnostic} Diagnostic */

/**
 * Index concepts by id. Unlike {@link validateGraph} this throws on the first
 * duplicate; use it where a well-formed graph is a precondition.
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
  return byId;
}

/**
 * Concepts explicitly marked as roots (entry points).
 * @param {Concept[]} concepts
 * @returns {string[]}
 */
export function findRoots(concepts) {
  return concepts.filter((c) => c.root === true).map((c) => c.id);
}

/**
 * Reverse adjacency: for each concept, the ids of concepts that depend on it.
 * Edges to unknown concepts are ignored (dangling refs are reported separately).
 * @param {Map<string, Concept>} byId
 * @returns {Map<string, string[]>}
 */
export function buildDependents(byId) {
  /** @type {Map<string, string[]>} */
  const dependents = new Map();
  for (const id of byId.keys()) dependents.set(id, []);
  for (const c of byId.values()) {
    for (const pre of c.prerequisites) {
      if (byId.has(pre)) /** @type {string[]} */ (dependents.get(pre)).push(c.id);
    }
  }
  return dependents;
}

/**
 * Every concept reachable from the given roots by following "is-prerequisite-of"
 * edges (i.e. climbing the tree from base concepts up to the topics that build on
 * them). A concept is reachable iff its prerequisite chain leads down to a root.
 * @param {Map<string, Concept>} byId
 * @param {string[]} rootIds
 * @returns {Set<string>}
 */
export function reachableFromRoots(byId, rootIds) {
  const dependents = buildDependents(byId);
  /** @type {Set<string>} */
  const seen = new Set();
  const stack = rootIds.filter((id) => byId.has(id));
  while (stack.length) {
    const id = /** @type {string} */ (stack.pop());
    if (seen.has(id)) continue;
    seen.add(id);
    for (const dep of dependents.get(id) ?? []) stack.push(dep);
  }
  return seen;
}

/**
 * All transitive prerequisites of a concept, in dependency order (each id appears
 * after its own prerequisites). Excludes the concept itself. Throws on a cycle.
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
    if (onStack.has(current)) throw new Error(`Prerequisite cycle detected at "${current}"`);
    onStack.add(current);
    const concept = byId.get(current);
    if (!concept) throw new Error(`Unknown concept: ${current}`);
    for (const pre of concept.prerequisites) {
      if (byId.has(pre)) visit(pre);
    }
    onStack.delete(current);
    done.add(current);
    if (current !== id) ordered.push(current);
  };

  visit(id);
  return ordered;
}

/**
 * Detect prerequisite cycles without throwing. Returns one representative path per
 * cycle found (e.g. ["a", "b", "a"]).
 * @param {Map<string, Concept>} byId
 * @returns {string[][]}
 */
export function detectCycles(byId) {
  /** @type {string[][]} */
  const cycles = [];
  /** @type {Set<string>} */
  const done = new Set();
  /** @type {Map<string, number>} */
  const stackIndex = new Map();
  /** @type {string[]} */
  const path = [];
  /** @type {Set<string>} */
  const reported = new Set();

  /** @param {string} id */
  const visit = (id) => {
    if (done.has(id)) return;
    if (stackIndex.has(id)) {
      const cycle = path.slice(/** @type {number} */ (stackIndex.get(id))).concat(id);
      const key = [...cycle].sort().join("|");
      if (!reported.has(key)) {
        reported.add(key);
        cycles.push(cycle);
      }
      return;
    }
    stackIndex.set(id, path.length);
    path.push(id);
    for (const pre of byId.get(id)?.prerequisites ?? []) {
      if (byId.has(pre)) visit(pre);
    }
    path.pop();
    stackIndex.delete(id);
    done.add(id);
  };

  for (const id of byId.keys()) visit(id);
  return cycles;
}

/**
 * Effective level of one concept: max(declaredLevel, max effective level of all
 * prerequisites). Returns `null` when neither the concept nor any ancestor declared
 * a level (the caller substitutes {@link BASE_LEVEL}). Cycle-safe: an id currently
 * on the recursion stack contributes `null` rather than looping forever.
 * @param {string} id
 * @param {Map<string, Concept>} byId
 * @param {Map<string, Level | null>} [memo]
 * @param {Set<string>} [onStack]
 * @returns {Level | null}
 */
export function effectiveLevel(id, byId, memo = new Map(), onStack = new Set()) {
  if (memo.has(id)) return /** @type {Level | null} */ (memo.get(id));
  if (onStack.has(id)) return null; // cycle guard
  const concept = byId.get(id);
  if (!concept) throw new Error(`Unknown concept: ${id}`);

  onStack.add(id);
  /** @type {Level | null} */
  let level = concept.declaredLevel ?? null;
  for (const pre of concept.prerequisites) {
    if (byId.has(pre)) level = maxLevel(level, effectiveLevel(pre, byId, memo, onStack));
  }
  onStack.delete(id);
  memo.set(id, level);
  return level;
}

/**
 * Resolve every concept's numeric level in one pass. Ungrounded chains fall back to
 * {@link BASE_LEVEL} with `levelGrounded: false`.
 * @param {Concept[]} concepts
 * @param {Map<string, Concept>} [index]
 * @returns {ResolvedConcept[]}
 */
export function resolveLevels(concepts, index) {
  const byId = index ?? indexConcepts(concepts);
  /** @type {Map<string, Level | null>} */
  const memo = new Map();
  return concepts.map((c) => {
    const raw = effectiveLevel(c.id, byId, memo);
    return { ...c, level: raw ?? BASE_LEVEL, levelGrounded: raw !== null };
  });
}

/**
 * Validate the whole graph without throwing, returning diagnostics plus the
 * resolved concepts. Orphans are defined as concepts unreachable from a declared
 * root (per project decision).
 * @param {Concept[]} concepts
 * @returns {{ diagnostics: Diagnostic[], resolved: ResolvedConcept[] }}
 */
export function validateGraph(concepts) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];

  // Duplicate ids (keep first occurrence for the rest of the analysis).
  /** @type {Map<string, Concept>} */
  const byId = new Map();
  for (const c of concepts) {
    if (byId.has(c.id)) {
      diagnostics.push({ severity: "error", code: "duplicate-id", concept: c.id, message: `Duplicate concept id "${c.id}"` });
    } else {
      byId.set(c.id, c);
    }
  }

  // Dangling prerequisites.
  for (const c of byId.values()) {
    for (const pre of c.prerequisites) {
      if (!byId.has(pre)) {
        diagnostics.push({ severity: "error", code: "dangling-prerequisite", concept: c.id, message: `Concept "${c.id}" lists unknown prerequisite "${pre}"` });
      }
    }
  }

  // Cycles.
  for (const cycle of detectCycles(byId)) {
    diagnostics.push({ severity: "error", code: "cycle", concept: cycle[0], message: `Prerequisite cycle: ${cycle.join(" → ")}` });
  }

  // Roots & orphans (unreachable from a declared root).
  const rootIds = findRoots([...byId.values()]);
  if (rootIds.length === 0) {
    diagnostics.push({ severity: "error", code: "no-roots", message: "No concept is marked as a root (`root: true`); nothing can be reached." });
  }
  const reachable = reachableFromRoots(byId, rootIds);
  for (const id of byId.keys()) {
    if (!reachable.has(id)) {
      diagnostics.push({ severity: "error", code: "orphan", concept: id, message: `Concept "${id}" is not reachable from any root` });
    }
  }

  // Levels + level-quality warnings.
  const resolved = resolveLevels([...byId.values()], byId);
  /** @type {Map<string, ResolvedConcept>} */
  const resolvedById = new Map(resolved.map((r) => [r.id, r]));
  for (const c of byId.values()) {
    const r = /** @type {ResolvedConcept} */ (resolvedById.get(c.id));
    if (!r.levelGrounded) {
      diagnostics.push({ severity: "warning", code: "ungrounded-level", concept: c.id, message: `Concept "${c.id}" has no declared level in its ancestry; defaulting to ${BASE_LEVEL}` });
    }
    if (c.declaredLevel !== undefined) {
      for (const pre of c.prerequisites) {
        const pr = resolvedById.get(pre);
        if (pr && c.declaredLevel < pr.level) {
          diagnostics.push({ severity: "warning", code: "declared-below-prerequisite", concept: c.id, message: `Concept "${c.id}" declares level ${c.declaredLevel} below its prerequisite "${pre}" (level ${pr.level}); it was raised to ${r.level}` });
          break;
        }
      }
    }
  }

  return { diagnostics, resolved };
}
