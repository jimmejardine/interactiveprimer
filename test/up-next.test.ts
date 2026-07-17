import test from "node:test";
import assert from "node:assert/strict";
import { computeUpNext, MAX_NEARBY } from "../src/up-next.ts";

/** starsOf where every id in `ids` has `n` stars (default 10 = mastered), the rest 0. */
const starsSet = (ids: string[], n: number = 10) => {
  const s = new Set(ids);
  return (id: string) => (s.has(id) ? n : 0);
};

/** starsOf from an explicit id→stars map (missing → 0). */
const starsMap = (m: Record<string, number>) => (id: string) => m[id] ?? 0;

/** levelOf from a plain map (missing → 0). */
const levelOf = (levels: Record<string, number>) => (id: string) => levels[id] ?? 0;

/** titleOf: identity is fine for deterministic tiebreaks in tests. */
const titleOf = (id: string) => id;

const ids = (items: Array<{ id: string, kind: string }>) => items.map((i) => i.id);

test("not in a course → up to three unstarred successors, closest in difficulty", () => {
  // current at level 2; successors spread around it, all unrated.
  const items = computeUpNext({
    currentId: "cur",
    courseMembers: null,
    successors: ["s0", "s1", "s2", "s3"],
    starsOf: starsSet([]),
    levelOf: levelOf({ cur: 2, s0: 5, s1: 3, s2: 2, s3: 4 }),
    titleOf,
  });
  // distances: s2=0, s1=1, s3=2, s0=3 → nearest three are s2, s1, s3.
  assert.equal(items.length, MAX_NEARBY);
  assert.deepEqual(ids(items), ["s2", "s1", "s3"]);
  assert.ok(items.every((i) => i.kind === "nearby"));
});

test("nearby excludes the current concept and already-starred successors", () => {
  const items = computeUpNext({
    currentId: "cur",
    courseMembers: null,
    successors: ["cur", "done1", "fresh1", "fresh2"],
    starsOf: starsSet(["done1"]),
    levelOf: levelOf({ cur: 1, fresh1: 1, fresh2: 2 }),
    titleOf,
  });
  assert.deepEqual(ids(items), ["fresh1", "fresh2"]);
});

test("fewer than three eligible successors → returns only those", () => {
  const items = computeUpNext({
    currentId: "cur",
    courseMembers: null,
    successors: ["a"],
    starsOf: starsSet([]),
    levelOf: levelOf({ cur: 0, a: 1 }),
    titleOf,
  });
  assert.deepEqual(ids(items), ["a"]);
});

test("no successors and no course → empty (control falls back to the mini-explorer)", () => {
  const items = computeUpNext({
    currentId: "cur",
    courseMembers: null,
    successors: [],
    starsOf: starsSet([]),
    levelOf: levelOf({}),
    titleOf,
  });
  assert.deepEqual(items, []);
});

test("equal difficulty distance → tiebreak by absolute level, then title", () => {
  // s_low and s_high are both distance 1 from cur (level 3); lower absolute level wins first.
  const items = computeUpNext({
    currentId: "cur",
    courseMembers: null,
    successors: ["s_high", "s_low", "s_tieB", "s_tieA"],
    starsOf: starsSet([]),
    // s_low=2 (dist1), s_high=4 (dist1), s_tieA=s_tieB=4 (dist1) → order: s_low(2), then level-4 group by title
    levelOf: levelOf({ cur: 3, s_low: 2, s_high: 4, s_tieA: 4, s_tieB: 4 }),
    titleOf,
  });
  assert.deepEqual(ids(items), ["s_low", "s_high", "s_tieA"]); // level 2 first; then 4s by title A<B<high
});

test("course: next is the first UNSTARRED member after the current concept", () => {
  const members = ["hub", "m1", "m2", "m3", "m4"];
  const items = computeUpNext({
    currentId: "m1",
    courseMembers: members,
    successors: [],
    starsOf: starsSet(["m1", "m2"]), // m2 already starred → next should skip to m3
    levelOf: levelOf({}),
    titleOf,
  });
  assert.deepEqual(items, [{ id: "m3", kind: "next" }]);
});

test("course: skipped appears only when an unstarred member is genuinely earlier", () => {
  const members = ["hub", "m1", "m2", "m3"];
  // On m3; m1 unstarred and earlier → skipped=m1. m2 also earlier+unstarred but skipped is the EARLIEST.
  const items = computeUpNext({
    currentId: "m3",
    courseMembers: members,
    successors: [],
    starsOf: starsSet(["hub", "m3"]),
    levelOf: levelOf({}),
    titleOf,
  });
  // skipped = earliest unstarred before m3 = m1; no member after m3 → no "next".
  assert.deepEqual(items, [{ id: "m1", kind: "skipped" }]);
});

test("course: no skip when the earliest unstarred is the current or a later member", () => {
  const members = ["hub", "m1", "m2", "m3"];
  // hub+m1 done; on m2. Earliest unstarred overall is m2 (the current) → not before → no skipped.
  const items = computeUpNext({
    currentId: "m2",
    courseMembers: members,
    successors: [],
    starsOf: starsSet(["hub", "m1"]),
    levelOf: levelOf({}),
    titleOf,
  });
  // next = first unstarred after m2 = m3; no skipped.
  assert.deepEqual(items, [{ id: "m3", kind: "next" }]);
});

test("course + nearby combine and dedupe (a successor already offered as 'next' isn't repeated)", () => {
  const members = ["hub", "m1", "m2", "m3"];
  const items = computeUpNext({
    currentId: "m1",
    courseMembers: members,
    successors: ["m2", "x"], // m2 is the course-next AND a successor → must appear once, as "next"
    starsOf: starsSet(["hub", "m1"]),
    levelOf: levelOf({ m1: 1, m2: 1, x: 2 }),
    titleOf,
  });
  assert.deepEqual(items, [
    { id: "m2", kind: "next" },
    { id: "x", kind: "nearby" },
  ]);
});

test("course: the hub page (members[0]) is never suggested, even when unstarred", () => {
  const members = ["hub", "m1", "m2"];
  // Only m1 done; hub + m2 unstarred. Earliest unstarred overall is the hub, but it must be skipped
  // as a candidate — so no "skipped", and "next" is the first unstarred after m1 = m2.
  const items = computeUpNext({
    currentId: "m1",
    courseMembers: members,
    successors: [],
    starsOf: starsSet(["m1"]),
    levelOf: levelOf({}),
    titleOf,
  });
  assert.deepEqual(items, [{ id: "m2", kind: "next" }]);
});

test("review fallback: when no unstarred successor qualifies, offer partly-learned (1..5 stars) ones", () => {
  const items = computeUpNext({
    currentId: "cur",
    courseMembers: null,
    successors: ["s_master", "s_rev1", "s_rev2"],
    // s_master=8 (mastered, excluded); s_rev1=3, s_rev2=5 (both partly learned) → review tier.
    starsOf: starsMap({ s_master: 8, s_rev1: 3, s_rev2: 5 }),
    levelOf: levelOf({ cur: 2, s_rev1: 2, s_rev2: 4, s_master: 2 }),
    titleOf,
  });
  // s_rev1 (dist 0) before s_rev2 (dist 2); s_master excluded (>5 stars).
  assert.deepEqual(items, [
    { id: "s_rev1", kind: "review" },
    { id: "s_rev2", kind: "review" },
  ]);
});

test("review fallback does NOT fire when an unstarred successor is available", () => {
  const items = computeUpNext({
    currentId: "cur",
    courseMembers: null,
    successors: ["s_fresh", "s_partial"],
    starsOf: starsMap({ s_partial: 3 }), // s_fresh unrated → nearby wins, no review tier
    levelOf: levelOf({ cur: 1, s_fresh: 1, s_partial: 1 }),
    titleOf,
  });
  assert.deepEqual(items, [{ id: "s_fresh", kind: "nearby" }]);
});

test("review fallback excludes mastered successors (> 5 stars) → empty (then the control falls back)", () => {
  const items = computeUpNext({
    currentId: "cur",
    courseMembers: null,
    successors: ["s_master1", "s_master2"],
    starsOf: starsMap({ s_master1: 6, s_master2: 10 }),
    levelOf: levelOf({ cur: 1, s_master1: 1, s_master2: 1 }),
    titleOf,
  });
  assert.deepEqual(items, []);
});

test("current concept not a member of the active course → course rules skipped, nearby still applies", () => {
  const items = computeUpNext({
    currentId: "outsider",
    courseMembers: ["hub", "m1", "m2"],
    successors: ["s1"],
    starsOf: starsSet([]),
    levelOf: levelOf({ outsider: 0, s1: 1 }),
    titleOf,
  });
  assert.deepEqual(items, [{ id: "s1", kind: "nearby" }]);
});
