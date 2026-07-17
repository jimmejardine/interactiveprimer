import test from "node:test";
import assert from "node:assert/strict";
import {
  indexConcepts,
  findRoots,
  attachOrphans,
  pruneCoursesFromCourseMembers,
  ORPHANS_ID,
  reachableFromRoots,
  resolvePrerequisites,
  detectCycles,
  effectiveLevel,
  resolveLevels,
  validateGraph,
  courseVisibleSet,
  directNeighbors,
  kHopNeighborhood,
} from "../src/graph.ts";
import type { Concept } from "../src/types/domain.ts";

/**
 * Sample tree with full-path ids. Everything climbs from the single root (id "root"):
 *   root (level 0)
 *     ├─ counting (level 0)
 *     │    └─ addition            (inherits 0)
 *     │         └─ multiplication
 *     └─ sets (level 6)
 *          └─ multiplication      (so multiplication inherits max(0, 6) = 6)
 */
function sample(): Concept[] {
  return [
    { id: "root", title: "Root", prerequisites: [], declaredLevel: 0 },
    { id: "math/counting", title: "Counting", prerequisites: ["root"], declaredLevel: 0 },
    { id: "math/addition", title: "Addition", prerequisites: ["math/counting"] },
    { id: "math/sets", title: "Sets", prerequisites: ["root"], declaredLevel: 6 },
    { id: "math/multiplication", title: "Multiplication", prerequisites: ["math/addition", "math/sets"] },
  ];
}

test("indexConcepts rejects duplicate ids", () => {
  assert.throws(() =>
    indexConcepts([
      { id: "x", title: "X", prerequisites: [] },
      { id: "x", title: "X2", prerequisites: [] },
    ]),
  );
});

test("findRoots returns the single root concept (id \"root\")", () => {
  assert.deepEqual(findRoots(sample()), ["root"]);
});

test("attachOrphans re-parents orphans under the orphans node, leaving wired concepts alone", () => {
  const cs: Concept[] = [
    { id: "root", title: "Root", prerequisites: [] },
    { id: "orphans", title: "Orphans", prerequisites: ["root"] },
    { id: "stray", title: "Stray", prerequisites: [] }, // no prerequisite → orphan
    { id: "dangly", title: "Dangly", prerequisites: ["ghost"] }, // only a dangling prereq → orphan
    { id: "wired", title: "Wired", prerequisites: ["root"] }, // has a real prerequisite
  ];
  attachOrphans(cs);
  const byId = new Map(cs.map((c) => [c.id, c.prerequisites]));
  assert.deepEqual(byId.get("stray"), [ORPHANS_ID]);
  assert.deepEqual(byId.get("dangly"), ["ghost", ORPHANS_ID]);
  assert.deepEqual(byId.get("wired"), ["root"]); // untouched
  assert.deepEqual(byId.get("root"), []); // the root is never attached to anything
  assert.deepEqual(byId.get("orphans"), ["root"]); // the orphans node is never attached to itself
});

test("pruneCoursesFromCourseMembers drops other courses but keeps the hub and lessons", () => {
  const cs: Concept[] = [
    // courseA lists its own hub, two lessons, and a link to another course (courseB).
    { id: "a/a", title: "Course A", prerequisites: [], course: true, courseMembers: ["a/a", "a/l1", "b/b", "a/l2"] },
    { id: "a/l1", title: "Lesson 1", prerequisites: [] },
    { id: "a/l2", title: "Lesson 2", prerequisites: [] },
    { id: "b/b", title: "Course B", prerequisites: [], course: true, courseMembers: ["b/b", "b/l1"] },
    { id: "b/l1", title: "B Lesson 1", prerequisites: [] },
  ];
  pruneCoursesFromCourseMembers(cs);
  const byId = new Map(cs.map((c) => [c.id, c]));
  // courseB is removed from courseA's members; the hub (index 0) and real lessons stay, in order.
  assert.deepEqual(byId.get("a/a")?.courseMembers, ["a/a", "a/l1", "a/l2"]);
  // courseB is untouched (it references no other course).
  assert.deepEqual(byId.get("b/b")?.courseMembers, ["b/b", "b/l1"]);
});

test("attachOrphans is a no-op when the orphans node is absent", () => {
  const cs: Concept[] = [
    { id: "root", title: "Root", prerequisites: [] },
    { id: "stray", title: "Stray", prerequisites: [] },
  ];
  attachOrphans(cs);
  assert.deepEqual(cs.find((c) => c.id === "stray")?.prerequisites, []);
});

test("resolvePrerequisites returns transitive prereqs in dependency order", () => {
  const byId = indexConcepts(sample());
  const pre = resolvePrerequisites("math/multiplication", byId);
  assert.deepEqual(new Set(pre), new Set(["root", "math/counting", "math/addition", "math/sets"]));
  assert.ok(!pre.includes("math/multiplication"));
  assert.ok(pre.indexOf("math/counting") < pre.indexOf("math/addition"));
});

test("reachableFromRoots reaches everything wired to a root", () => {
  const byId = indexConcepts(sample());
  const reachable = reachableFromRoots(byId, findRoots(sample()));
  assert.equal(reachable.size, 5);
});

test("effectiveLevel propagates declared levels downstream (numeric max)", () => {
  const byId = indexConcepts(sample());
  assert.equal(effectiveLevel("math/addition", byId), 0); // inherits counting
  assert.equal(effectiveLevel("math/multiplication", byId), 6); // max(0, 6)
});

test("effectiveLevel supports real (fractional) levels", () => {
  const cs: Concept[] = [
    { id: "a", title: "A", prerequisites: [], declaredLevel: 2 },
    { id: "b", title: "B", prerequisites: ["a"], declaredLevel: 2.5 },
    { id: "c", title: "C", prerequisites: ["b"] },
  ];
  const byId = indexConcepts(cs);
  assert.equal(effectiveLevel("b", byId), 2.5);
  assert.equal(effectiveLevel("c", byId), 2.5);
});

test("resolveLevels defaults ungrounded chains to BASE_LEVEL and flags them", () => {
  const cs: Concept[] = [
    { id: "a", title: "A", prerequisites: [] }, // no declaredLevel
    { id: "b", title: "B", prerequisites: ["a"] },
  ];
  const byId = new Map(resolveLevels(cs).map((r) => [r.id, r]));
  assert.equal(byId.get("a")?.level, 0);
  assert.equal(byId.get("a")?.levelGrounded, false);
  assert.equal(byId.get("b")?.level, 0);
  assert.equal(byId.get("b")?.levelGrounded, false);
});

test("detectCycles finds a cycle without throwing", () => {
  const byId = indexConcepts([
    { id: "a", title: "A", prerequisites: ["b"] },
    { id: "b", title: "B", prerequisites: ["a"] },
  ]);
  const cycles = detectCycles(byId);
  assert.equal(cycles.length, 1);
});

test("validateGraph: a healthy tree has no errors", () => {
  const { diagnostics, resolved } = validateGraph(sample());
  assert.equal(diagnostics.filter((d) => d.severity === "error").length, 0);
  assert.equal(resolved.length, 5);
});

test("validateGraph flags dangling prerequisites", () => {
  const { diagnostics } = validateGraph([
    { id: "root", title: "Root", prerequisites: ["ghost"] },
  ]);
  assert.ok(diagnostics.some((d) => d.code === "dangling-prerequisite"));
});

test("validateGraph flags cycles", () => {
  const { diagnostics } = validateGraph([
    { id: "root", title: "Root", prerequisites: ["b"] },
    { id: "b", title: "B", prerequisites: ["root"] },
  ]);
  assert.ok(diagnostics.some((d) => d.code === "cycle"));
});

test("validateGraph flags orphans unreachable from a root", () => {
  const cs: Concept[] = [
    { id: "root", title: "Root", prerequisites: [], declaredLevel: 0 },
    // A stray island: foo doesn't reach the root, and bar only depends on foo.
    { id: "stray/foo", title: "Foo", prerequisites: [] },
    { id: "stray/bar", title: "Bar", prerequisites: ["stray/foo"] },
  ];
  const { diagnostics } = validateGraph(cs);
  const orphans = diagnostics.filter((d) => d.code === "orphan").map((d) => d.concept);
  assert.deepEqual(new Set(orphans), new Set(["stray/foo", "stray/bar"]));
});

test("validateGraph errors when the root concept is missing", () => {
  const { diagnostics } = validateGraph([
    { id: "a", title: "A", prerequisites: [] },
  ]);
  assert.ok(diagnostics.some((d) => d.code === "missing-root"));
});

test("validateGraph warns when a declared level is below a prerequisite", () => {
  const cs: Concept[] = [
    { id: "root", title: "Root", prerequisites: [], declaredLevel: 5 },
    { id: "b", title: "B", prerequisites: ["root"], declaredLevel: 2 },
  ];
  const { diagnostics, resolved } = validateGraph(cs);
  assert.ok(diagnostics.some((d) => d.code === "declared-below-prerequisite" && d.concept === "b"));
  // b's level is raised to its prerequisite's level.
  assert.equal(resolved.find((r) => r.id === "b")?.level, 5);
});

test("validateGraph warns about ungrounded levels", () => {
  const { diagnostics } = validateGraph([
    { id: "root", title: "Root", prerequisites: [] },
  ]);
  assert.ok(diagnostics.some((d) => d.code === "ungrounded-level"));
});

test("courseVisibleSet = the course node + members + their recursive prerequisite ancestors", () => {
  const concepts: Concept[] = [
    { id: "root", title: "Root", prerequisites: [] },
    { id: "a", title: "A", prerequisites: ["root"] },
    { id: "b", title: "B", prerequisites: ["a"] },
    { id: "c", title: "C (unrelated)", prerequisites: ["root"] },
    { id: "course/x", title: "Course", prerequisites: ["root"], course: true, courseMembers: ["b"] },
  ];
  const byId = indexConcepts(concepts);
  const visible = courseVisibleSet("course/x", byId);
  assert.deepEqual([...visible].sort(), ["a", "b", "course/x", "root"]); // c excluded
});

test("courseVisibleSet returns an empty set for an unknown course id", () => {
  const byId = indexConcepts(sample());
  assert.equal(courseVisibleSet("does/not/exist", byId).size, 0);
});

test("directNeighbors = direct prerequisites (predecessors) ∪ direct dependents (successors)", () => {
  const byId = indexConcepts(sample());
  // addition: prereq counting; dependents multiplication.
  assert.deepEqual(new Set(directNeighbors("math/addition", byId)), new Set(["math/counting", "math/multiplication"]));
  // multiplication: prereqs addition+sets; no dependents.
  assert.deepEqual(new Set(directNeighbors("math/multiplication", byId)), new Set(["math/addition", "math/sets"]));
  assert.deepEqual(directNeighbors("does/not/exist", byId), []);
});

test("kHopNeighborhood: 0 hops = the seeds, growing undirected each hop", () => {
  const byId = indexConcepts(sample());
  assert.deepEqual([...kHopNeighborhood(["math/addition"], byId, 0)], ["math/addition"]);
  // 1 hop from addition → + counting + multiplication.
  assert.deepEqual(
    new Set(kHopNeighborhood(["math/addition"], byId, 1)),
    new Set(["math/addition", "math/counting", "math/multiplication"]),
  );
  // 2 hops also pulls in sets (via multiplication) and root (via counting).
  assert.deepEqual(
    new Set(kHopNeighborhood(["math/addition"], byId, 2)),
    new Set(["math/addition", "math/counting", "math/multiplication", "math/sets", "root"]),
  );
});

test("kHopNeighborhood from the root fans out downstream and accepts multiple seeds", () => {
  const byId = indexConcepts(sample());
  // root's only dependents are counting and sets (1 hop).
  assert.deepEqual(new Set(kHopNeighborhood(["root"], byId, 1)), new Set(["root", "math/counting", "math/sets"]));
  // Seeding with two members unions their neighbourhoods; unknown seeds are ignored.
  assert.deepEqual(
    new Set(kHopNeighborhood(["math/sets", "nope"], byId, 1)),
    new Set(["math/sets", "root", "math/multiplication"]),
  );
});
