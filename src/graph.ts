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

import { maxLevel, BASE_LEVEL } from "./levels.ts";
import type { Concept, ResolvedConcept, Level, Diagnostic } from "./types/domain.ts";

/** The id of the single, canonical root of the tree (the one page that everything climbs from). */
export const ROOT_ID = "root";

/** The id of the maintenance node every orphan is auto-attached to (it, in turn, hangs off {@link ROOT_ID}). */
export const ORPHANS_ID = "orphans";

/**
 * Index concepts by id. Unlike {@link validateGraph} this throws on the first
 * duplicate; use it where a well-formed graph is a precondition.
 */
export function indexConcepts(concepts: Concept[]): Map<string, Concept> {
  const byId: Map<string, Concept> = new Map();
  for (const c of concepts) {
    if (byId.has(c.id)) throw new Error(`Duplicate concept id: ${c.id}`);
    byId.set(c.id, c);
  }
  return byId;
}

/**
 * The tree's roots. There is exactly one — the concept whose id is {@link ROOT_ID} — so this
 * returns `[ROOT_ID]` when that concept is present, otherwise `[]`. (Kept array-shaped for the
 * reachability/validation callers.)
 */
export function findRoots(concepts: Concept[]): string[] {
  return concepts.some((c) => c.id === ROOT_ID) ? [ROOT_ID] : [];
}

/**
 * Re-parent every orphan under the {@link ORPHANS_ID} maintenance node, in place. An orphan is a
 * concept (other than the root or the orphans node itself) with **no existing prerequisite** —
 * none of its prerequisites resolves to a known concept (so a page that lists nothing, or only
 * dangling ids, qualifies). Such a concept gains {@link ORPHANS_ID} as a prerequisite, which wires
 * it into the tree (the orphans node hangs off {@link ROOT_ID}) instead of failing the orphan
 * check. No-op when the orphans node is absent from the set, so a fork without it still surfaces
 * true orphans via validation rather than gaining fabricated dangling edges.
 * @returns the same array (prerequisites mutated in place)
 */
export function attachOrphans(concepts: Concept[]): Concept[] {
  const ids = new Set(concepts.map((c) => c.id));
  if (!ids.has(ORPHANS_ID)) return concepts;
  for (const c of concepts) {
    if (c.id === ROOT_ID || c.id === ORPHANS_ID) continue;
    if (!c.prerequisites.some((p) => ids.has(p))) c.prerequisites.push(ORPHANS_ID);
  }
  return concepts;
}

/**
 * Prune other **courses** out of every course's `courseMembers`, in place. Courses often
 * cross-reference one another (a follow-on course, a "previous grade" link, a university year that
 * points at its subject courses) — but another course is not a lesson *in* this course, so it should
 * not count as one of its concepts. The course's own hub page at index 0 is always kept; only
 * referenced ids that are themselves courses are dropped from the tail. No-op for non-course concepts
 * and for members that aren't in the set (those are reported elsewhere as dangling refs).
 * @returns the same array (courseMembers mutated in place)
 */
export function pruneCoursesFromCourseMembers(concepts: Concept[]): Concept[] {
  const courseIds = new Set(concepts.filter((c) => c.course).map((c) => c.id));
  for (const c of concepts) {
    if (!c.course || !c.courseMembers) continue;
    c.courseMembers = c.courseMembers.filter((m, i) => i === 0 || !courseIds.has(m));
  }
  return concepts;
}

/**
 * Reverse adjacency: for each concept, the ids of concepts that depend on it.
 * Edges to unknown concepts are ignored (dangling refs are reported separately).
 */
export function buildDependents(byId: Map<string, Concept>): Map<string, string[]> {
  const dependents: Map<string, string[]> = new Map();
  for (const id of byId.keys()) dependents.set(id, []);
  for (const c of byId.values()) {
    for (const pre of c.prerequisites) {
      if (byId.has(pre)) (dependents.get(pre) as string[]).push(c.id);
    }
  }
  return dependents;
}

/**
 * Every concept reachable from the given roots by following "is-prerequisite-of"
 * edges (i.e. climbing the tree from base concepts up to the topics that build on
 * them). A concept is reachable iff its prerequisite chain leads down to a root.
 */
export function reachableFromRoots(byId: Map<string, Concept>, rootIds: string[]): Set<string> {
  const dependents = buildDependents(byId);
  const seen: Set<string> = new Set();
  const stack = rootIds.filter((id) => byId.has(id));
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const dep of dependents.get(id) ?? []) stack.push(dep);
  }
  return seen;
}

/**
 * All transitive prerequisites of a concept, in dependency order (each id appears
 * after its own prerequisites). Excludes the concept itself. Throws on a cycle.
 */
export function resolvePrerequisites(id: string, byId: Map<string, Concept>): string[] {
  const ordered: string[] = [];
  const done: Set<string> = new Set();
  const onStack: Set<string> = new Set();

  const visit = (current: string) => {
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
 * The set of concept ids to show for a focused course: the course node itself, its
 * `courseMembers`, and the FULL recursive prerequisite ancestry of all of them. Used by the big
 * explorer to collapse the graph to just the course and the foundations it rests on. Tolerant of a
 * missing course id or member (returns what it can).
 * @param courseId  The course page's concept id.
 */
export function courseVisibleSet(courseId: string, byId: Map<string, Concept>): Set<string> {
  const visible: Set<string> = new Set();
  const course = byId.get(courseId);
  if (!course) return visible;
  for (const seed of [courseId, ...(course.courseMembers ?? [])]) {
    if (!byId.has(seed)) continue;
    visible.add(seed);
    for (const anc of resolvePrerequisites(seed, byId)) visible.add(anc);
  }
  return visible;
}

/**
 * The local (one-hop) neighborhood of a concept, for the navigation pathway widget:
 *  - `predecessors` — the concept's direct prerequisites (immediate predecessors).
 *  - `successors`   — the concept's direct dependents (immediate successors).
 *  - `peers` — the immediate siblings/co-parents: direct dependents of the concept's
 *    direct prerequisites, plus direct prerequisites of its direct dependents, minus
 *    the concept itself, anything already a direct predecessor or successor, and anything
 *    that (transitively) depends on the concept — a downstream node is not a peer you could
 *    cover next, even when it happens to share a successor or prerequisite with the concept.
 *  - `edges` — undirected, deduped prerequisite edges among all displayed concepts.
 * Returns `null` if `id` is not in the graph (the widget then renders nothing).
 *
 * Immediate successors come from a precomputed `successors` field when present (on
 * the ResolvedConcept records in dist/graph.json), else the reverse adjacency is
 * derived on demand — so this stays correct for plain Concept test fixtures too.
 */
export function neighborhood(
  id: string,
  byId: Map<string, Concept>,
): { id: string, predecessors: string[], successors: string[], peers: string[], edges: { a: string, b: string }[] } | null {
  if (!byId.has(id)) return null;

  let dependents: Map<string, string[]> | null = null;
  /** Immediate successors (direct dependents). */
  const succOf = (cid: string): string[] => {
    const pre = (byId.get(cid) as any)?.successors;
    if (Array.isArray(pre)) return pre.filter((s) => byId.has(s));
    dependents ??= buildDependents(byId);
    return dependents.get(cid) ?? [];
  };
  /** Immediate predecessors (direct prerequisites). */
  const preOf = (cid: string): string[] => (byId.get(cid)?.prerequisites ?? []).filter((p) => byId.has(p));

  const predecessors = preOf(id);
  const successors = succOf(id);
  const directSet = new Set([id, ...predecessors, ...successors]);
  // `id` plus every concept that (transitively) depends on it. A peer that depends on `id` comes
  // strictly AFTER it, so it isn't a "could-be-covered-next" peer — drop it (see below).
  const dependentsOfId = reachableFromRoots(byId, [id]);

  // Peers: siblings (dependents of my direct prerequisites) + co-parents
  // (prerequisites of my direct dependents), excluding the concept and its direct
  // predecessors/successors (which already occupy columns 1 and 3), AND excluding anything
  // downstream of the concept (a node that depends on it is not a peer you could cover next).
  const peerSet: Set<string> = new Set();
  for (const p of predecessors) for (const sib of succOf(p)) peerSet.add(sib);
  for (const s of successors) for (const cop of preOf(s)) peerSet.add(cop);
  for (const d of directSet) peerSet.delete(d); // self + direct predecessors/successors
  for (const d of dependentsOfId) peerSet.delete(d); // anything that transitively depends on `id`
  const peers = [...peerSet];

  // Edges: undirected, deduped prerequisite edges among the displayed concepts.
  const displayed = new Set([...directSet, ...peers]);
  const edgeMap: Map<string, { a: string, b: string }> = new Map();
  for (const c of displayed) {
    for (const p of preOf(c)) {
      if (!displayed.has(p)) continue;
      const [a, b] = c < p ? [c, p] : [p, c];
      edgeMap.set(`${a} ${b}`, { a, b });
    }
  }

  return { id, predecessors, successors, peers, edges: [...edgeMap.values()] };
}

/**
 * The direct, one-hop neighbours of a concept in BOTH directions: its immediate prerequisites
 * (predecessors) and its immediate dependents (successors), deduped and filtered to known ids.
 * Excludes the concept itself. Used by the progressive explorer to expand a clicked node.
 * Pass a precomputed `dependents` (from {@link buildDependents}) to avoid rebuilding it per call.
 */
export function directNeighbors(id: string, byId: Map<string, Concept>, dependents?: Map<string, string[]>): string[] {
  if (!byId.has(id)) return [];
  const deps = dependents ?? buildDependents(byId);
  const out: Set<string> = new Set();
  for (const p of byId.get(id)?.prerequisites ?? []) if (byId.has(p)) out.add(p);
  for (const s of deps.get(id) ?? []) if (byId.has(s)) out.add(s);
  out.delete(id);
  return [...out];
}

/**
 * The undirected neighbourhood within `hops` steps of any seed: every concept reachable from a seed
 * by following prerequisite edges in EITHER direction at most `hops` times, including the seeds
 * themselves. Used to compute the explorer's starting set (a concept / the root / a course's members,
 * plus two layers around them). `hops = 0` returns just the (known) seeds.
 */
export function kHopNeighborhood(
  seedIds: Iterable<string>,
  byId: Map<string, Concept>,
  hops: number,
  dependents?: Map<string, string[]>,
): Set<string> {
  const deps = dependents ?? buildDependents(byId);
  const seen: Set<string> = new Set();
  let frontier = [...seedIds].filter((id) => byId.has(id));
  for (const id of frontier) seen.add(id);
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of directNeighbors(id, byId, deps)) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return seen;
}

/**
 * Detect prerequisite cycles without throwing. Returns one representative path per
 * cycle found (e.g. ["a", "b", "a"]).
 */
export function detectCycles(byId: Map<string, Concept>): string[][] {
  const cycles: string[][] = [];
  const done: Set<string> = new Set();
  const stackIndex: Map<string, number> = new Map();
  const path: string[] = [];
  const reported: Set<string> = new Set();

  const visit = (id: string) => {
    if (done.has(id)) return;
    if (stackIndex.has(id)) {
      const cycle = path.slice(stackIndex.get(id) as number).concat(id);
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
 */
export function effectiveLevel(
  id: string,
  byId: Map<string, Concept>,
  memo: Map<string, Level | null> = new Map(),
  onStack: Set<string> = new Set(),
): Level | null {
  if (memo.has(id)) return memo.get(id) as Level | null;
  if (onStack.has(id)) return null; // cycle guard
  const concept = byId.get(id);
  if (!concept) throw new Error(`Unknown concept: ${id}`);

  onStack.add(id);
  let level: Level | null = concept.declaredLevel ?? null;
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
 */
export function resolveLevels(concepts: Concept[], index?: Map<string, Concept>): ResolvedConcept[] {
  const byId = index ?? indexConcepts(concepts);
  const memo: Map<string, Level | null> = new Map();
  return concepts.map((c) => {
    const raw = effectiveLevel(c.id, byId, memo);
    return { ...c, level: raw ?? BASE_LEVEL, levelGrounded: raw !== null };
  });
}

/**
 * Validate the whole graph without throwing, returning diagnostics plus the
 * resolved concepts. Orphans are defined as concepts unreachable from a declared
 * root (per project decision).
 */
export function validateGraph(concepts: Concept[]): { diagnostics: Diagnostic[], resolved: ResolvedConcept[] } {
  const diagnostics: Diagnostic[] = [];

  // Duplicate ids (keep first occurrence for the rest of the analysis).
  const byId: Map<string, Concept> = new Map();
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

  // Root & orphans (unreachable from the single root).
  const rootIds = findRoots([...byId.values()]);
  if (rootIds.length === 0) {
    diagnostics.push({ severity: "error", code: "missing-root", message: `The tree has no concept with id "${ROOT_ID}"; nothing can be reached.` });
  }
  const reachable = reachableFromRoots(byId, rootIds);
  for (const id of byId.keys()) {
    if (!reachable.has(id)) {
      diagnostics.push({ severity: "error", code: "orphan", concept: id, message: `Concept "${id}" is not reachable from any root` });
    }
  }

  // Levels + level-quality warnings.
  const resolved = resolveLevels([...byId.values()], byId);
  const resolvedById: Map<string, ResolvedConcept> = new Map(resolved.map((r) => [r.id, r]));
  for (const c of byId.values()) {
    const r = resolvedById.get(c.id) as ResolvedConcept;
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
