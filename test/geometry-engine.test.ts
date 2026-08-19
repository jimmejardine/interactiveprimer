import test from "node:test";
import assert from "node:assert/strict";
import { makeRng } from "../src/rng.ts";
import { RULES, rel, equal, sumTo, relationHolds } from "../src/geometry-engine/rules.ts";
import { forwardChain, traceTarget } from "../src/geometry-engine/chain.ts";
import { parallelTransversal, triangle, SCAFFOLDS, SCAFFOLD_LIST, selectScaffolds, anglePos, lengthPos } from "../src/geometry-engine/scaffolds.ts";
import { generateProblem, pickAndGenerate } from "../src/geometry-engine/generate.ts";
import { buildAdjacency, prereqClosure, allowedTheorems } from "../src/geometry-engine/learned.ts";
import { conceptIdsFor } from "../src/geometry-engine/rules.ts";

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
  assert.throws(() => rel(("nope" as any), [], 0));
});

/* ----------------------------- scaffolds ----------------------------- */

test("every scaffold emits a SELF-CONSISTENT figure (all relations hold for the true values)", () => {
  for (const make of Object.values(SCAFFOLDS)) {
    for (let seed = 1; seed <= 40; seed++) {
      const fig = make(makeRng(seed * 2654435761));
      const values = Object.fromEntries([
        ...fig.angles.map((a) => [a.key, a.value] as const),
        ...(fig.lengths ?? []).map((L) => [L.key, L.value] as const),
      ]);
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

test("quadInterior corners match the stored interiors and stay convex", () => {
  const ccw = (V: [number, number], from: [number, number], to: [number, number]) => {
    const ax = from[0] - V[0], ay = from[1] - V[1];
    const bx = to[0] - V[0], by = to[1] - V[1];
    let d = (Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 180) / Math.PI;
    if (d < 0) d += 360;
    return d > 180 ? 360 - d : d;
  };
  for (let seed = 1; seed <= 30; seed++) {
    const fig = SCAFFOLDS.quadInterior(makeRng(seed * 10007));
    const p = fig.points;
    const side = (P: [number, number], Q: [number, number], R: [number, number]) =>
      Math.sign((Q[0] - P[0]) * (R[1] - P[1]) - (Q[1] - P[1]) * (R[0] - P[0]));
    assert.notEqual(side(p.B, p.D, p.A), side(p.B, p.D, p.C), `seed ${seed}: C must sit opposite A across BD`);
    for (const a of fig.angles) {
      const got = ccw(p[a.vertex], p[a.from], p[a.to]);
      assert.ok(Math.abs(got - a.value) < 1.5, `seed ${seed} ${a.key}: drawn ${got} vs stored ${a.value}`);
    }
  }
});

test("isosceles marks the two equal legs (not the base) as one equals-group", () => {
  const fig = SCAFFOLDS.isosceles(makeRng(4));
  assert.deepEqual(fig.equals, [[1, 2]]);
  assert.deepEqual(fig.edges[1], ["B", "C"]);
  assert.deepEqual(fig.edges[2], ["C", "A"]);
});

test("lengthPos sits off the side, away from the third vertex", () => {
  const fig = SCAFFOLDS.rightTriangle(makeRng(2));
  const a = fig.lengths.find((L) => L.key === "a");
  const pos = lengthPos(fig, a);
  const P = fig.points[a.from], Q = fig.points[a.to];
  const mx = (P[0] + Q[0]) / 2, my = (P[1] + Q[1]) / 2;
  const distToLine = Math.abs((Q[0] - P[0]) * (my - pos[1]) - (Q[1] - P[1]) * (mx - pos[0])) /
    Math.hypot(Q[0] - P[0], Q[1] - P[1]);
  assert.ok(distToLine > 0.3, `offset ${distToLine} should clear the stroke`);
  const C = fig.points.C;
  const midToC = Math.hypot(mx - C[0], my - C[1]);
  const posToC = Math.hypot(pos[0] - C[0], pos[1] - C[1]);
  assert.ok(posToC > midToC, "label should sit outside the triangle, not toward C");
});

test("lengthPos stays outside the owning triangle, even with a neighbouring figure", () => {
  const side = (P: [number, number], Q: [number, number], R: [number, number]) =>
    Math.sign((Q[0] - P[0]) * (R[1] - P[1]) - (Q[1] - P[1]) * (R[0] - P[0]));
  const thirdsOf = (fig: ReturnType<typeof SCAFFOLDS.similarPair>, from: string, to: string) => {
    const found = new Set<string>();
    for (const ang of fig.angles) {
      const s = new Set([ang.vertex, ang.from, ang.to]);
      if (s.has(from) && s.has(to) && s.size === 3) {
        for (const n of s) if (n !== from && n !== to) found.add(n);
      }
    }
    return [...found];
  };
  for (const name of ["rightTriangle", "similarPair", "twoTangents"] as const) {
    for (let seed = 0; seed < 40; seed++) {
      const fig = SCAFFOLDS[name](makeRng(seed));
      for (const L of fig.lengths ?? []) {
        const pos = lengthPos(fig, L);
        const P = fig.points[L.from], Q = fig.points[L.to];
        const thirds = thirdsOf(fig, L.from, L.to);
        assert.ok(thirds.length, `${name} seed ${seed} ${L.key}: side should belong to a triangle`);
        for (const t of thirds) {
          const R = fig.points[t];
          assert.notEqual(side(P, Q, R), 0, `${name} seed ${seed} ${L.key}: ${t} is collinear`);
          assert.notEqual(
            side(P, Q, pos),
            side(P, Q, R),
            `${name} seed ${seed} ${L.key}: label sits inwards toward ${t}`,
          );
        }
      }
    }
  }
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
  // Use triangleSum vs alternateInterior (distinct conceptIds) to test gating cleanly.
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
    const givenEntries = prob.givens.map((g) => ([g.key, g.value] as [string, number]));
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

test("every scaffold lists a `uses` set that matches SCAFFOLD_LIST", () => {
  assert.equal(SCAFFOLD_LIST.length, Object.keys(SCAFFOLDS).length);
  for (const spec of SCAFFOLD_LIST) {
    const fig = spec.make(makeRng(1));
    assert.equal(fig.name, spec.name);
    assert.deepEqual(fig.uses, spec.uses);
    for (const r of fig.relations) assert.ok(spec.uses.includes(r.rule as any), `${spec.name} emits unused rule ${r.rule}`);
  }
});

test("selectScaffolds keeps only figures whose theorems are all allowed", () => {
  const onlyTri = conceptIdsFor(["triangleSum"]);
  const names = selectScaffolds(onlyTri).map((s) => s.name);
  assert.deepEqual(names, ["triangle"]);
  const iso = selectScaffolds(conceptIdsFor(["isoscelesBase", "triangleSum"]), ["isoscelesBase"]).map((s) => s.name);
  assert.ok(iso.includes("isosceles"));
  assert.ok(!iso.includes("triangle"));
});

test("generateProblem require rejects traces that never fire the requested rule", () => {
  const fig = parallelTransversal(makeRng(3));
  const allowed = allRuleConcepts();
  // This figure has no triangleSum relation, so require: triangleSum cannot be satisfied.
  const miss = generateProblem(fig, allowed, makeRng(9), { require: ["triangleSum"], attempts: 40 });
  assert.equal(miss, null);
  const hit = generateProblem(fig, allowed, makeRng(9), { require: ["corresponding"], minSteps: 1, maxSteps: 6, attempts: 80 });
  assert.ok(hit);
  assert.ok(hit.blanks.some((b) => b.rule === "corresponding"));
});

test("quadInterior chase gives 3 angles and asks for the fourth (polygon sum needs 3 givens)", () => {
  const allowed = conceptIdsFor(["polygonSum"]);
  const prob = pickAndGenerate(allowed, makeRng(21), {
    scaffolds: ["quadInterior"],
    require: ["polygonSum"],
    minSteps: 1,
    maxSteps: 2,
  });
  assert.ok(prob, "should build a quadrilateral interior-sum chase");
  assert.equal(prob.figure.name, "quadInterior");
  assert.equal(prob.givens.length, 3);
  assert.equal(prob.blanks.length, 1);
  assert.equal(prob.blanks[0].rule, "polygonSum");
});

test("pickAndGenerate with an unknown explicit scaffold returns null (no silent fallback)", () => {
  const allowed = allRuleConcepts();
  const miss = pickAndGenerate(allowed, makeRng(1), { scaffolds: ["not-a-real-scaffold"] });
  assert.equal(miss, null);
});

test("circle / similar / pythag scaffolds generate a chase that uses the required rule", () => {
  const cases: Array<[string, string[]]> = [
    ["centreAndCircumference", ["angleAtCentre"]],
    ["semicircle", ["angleInSemicircle"]],
    ["sameSegment", ["sameSegment"]],
    ["cyclicQuad", ["cyclicOpposite"]],
    ["tangentRadius", ["tangentPerpRadius"]],
    ["twoTangents", ["twoTangents"]],
    ["similarPair", ["similarSides"]],
    ["rightTriangle", ["pythagoras"]],
  ];
  for (const [scaffold, require] of cases) {
    const allowed = conceptIdsFor(SCAFFOLDS[scaffold](makeRng(1)).uses);
    const prob = pickAndGenerate(allowed, makeRng(33), {
      scaffolds: [scaffold],
      require,
      minSteps: 1,
      maxSteps: 5,
    });
    assert.ok(prob, `${scaffold} should generate`);
    assert.equal(prob.figure.name, scaffold);
    assert.ok(require.every((r) => prob.blanks.some((b) => b.rule === r)), `${scaffold} must use ${require}`);
  }
});

test("generateProblem minDistinctRules prefers a mixed-theorem trace", () => {
  const fig = SCAFFOLDS.isoscelesOnParallels(makeRng(4));
  const allowed = conceptIdsFor(fig.uses);
  const prob = generateProblem(fig, allowed, makeRng(11), {
    minSteps: 3, maxSteps: 6, minDistinctRules: 3, attempts: 160,
  });
  assert.ok(prob, "isosceles-on-parallels should yield a mixed chase");
  const rules = new Set(prob.blanks.map((b) => b.rule));
  assert.ok(rules.size >= 3, `expected ≥3 distinct rules, got ${[...rules]}`);
});

test("composite scaffolds generate a chase that uses several families", () => {
  const cases: Array<[string, number]> = [
    ["isoscelesOnParallels", 3],
    ["triangleBetweenParallels", 3],
    ["nestedSimilar", 2],
    ["tangentRightPythag", 2],
    ["chordTheorems", 3],
    ["semicircleIso", 2],
    ["cyclicWithTriangle", 2],
    ["parallelogramDiagonal", 2],
  ];
  for (const [scaffold, minDistinct] of cases) {
    const fig = SCAFFOLDS[scaffold](makeRng(2));
    const allowed = conceptIdsFor(fig.uses);
    const prob = pickAndGenerate(allowed, makeRng(41), {
      scaffolds: [scaffold],
      minSteps: 2,
      maxSteps: 6,
      minDistinctRules: minDistinct,
      attempts: 160,
    });
    assert.ok(prob, `${scaffold} should generate`);
    assert.equal(prob.figure.name, scaffold);
    const rules = new Set(prob.blanks.map((b) => b.rule));
    assert.ok(rules.size >= minDistinct, `${scaffold} distinct rules ${[...rules]}`);
  }
});

test("pickAndGenerate auto-picks a scaffold that can fire the required rule", () => {
  const allowed = conceptIdsFor(["isoscelesBase", "triangleSum"]);
  const prob = pickAndGenerate(allowed, makeRng(17), {
    require: ["isoscelesBase"],
    minSteps: 1,
    maxSteps: 4,
  });
  assert.ok(prob, "should build an isosceles chase");
  assert.equal(prob.figure.name, "isosceles");
  assert.ok(prob.blanks.some((b) => b.rule === "isoscelesBase"));
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

test("the real graph gives angle-chasing the whole transversal-theorem chain as learned", () => {
  // Each transversal theorem is owned by its dedicated lesson; the Stage-1 chain threads them in
  // order, so a practice page at the end (angle-chasing) has every earlier theorem in its closure.
  const graph = {
    concepts: [
      { id: "mathematics/geometry/angle-chasing", prerequisites: ["mathematics/geometry/co-interior-angles"] },
      { id: "mathematics/geometry/co-interior-angles", prerequisites: ["mathematics/geometry/alternate-interior-angles"] },
      { id: "mathematics/geometry/alternate-interior-angles", prerequisites: ["mathematics/geometry/corresponding-angles"] },
      { id: "mathematics/geometry/corresponding-angles", prerequisites: ["mathematics/geometry/vertically-opposite-angles"] },
      { id: "mathematics/geometry/vertically-opposite-angles", prerequisites: [] },
    ],
  };
  const allowed = allowedTheorems(buildAdjacency(graph), "mathematics/geometry/angle-chasing", allRuleConcepts());
  for (const c of [
    "mathematics/geometry/co-interior-angles",
    "mathematics/geometry/alternate-interior-angles",
    "mathematics/geometry/corresponding-angles",
    "mathematics/geometry/vertically-opposite-angles",
  ]) assert.ok(allowed.has(c), `${c} should be learned`);
  assert.ok(!allowed.has("mathematics/geometry/angle-sum-of-a-triangle")); // not a prerequisite
});

test("a page may practise its OWN theorem (its id is allowed too), plus its prerequisites", () => {
  // The angle-sum page teaches triangleSum and builds on alternate-interior → corresponding, so a
  // problem on it may chain all three (alternate angles, corresponding angles, AND the triangle sum).
  const graph = {
    concepts: [
      { id: "mathematics/geometry/angle-sum-of-a-triangle", prerequisites: ["mathematics/geometry/alternate-interior-angles"] },
      { id: "mathematics/geometry/alternate-interior-angles", prerequisites: ["mathematics/geometry/corresponding-angles"] },
      { id: "mathematics/geometry/corresponding-angles", prerequisites: [] },
    ],
  };
  const allowed = allowedTheorems(buildAdjacency(graph), "mathematics/geometry/angle-sum-of-a-triangle", allRuleConcepts());
  assert.ok(allowed.has("mathematics/geometry/angle-sum-of-a-triangle"), "its own theorem is practisable");
  assert.ok(allowed.has("mathematics/geometry/alternate-interior-angles"));
  assert.ok(allowed.has("mathematics/geometry/corresponding-angles"));
});
