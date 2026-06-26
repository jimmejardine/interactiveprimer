// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { makeRng } from "../js/rng.js";
import { RULES, rel, equal, sumTo, relationHolds } from "../js/geometry-engine/rules.js";
import { forwardChain, traceTarget } from "../js/geometry-engine/chain.js";
import { parallelTransversal, triangle, SCAFFOLDS, anglePos } from "../js/geometry-engine/scaffolds.js";
import { generateProblem } from "../js/geometry-engine/generate.js";
import { buildAdjacency, prereqClosure, allowedTheorems } from "../js/geometry-engine/learned.js";

const allRuleConcepts = () => new Set(Object.values(RULES).map((r) => r.conceptId));
const allConcepts = () => new Set(Object.values(RULES).map((r) => r.conceptId)); // alias

/* ------------------------------- rules ------------------------------- */

test("rel/equal/sumTo build tagged linear relations; relationHolds evaluates them", () => {
  const e = equal("a", "b", "vertical");
  assert.equal(e.conceptId, RULES.vertical.conceptId);
  assert.ok(relationHolds(e, { a: 70, b: 70 }));
  assert.ok(!relationHolds(e, { a: 70, b: 71 }));
  const s = sumTo(["a", "b"], 180, "linearPair");
  assert.ok(relationHolds(s, { a: 70, b: 110 }));
  assert.ok(!relationHolds(s, { a: 70, b: 100 }));
  assert.throws(() => rel(/** @type {any} */ ("nope"), [], 0));
});

/* ----------------------------- scaffolds ----------------------------- */

test("every scaffold emits a SELF-CONSISTENT figure (all relations hold for the true values)", () => {
  for (const make of Object.values(SCAFFOLDS)) {
    for (let seed = 1; seed <= 40; seed++) {
      const fig = make(makeRng(seed * 2654435761));
      const values = Object.fromEntries(fig.angles.map((a) => [a.key, a.value]));
      for (const r of fig.relations) {
        assert.ok(
          relationHolds(r, values),
          `${fig.name} seed ${seed}: relation ${r.rule} over ${r.terms.map((t) => t.key)} should hold`,
        );
      }
      // Angles are integers and the figure is non-degenerate (distinct point coords).
      for (const a of fig.angles) assert.ok(Number.isInteger(a.value) && a.value > 0 && a.value < 180);
    }
  }
});

test("parallelTransversal: a transversal angle θ and its supplement appear, 8 angles, 4 corners each", () => {
  const fig = parallelTransversal(makeRng(7));
  assert.equal(fig.angles.length, 8);
  const vals = new Set(fig.angles.map((a) => a.value));
  // exactly two distinct values, summing to 180
  const arr = [...vals];
  assert.equal(arr.length, 2);
  assert.equal(arr[0] + arr[1], 180);
});

test("triangle: the three angles sum to 180 and the apex realises them", () => {
  const fig = triangle(makeRng(3));
  const sum = fig.angles.reduce((s, a) => s + a.value, 0);
  assert.equal(sum, 180);
  // anglePos returns a finite point inside the board for each angle
  for (const a of fig.angles) {
    const p = anglePos(fig, a);
    assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }
});

/* --------------------------- forwardChain ---------------------------- */

test("forwardChain solves a single-unknown relation and chains to a fixpoint", () => {
  // a=b (vertical), a+c=180 (linear). Given a=70 ⇒ b=70, c=110.
  const relations = [equal("a", "b", "vertical"), sumTo(["a", "c"], 180, "linearPair")];
  const { known, steps } = forwardChain(relations, [["a", 70]], allConcepts());
  assert.equal(known.get("b"), 70);
  assert.equal(known.get("c"), 110);
  assert.equal(steps.length, 2);
});

test("forwardChain respects the allowed pool — a disallowed theorem never fires", () => {
  const relations = [equal("a", "b", "vertical"), sumTo(["a", "c"], 180, "linearPair")];
  // Allow only the linearPair conceptId, not vertical.
  const allowed = new Set([RULES.linearPair.conceptId]);
  // vertical and linearPair share a conceptId in the catalog, so to test gating use triangleSum.
  const rels2 = [sumTo(["a", "b", "c"], 180, "triangleSum"), equal("c", "d", "alternateInterior")];
  const onlyTri = new Set([RULES.triangleSum.conceptId]);
  const { known } = forwardChain(rels2, [["a", 60], ["b", 70]], onlyTri);
  assert.equal(known.get("c"), 50); // triangleSum fired
  assert.ok(!known.has("d")); // alternateInterior was NOT allowed → d never derived
  assert.ok(allowed.has(RULES.linearPair.conceptId));
});

test("traceTarget returns the ordered sub-chain (premises before their consumers), or null", () => {
  const relations = [
    equal("a", "b", "vertical"), // b from a
    sumTo(["b", "c"], 180, "linearPair"), // c from b
  ];
  const { steps } = forwardChain(relations, [["a", 70]], allConcepts());
  const trace = traceTarget(steps, "c");
  assert.ok(trace);
  assert.deepEqual(trace.map((s) => s.produces), ["b", "c"]);
  assert.equal(traceTarget(steps, "zzz"), null);
});

/* ----------------------------- generate ------------------------------ */

test("generateProblem produces a solvable multi-step problem with a unique, correct target", () => {
  const allowed = allRuleConcepts();
  for (let seed = 1; seed <= 30; seed++) {
    const fig = parallelTransversal(makeRng(seed * 40503));
    const prob = generateProblem(fig, allowed, makeRng(seed * 7919), { minSteps: 2, maxSteps: 4 });
    assert.ok(prob, `seed ${seed}: should generate a problem`);
    if (!prob) continue;
    // The target is the last blank, and re-deriving from the givens reproduces every blank's value.
    const givenEntries = prob.givens.map((g) => /** @type {[string, number]} */ ([g.key, g.value]));
    const { known } = forwardChain(fig.relations, givenEntries, allowed);
    for (const b of prob.blanks) assert.equal(known.get(b.key), b.value, `blank ${b.key} value`);
    assert.equal(prob.blanks[prob.blanks.length - 1].key, prob.target);
    // No blank is also a given (you never "fill in" something you were told).
    const givenKeys = new Set(prob.givens.map((g) => g.key));
    for (const b of prob.blanks) assert.ok(!givenKeys.has(b.key));
    // Each blank's true value matches the figure.
    const truth = new Map(fig.angles.map((a) => [a.key, a.value]));
    for (const b of prob.blanks) assert.equal(b.value, truth.get(b.key));
  }
});

test("generateProblem returns null when the allowed pool derives nothing", () => {
  const fig = parallelTransversal(makeRng(11));
  // Allow only a theorem this figure never uses (triangle sum) → nothing chains.
  const prob = generateProblem(fig, new Set([RULES.triangleSum.conceptId]), makeRng(5));
  assert.equal(prob, null);
});

/* ------------------------------ learned ------------------------------ */

test("prereqClosure / allowedTheorems gate by the prerequisite DAG", () => {
  const graph = {
    concepts: [
      { id: "page", prerequisites: ["alt"] },
      { id: "alt", prerequisites: ["par"] },
      { id: "par", prerequisites: [] },
      { id: "triangle-sum", prerequisites: [] },
    ],
  };
  const adj = buildAdjacency(graph);
  const closure = prereqClosure(adj, "page");
  assert.deepEqual([...closure].sort(), ["alt", "par"]);
  // A rule pool of {par, triangle-sum}: only `par` is learned by `page`.
  const allowed = allowedTheorems(adj, "page", ["par", "triangle-sum"]);
  assert.deepEqual([...allowed], ["par"]);
  // Override pins the pool regardless of the graph.
  const pinned = allowedTheorems(adj, "page", ["par"], ["triangle-sum", "par"]);
  assert.deepEqual([...pinned].sort(), ["par", "triangle-sum"]);
});

test("the real graph gives angle-chasing's parallel-line theorems as learned", () => {
  // alternate-interior-angles → parallel-lines is a real edge; a page built on alternate-interior
  // therefore has both parallel-line and alternate-interior theorems in its closure.
  const graph = {
    concepts: [
      { id: "mathematics/geometry/angle-chasing", prerequisites: ["mathematics/geometry/alternate-interior-angles"] },
      { id: "mathematics/geometry/alternate-interior-angles", prerequisites: ["mathematics/geometry/parallel-lines"] },
      { id: "mathematics/geometry/parallel-lines", prerequisites: [] },
    ],
  };
  const allowed = allowedTheorems(buildAdjacency(graph), "mathematics/geometry/angle-chasing", allRuleConcepts());
  assert.ok(allowed.has("mathematics/geometry/parallel-lines"));
  assert.ok(allowed.has("mathematics/geometry/alternate-interior-angles"));
  assert.ok(!allowed.has("mathematics/geometry/angle-sum-of-a-triangle")); // not a prerequisite
});

test("a page may practise its OWN theorem (its id is allowed too), plus its prerequisites", () => {
  // The angle-sum page teaches triangleSum and builds on alternate-interior → parallel-lines, so a
  // problem on it may chain all three (alternate angles, angles-on-a-line, AND the triangle sum).
  const graph = {
    concepts: [
      { id: "mathematics/geometry/angle-sum-of-a-triangle", prerequisites: ["mathematics/geometry/alternate-interior-angles"] },
      { id: "mathematics/geometry/alternate-interior-angles", prerequisites: ["mathematics/geometry/parallel-lines"] },
      { id: "mathematics/geometry/parallel-lines", prerequisites: [] },
    ],
  };
  const allowed = allowedTheorems(buildAdjacency(graph), "mathematics/geometry/angle-sum-of-a-triangle", allRuleConcepts());
  assert.ok(allowed.has("mathematics/geometry/angle-sum-of-a-triangle"), "its own theorem is practisable");
  assert.ok(allowed.has("mathematics/geometry/alternate-interior-angles"));
  assert.ok(allowed.has("mathematics/geometry/parallel-lines"));
});
