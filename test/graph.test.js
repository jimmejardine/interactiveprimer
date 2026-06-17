// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import {
  indexConcepts,
  findRoots,
  attachOrphans,
  ORPHANS_ID,
  reachableFromRoots,
  resolvePrerequisites,
  detectCycles,
  effectiveLevel,
  resolveLevels,
  validateGraph,
} from "../js/graph.js";

/** @typedef {import("../js/types/domain.js").Concept} Concept */

/**
 * Sample tree with full-path ids. Everything climbs from the single root (id "root"):
 *   root (level 0)
 *     ├─ counting (level 0)
 *     │    └─ addition            (inherits 0)
 *     │         └─ multiplication
 *     └─ sets (level 6)
 *          └─ multiplication      (so multiplication inherits max(0, 6) = 6)
 * @returns {Concept[]}
 */
function sample() {
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
  /** @type {Concept[]} */
  const cs = [
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

test("attachOrphans is a no-op when the orphans node is absent", () => {
  /** @type {Concept[]} */
  const cs = [
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
  /** @type {Concept[]} */
  const cs = [
    { id: "a", title: "A", prerequisites: [], declaredLevel: 2 },
    { id: "b", title: "B", prerequisites: ["a"], declaredLevel: 2.5 },
    { id: "c", title: "C", prerequisites: ["b"] },
  ];
  const byId = indexConcepts(cs);
  assert.equal(effectiveLevel("b", byId), 2.5);
  assert.equal(effectiveLevel("c", byId), 2.5);
});

test("resolveLevels defaults ungrounded chains to BASE_LEVEL and flags them", () => {
  /** @type {Concept[]} */
  const cs = [
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
  /** @type {Concept[]} */
  const cs = [
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
  /** @type {Concept[]} */
  const cs = [
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
