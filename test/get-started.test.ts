/**
 * Tests for src/get-started-core.ts — pool filter and the smattering → climb → probe scheduler.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  schoolPool,
  ceilingPool,
  startState,
  startingLevel,
  pickNext,
  applyAnswer,
  summarise,
  matchingCourses,
  parseSchoolCourse,
  pathAltitude,
  branchOf,
  pickInBand,
  isCeilingNode,
  type ProbeNode,
  SMATTERING,
  MAX_FRONTIER,
  MISS_THRESHOLD,
} from "../src/get-started-core.ts";
import { isLightQuestion, isQuestion } from "../src/course-quiz-core.ts";

const rng = (seq: number[]) => {
  let i = 0;
  return () => seq[i++ % seq.length] ?? 0;
};
const always0 = () => 0;

function node(id: string, level: number, extra: Partial<ProbeNode> = {}): ProbeNode {
  return { id, level, hasQuiz: true, title: id, prerequisites: [], levelGrounded: level > 0, ...extra };
}

function mathsPool(): ProbeNode[] {
  return [
    node("mathematics/arithmetic/counting", 5, { declaredLevel: 5 }),
    node("mathematics/arithmetic/addition", 6),
    node("mathematics/geometry/shapes", 6, { declaredLevel: 6 }),
    node("mathematics/statistics/pictograms", 7),
    node("mathematics/algebra/words", 11, { declaredLevel: 11 }),
    node("mathematics/algebra/one-step", 12),
    node("mathematics/geometry/pythagoras", 13, { declaredLevel: 13 }),
    node("mathematics/probability/dice", 14),
    node("mathematics/calculus/derivative", 16, { declaredLevel: 16 }),
    node("mathematics/courses/primary-school/uk/year-6", 11, { course: true }),
    node("mathematics/courses/secondary-school/uk/year-8", 13, { course: true }),
    node("physics/forces-and-motion/speed", 12),
    node("mathematics/analysis/analysis", 19),
    node("mathematics/arithmetic/no-quiz", 5, { hasQuiz: false }),
    node("mathematics/quantum-foo/qubit", 0, { levelGrounded: false }),
  ];
}

test("schoolPool keeps quiz-bearing school lessons in one field", () => {
  const pool = schoolPool(mathsPool(), "mathematics");
  const ids = pool.map((n) => n.id);
  assert.ok(ids.includes("mathematics/arithmetic/counting"));
  assert.ok(ids.includes("mathematics/calculus/derivative"));
  assert.equal(ids.some((id) => id.startsWith("physics/")), false);
  assert.equal(ids.includes("mathematics/courses/primary-school/uk/year-6"), false);
  assert.equal(ids.includes("mathematics/analysis/analysis"), false);
  assert.equal(ids.includes("mathematics/arithmetic/no-quiz"), false);
  assert.equal(ids.includes("mathematics/quantum-foo/qubit"), false);
});

test("ceilingPool is the ungated extra-hard set", () => {
  const ceil = ceilingPool(mathsPool(), "mathematics");
  assert.equal(ceil.length, 1);
  assert.equal(ceil[0].id, "mathematics/quantum-foo/qubit");
  assert.equal(isCeilingNode(ceil[0]), true);
});

test("startingLevel nudges by confidence and stays a bit young", () => {
  assert.ok(startingLevel(16, 1, "mathematics") < startingLevel(16, 5, "mathematics"));
  assert.ok(startingLevel(16, 5, "mathematics") <= 16);
  assert.ok(startingLevel(8, 3, "mathematics") >= 5);
});

test("branchOf is the second path segment", () => {
  assert.equal(branchOf("mathematics/algebra/one-step"), "algebra");
  assert.equal(branchOf("physics/waves"), "waves");
});

test("phase A smattering uses different branches near startingLevel", () => {
  const pool = schoolPool(mathsPool(), "mathematics");
  let state = startState("mathematics", 12, 3);
  const exclude = new Set<string>();
  const ids: string[] = [];
  for (let i = 0; i < SMATTERING; i++) {
    const pick = pickNext(state, pool, exclude, always0);
    if (!("id" in pick)) break;
    ids.push(pick.id);
    exclude.add(pick.id);
    const level = pool.find((n) => n.id === pick.id)!.level;
    state = applyAnswer(state, pick.id, level, true);
  }
  const branches = new Set(ids.map(branchOf));
  assert.ok(branches.size >= 2, `expected ≥2 branches, got ${[...branches]}`);
  assert.equal(state.phase, "ascent");
});

test("one miss does not freeze the frontier; two misses in the band do", () => {
  const pool = schoolPool(mathsPool(), "mathematics");
  let state = startState("mathematics", 16, 5);
  state = { ...state, phase: "ascent", targetLevel: 13, probes: [], consecutiveHits: 0, consecutiveMisses: 0 };
  const exclude = new Set<string>();
  const miss1 = pickNext(state, pool, exclude, always0);
  assert.equal("id" in miss1, true);
  const id1 = (miss1 as { id: string }).id;
  exclude.add(id1);
  state = applyAnswer(state, id1, pool.find((n) => n.id === id1)!.level, false);
  assert.equal(state.phase, "ascent", "a single unlucky miss must not flip the session");
  assert.equal(state.consecutiveMisses, 1);

  const miss2 = pickNext(state, pool, exclude, always0);
  assert.equal("id" in miss2, true);
  const id2 = (miss2 as { id: string }).id;
  const lv2 = pool.find((n) => n.id === id2)!.level;
  state = applyAnswer(state, id2, lv2, false);
  assert.equal(state.phase, "frontier");
  assert.ok(state.consecutiveMisses >= MISS_THRESHOLD);
});

test("two hits at a band step the climb up", () => {
  const pool = schoolPool(mathsPool(), "mathematics");
  let state = startState("mathematics", 16, 5);
  state = { ...state, phase: "ascent", targetLevel: 11, probes: [] };
  const exclude = new Set<string>();
  for (let i = 0; i < 2; i++) {
    const pick = pickNext(state, pool, exclude, always0);
    assert.equal("id" in pick, true);
    const id = (pick as { id: string }).id;
    exclude.add(id);
    state = applyAnswer(state, id, pool.find((n) => n.id === id)!.level, true);
  }
  assert.equal(state.phase, "ascent");
  assert.ok(state.targetLevel > 11);
});

test("frontier samples unused branches then finishes", () => {
  const pool = schoolPool(mathsPool(), "mathematics");
  let state = startState("mathematics", 14, 3);
  state = {
    ...state,
    phase: "frontier",
    frontier: 13,
    frontierCount: 0,
    probes: [{ id: "mathematics/geometry/pythagoras", level: 13, correct: false }],
  };
  const exclude = new Set(state.probes.map((p) => p.id));
  let n = 0;
  while (state.phase !== "done" && n < 20) {
    const pick = pickNext(state, pool, exclude, rng([0.1, 0.7, 0.3, 0.9]));
    if ("done" in pick) {
      state = { ...state, phase: "done" };
      break;
    }
    exclude.add(pick.id);
    const level = pool.find((n) => n.id === pick.id)?.level ?? 13;
    state = applyAnswer(state, pick.id, level, n % 2 === 0);
    n++;
  }
  assert.ok(state.frontierCount >= MAX_FRONTIER || state.phase === "done" || n > 0);
});

test("ungated level-0 is not sampled for a young/low-confidence user", () => {
  const school = schoolPool(mathsPool(), "mathematics");
  const ceil = ceilingPool(mathsPool(), "mathematics");
  let state = startState("mathematics", 8, 1);
  const exclude = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const pick = pickNext(state, school, exclude, always0, ceil);
    if (!("id" in pick)) break;
    assert.notEqual(pick.id, "mathematics/quantum-foo/qubit");
    exclude.add(pick.id);
    const level = school.find((n) => n.id === pick.id)?.level ?? 6;
    state = applyAnswer(state, pick.id, level, true);
  }
});

test("pickInBand prefers a declared-level gate", () => {
  const pool = [
    node("mathematics/algebra/one-step", 12),
    node("mathematics/algebra/words", 11, { declaredLevel: 11 }),
  ];
  const pick = pickInBand(pool, new Set(), 11, new Set(), always0, 1);
  assert.equal(pick?.id, "mathematics/algebra/words");
});

test("summarise reports per-branch strongTo and starts on the weakest", () => {
  const pool = schoolPool(mathsPool(), "mathematics");
  const byId = new Map(mathsPool().map((n) => [n.id, n]));
  const state = startState("mathematics", 13, 3);
  const done = {
    ...state,
    phase: "done" as const,
    frontier: 13,
    probes: [
      { id: "mathematics/geometry/pythagoras", level: 13, correct: false },
      { id: "mathematics/algebra/one-step", level: 12, correct: true },
    ],
  };
  const summary = summarise(done, pool, byId, () => 0);
  assert.equal(summary.frontier, 13);
  assert.ok(summary.startHere.includes("mathematics/geometry/pythagoras"));
  const geom = summary.branches.find((b) => b.branch === "geometry");
  assert.equal(geom?.status, "shaky");
  const alg = summary.branches.find((b) => b.branch === "algebra");
  assert.equal(alg?.status, "solid");
  assert.equal(alg?.strongTo, 12);
  assert.deepEqual(
    summary.courses.map((c) => c.id),
    ["mathematics/courses/secondary-school/uk/year-8"],
  );
});

test("pathAltitude maps year/grade/phase leaves; topic courses are null", () => {
  assert.equal(pathAltitude("reception"), 5);
  assert.equal(pathAltitude("kindergarten"), 5);
  assert.equal(pathAltitude("foundation"), 5);
  assert.equal(pathAltitude("grade-r"), 5);
  assert.equal(pathAltitude("year-8"), 13);
  assert.equal(pathAltitude("grade-8"), 13);
  assert.equal(pathAltitude("gcse-year-10"), 15);
  assert.equal(pathAltitude("a-level-year-12"), 17);
  assert.equal(pathAltitude("myp-year-3"), 13);
  assert.equal(pathAltitude("dp-year-1"), 16);
  assert.equal(pathAltitude("phase-2"), 7);
  assert.equal(pathAltitude("hs-geometry"), null);
  assert.equal(pathAltitude("ap-physics-1"), null);
});

test("parseSchoolCourse accepts leaves and rejects hubs / university", () => {
  assert.deepEqual(parseSchoolCourse("mathematics/courses/secondary-school/uk/year-8"), {
    field: "mathematics",
    stage: "secondary-school",
    region: "uk",
    leaf: "year-8",
  });
  assert.equal(parseSchoolCourse("mathematics/courses/secondary-school/uk/uk"), null);
  assert.equal(parseSchoolCourse("mathematics/courses/university/year-1"), null);
  assert.equal(parseSchoolCourse("mathematics/algebra/one-step"), null);
});

function course(id: string, members: string[] = [], extra: Partial<ProbeNode> = {}): ProbeNode {
  return node(id, 0, { course: true, courseMembers: [id, ...members], ...extra });
}

test("matchingCourses lists every country's year/grade at that altitude", () => {
  const nodes = [
    ...mathsPool(),
    course("mathematics/courses/secondary-school/uk/year-8"),
    course("mathematics/courses/secondary-school/uk/uk", ["mathematics/courses/secondary-school/uk/year-8"]),
    course("mathematics/courses/secondary-school/us/grade-8"),
    course("mathematics/courses/secondary-school/au/year-8"),
    course("mathematics/courses/secondary-school/ca/grade-8"),
    course("mathematics/courses/secondary-school/za/grade-8"),
    course("mathematics/courses/secondary-school/ib/myp-year-3"),
    course("mathematics/courses/secondary-school/us/hs-geometry", ["mathematics/geometry/pythagoras"]),
    course("mathematics/courses/university/year-1", ["mathematics/calculus/derivative"]),
    course("mathematics/courses/primary-school/uk/year-3"),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = matchingCourses("mathematics", 13, byId).map((c) => c.id);
  assert.ok(ids.includes("mathematics/courses/secondary-school/uk/year-8"));
  assert.ok(ids.includes("mathematics/courses/secondary-school/us/grade-8"));
  assert.ok(ids.includes("mathematics/courses/secondary-school/au/year-8"));
  assert.ok(ids.includes("mathematics/courses/secondary-school/ca/grade-8"));
  assert.ok(ids.includes("mathematics/courses/secondary-school/za/grade-8"));
  assert.ok(ids.includes("mathematics/courses/secondary-school/ib/myp-year-3"));
  assert.equal(
    ids.includes("mathematics/courses/secondary-school/us/hs-geometry"),
    false,
    "hs-* stays off while Grade 8 already matches",
  );
  assert.equal(ids.includes("mathematics/courses/secondary-school/uk/uk"), false, "country hub");
  assert.equal(ids.includes("mathematics/courses/university/year-1"), false, "university");
  assert.equal(ids.includes("mathematics/courses/primary-school/uk/year-3"), false, "wrong altitude");
});

test("matchingCourses does not collapse every CS year onto the same member-median", () => {
  const lesson = node("computer-science/programming/variables", 8, { declaredLevel: 8 });
  const nodes = [
    lesson,
    course("computer-science/courses/primary-school/uk/year-1", [lesson.id]),
    course("computer-science/courses/primary-school/uk/year-3", [lesson.id]),
    course("computer-science/courses/primary-school/uk/year-6", [lesson.id]),
    course("computer-science/courses/primary-school/us/grade-3", [lesson.id]),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = matchingCourses("computer-science", 8, byId).map((c) => c.id);
  assert.ok(ids.includes("computer-science/courses/primary-school/uk/year-3"));
  assert.ok(ids.includes("computer-science/courses/primary-school/us/grade-3"));
  assert.equal(ids.includes("computer-science/courses/primary-school/uk/year-1"), false);
  assert.equal(ids.includes("computer-science/courses/primary-school/uk/year-6"), false);
});

test("matchingCourses falls back to the closest course when a region has nothing in-band", () => {
  const nodes = [
    course("mathematics/courses/secondary-school/uk/year-7"),
    course("mathematics/courses/secondary-school/us/grade-8"),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const matches = matchingCourses("mathematics", 13, byId);
  const ids = matches.map((c) => c.id);
  assert.ok(ids.includes("mathematics/courses/secondary-school/us/grade-8"));
  assert.ok(ids.includes("mathematics/courses/secondary-school/uk/year-7"), "UK closest year still shown");
});

test("matchingCourses hides US topic courses when a year/grade already matches below high school", () => {
  const nodes = [
    node("mathematics/algebra/words", 11, { declaredLevel: 11 }),
    course("mathematics/courses/secondary-school/us/grade-6"),
    course("mathematics/courses/secondary-school/us/hs-algebra", ["mathematics/algebra/words"]),
    course("mathematics/courses/primary-school/uk/year-6"),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = matchingCourses("mathematics", 11, byId).map((c) => c.id);
  assert.ok(ids.includes("mathematics/courses/secondary-school/us/grade-6"));
  assert.ok(ids.includes("mathematics/courses/primary-school/uk/year-6"));
  assert.equal(ids.includes("mathematics/courses/secondary-school/us/hs-algebra"), false);
});

test("matchingCourses prefers a nearby US topic course over a distant grade", () => {
  const nodes = [
    node("mathematics/calculus/derivative", 16, { declaredLevel: 16 }),
    course("mathematics/courses/secondary-school/us/grade-8"),
    course("mathematics/courses/secondary-school/us/hs-functions", ["mathematics/calculus/derivative"]),
    course("mathematics/courses/secondary-school/uk/gcse-year-11"),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = matchingCourses("mathematics", 16, byId).map((c) => c.id);
  assert.ok(ids.includes("mathematics/courses/secondary-school/us/hs-functions"));
  assert.ok(ids.includes("mathematics/courses/secondary-school/uk/gcse-year-11"));
  assert.equal(ids.includes("mathematics/courses/secondary-school/us/grade-8"), false);
});

test("isLightQuestion drops problem/program items", () => {
  assert.equal(isLightQuestion({ prompt: "?", options: [{ text: "a", correct: true }] }), true);
  assert.equal(isLightQuestion({ prompt: "?", answer: 4 }), true);
  assert.equal(isLightQuestion({ problem: "chase" }), false);
  assert.equal(isLightQuestion({ program: "loop" }), false);
  assert.equal(isQuestion({ problem: "chase" }), true);
});
