// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import {
  indexConcepts,
  resolvePrerequisites,
  effectiveLevel,
  resolveLevels,
} from "../js/graph.js";

/** @typedef {import("../js/types/domain.js").Concept} Concept */

/**
 * Small example tree:
 *   counting (early-school)
 *     └─ addition
 *          └─ multiplication
 *   sets (undergraduate)        <- a separate, deliberately-levelled milestone
 *     └─ multiplication         (multiplication also depends on sets)
 * @type {Concept[]}
 */
const concepts = [
  { id: "counting", title: "Counting", prerequisites: [], declaredLevel: "early-school" },
  { id: "addition", title: "Addition", prerequisites: ["counting"] },
  { id: "sets", title: "Sets", prerequisites: [], declaredLevel: "undergraduate" },
  { id: "multiplication", title: "Multiplication", prerequisites: ["addition", "sets"] },
];

test("indexConcepts rejects duplicate ids", () => {
  assert.throws(() =>
    indexConcepts([
      { id: "x", title: "X", prerequisites: [] },
      { id: "x", title: "X2", prerequisites: [] },
    ]),
  );
});

test("indexConcepts rejects edges to unknown concepts", () => {
  assert.throws(() =>
    indexConcepts([{ id: "a", title: "A", prerequisites: ["ghost"] }]),
  );
});

test("resolvePrerequisites returns transitive prereqs in dependency order", () => {
  const byId = indexConcepts(concepts);
  const pre = resolvePrerequisites("multiplication", byId);
  // Must include all ancestors, exclude self.
  assert.deepEqual(new Set(pre), new Set(["counting", "addition", "sets"]));
  assert.ok(!pre.includes("multiplication"));
  // counting must come before addition (its dependent).
  assert.ok(pre.indexOf("counting") < pre.indexOf("addition"));
});

test("resolvePrerequisites detects cycles", () => {
  const byId = indexConcepts([
    { id: "a", title: "A", prerequisites: ["b"] },
    { id: "b", title: "B", prerequisites: ["a"] },
  ]);
  assert.throws(() => resolvePrerequisites("a", byId), /cycle/i);
});

test("effectiveLevel propagates a declared level downstream", () => {
  const byId = indexConcepts(concepts);
  // addition declares nothing but inherits counting's level.
  assert.equal(effectiveLevel("addition", byId), "early-school");
  // multiplication inherits the HIGHEST of its ancestors (sets = undergraduate).
  assert.equal(effectiveLevel("multiplication", byId), "undergraduate");
});

test("effectiveLevel is null when nothing up the chain declares a level", () => {
  const byId = indexConcepts([
    { id: "a", title: "A", prerequisites: [] },
    { id: "b", title: "B", prerequisites: ["a"] },
  ]);
  assert.equal(effectiveLevel("b", byId), null);
});

test("resolveLevels resolves the whole tree in one pass", () => {
  const resolved = resolveLevels(concepts);
  const byId = new Map(resolved.map((c) => [c.id, c]));
  assert.equal(byId.get("counting")?.effectiveLevel, "early-school");
  assert.equal(byId.get("addition")?.effectiveLevel, "early-school");
  assert.equal(byId.get("sets")?.effectiveLevel, "undergraduate");
  assert.equal(byId.get("multiplication")?.effectiveLevel, "undergraduate");
});
