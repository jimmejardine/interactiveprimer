// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import {
  indexConcepts,
  findRoots,
  reachableFromRoots,
  resolvePrerequisites,
  detectCycles,
  effectiveLevel,
  resolveLevels,
  validateGraph,
} from "../js/graph.js";

/** @typedef {import("../js/types/domain.js").Concept} Concept */

/**
 * Sample tree with full-path ids:
 *   counting (root, level 0)
 *     └─ addition            (inherits 0)
 *          └─ multiplication
 *   sets (root, level 6)
 *     └─ multiplication      (so multiplication inherits max(0, 6) = 6)
 * @returns {Concept[]}
 */
function sample() {
  return [
    { id: "math/counting", title: "Counting", prerequisites: [], root: true, declaredLevel: 0 },
    { id: "math/addition", title: "Addition", prerequisites: ["math/counting"] },
    { id: "math/sets", title: "Sets", prerequisites: [], root: true, declaredLevel: 6 },
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

test("findRoots returns only concepts marked root", () => {
  assert.deepEqual(new Set(findRoots(sample())), new Set(["math/counting", "math/sets"]));
});

test("resolvePrerequisites returns transitive prereqs in dependency order", () => {
  const byId = indexConcepts(sample());
  const pre = resolvePrerequisites("math/multiplication", byId);
  assert.deepEqual(new Set(pre), new Set(["math/counting", "math/addition", "math/sets"]));
  assert.ok(!pre.includes("math/multiplication"));
  assert.ok(pre.indexOf("math/counting") < pre.indexOf("math/addition"));
});

test("reachableFromRoots reaches everything wired to a root", () => {
  const byId = indexConcepts(sample());
  const reachable = reachableFromRoots(byId, findRoots(sample()));
  assert.equal(reachable.size, 4);
});

test("effectiveLevel propagates declared levels downstream (numeric max)", () => {
  const byId = indexConcepts(sample());
  assert.equal(effectiveLevel("math/addition", byId), 0); // inherits counting
  assert.equal(effectiveLevel("math/multiplication", byId), 6); // max(0, 6)
});

test("effectiveLevel supports real (fractional) levels", () => {
  /** @type {Concept[]} */
  const cs = [
    { id: "a", title: "A", prerequisites: [], root: true, declaredLevel: 2 },
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
    { id: "a", title: "A", prerequisites: [], root: true }, // no declaredLevel
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
  assert.equal(resolved.length, 4);
});

test("validateGraph flags dangling prerequisites", () => {
  const { diagnostics } = validateGraph([
    { id: "a", title: "A", prerequisites: ["ghost"], root: true },
  ]);
  assert.ok(diagnostics.some((d) => d.code === "dangling-prerequisite"));
});

test("validateGraph flags cycles", () => {
  const { diagnostics } = validateGraph([
    { id: "a", title: "A", prerequisites: ["b"], root: true },
    { id: "b", title: "B", prerequisites: ["a"] },
  ]);
  assert.ok(diagnostics.some((d) => d.code === "cycle"));
});

test("validateGraph flags orphans unreachable from a root", () => {
  /** @type {Concept[]} */
  const cs = [
    { id: "math/counting", title: "Counting", prerequisites: [], root: true, declaredLevel: 0 },
    // A stray island: foo is not a root, and bar only depends on foo.
    { id: "physics/foo", title: "Foo", prerequisites: [] },
    { id: "physics/bar", title: "Bar", prerequisites: ["physics/foo"] },
  ];
  const { diagnostics } = validateGraph(cs);
  const orphans = diagnostics.filter((d) => d.code === "orphan").map((d) => d.concept);
  assert.deepEqual(new Set(orphans), new Set(["physics/foo", "physics/bar"]));
});

test("validateGraph errors when there are no roots", () => {
  const { diagnostics } = validateGraph([
    { id: "a", title: "A", prerequisites: [] },
  ]);
  assert.ok(diagnostics.some((d) => d.code === "no-roots"));
});

test("validateGraph warns when a declared level is below a prerequisite", () => {
  /** @type {Concept[]} */
  const cs = [
    { id: "a", title: "A", prerequisites: [], root: true, declaredLevel: 5 },
    { id: "b", title: "B", prerequisites: ["a"], declaredLevel: 2 },
  ];
  const { diagnostics, resolved } = validateGraph(cs);
  assert.ok(diagnostics.some((d) => d.code === "declared-below-prerequisite" && d.concept === "b"));
  // b's level is raised to its prerequisite's level.
  assert.equal(resolved.find((r) => r.id === "b")?.level, 5);
});

test("validateGraph warns about ungrounded levels", () => {
  const { diagnostics } = validateGraph([
    { id: "a", title: "A", prerequisites: [], root: true },
  ]);
  assert.ok(diagnostics.some((d) => d.code === "ungrounded-level"));
});
