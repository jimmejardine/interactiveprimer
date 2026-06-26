// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import {
  clampStep,
  createStepCollector,
  applyStepVisibility,
  chevronArrowheads,
  quadrantOf,
  quadrantWedges,
  tickSegments,
  angleArcSpec,
} from "../js/geometry.js";

const D = Math.PI / 180;
/** @param {number} a @param {number} b */
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

/* ----------------------------- clampStep ----------------------------- */

test("clampStep clamps into [0, stepCount] and rounds", () => {
  assert.equal(clampStep(-3, 4), 0);
  assert.equal(clampStep(0, 4), 0);
  assert.equal(clampStep(2, 4), 2);
  assert.equal(clampStep(4, 4), 4);
  assert.equal(clampStep(9, 4), 4);
  assert.equal(clampStep(2.4, 4), 2);
});

test("clampStep treats non-finite as 0", () => {
  assert.equal(clampStep(NaN, 4), 0);
  assert.equal(clampStep(Infinity, 4), 0);
});

/* ------------------------- createStepCollector ----------------------- */

/** A minimal board stand-in: drawFns push fake elements onto objectsList. */
function fakeBoard() {
  return { objectsList: /** @type {any[]} */ ([]) };
}
/** @param {{objectsList: any[]}} board @param {number} n @param {boolean} [visible] */
function add(board, n, visible = true) {
  for (let i = 0; i < n; i++) board.objectsList.push({ id: board.objectsList.length, visProp: { visible }, setAttribute() {} });
}

test("createStepCollector captures each step's elements with their intended visibility", () => {
  const board = fakeBoard();
  add(board, 3); // base elements (created outside any step)
  const { step, steps } = createStepCollector(board);
  step("one", () => {
    add(board, 2); // visible
    add(board, 1, false); // a hidden helper (e.g. an auto endpoint)
  });
  step("two", () => add(board, 1));
  assert.equal(steps.length, 2);
  assert.deepEqual(
    steps.map((s) => s.caption),
    ["one", "two"],
  );
  assert.equal(steps[0].els.length, 3); // the 3 created in step "one" — base excluded
  assert.deepEqual(
    steps[0].els.map((e) => e.vis),
    [true, true, false], // intended visibility captured
  );
  assert.equal(steps[1].els.length, 1);
});

/* ------------------------- applyStepVisibility ----------------------- */

/** A fake element recording its last visible value. */
function fakeEl() {
  return {
    /** @type {boolean | undefined} */
    visible: undefined,
    /** @param {{visible: boolean}} a */
    setAttribute(a) {
      this.visible = a.visible;
    },
  };
}

test("applyStepVisibility reveals step i iff i < current, honouring intended visibility", () => {
  const a = fakeEl();
  const b = fakeEl();
  const helper = fakeEl(); // a deliberately-hidden element in step 1
  const c = fakeEl();
  const steps = [
    { caption: "a", els: [{ el: a, vis: true }] },
    { caption: "b", els: [{ el: b, vis: true }, { el: helper, vis: false }] },
    { caption: "c", els: [{ el: c, vis: true }] },
  ];

  applyStepVisibility(steps, 0); // nothing revealed
  assert.equal(a.visible, false);
  assert.equal(b.visible, false);
  assert.equal(c.visible, false);

  applyStepVisibility(steps, 2); // steps 0 and 1 revealed, step 2 hidden
  assert.equal(a.visible, true);
  assert.equal(b.visible, true);
  assert.equal(helper.visible, false); // revealed step, but intended-hidden → stays hidden
  assert.equal(c.visible, false);

  applyStepVisibility(steps, 3); // all revealed
  assert.equal(c.visible, true);
});

/* ------------------------- geometry-tool math ------------------------- */

test("chevronArrowheads: one chevron is two strokes meeting at a tip ahead along `along`", () => {
  const segs = chevronArrowheads(0, 0, [1, 0], 1, { len: 0.2, spread: 0.6 });
  assert.equal(segs.length, 2); // two arms
  // both arms start at the tip (ahead, +x); they fan back-and-out symmetrically in ±y
  near(segs[0][0][0], 0.1); // tip x
  near(segs[1][0][0], 0.1);
  near(segs[0][0][1], 0); // tip y
  near(segs[0][1][0], -0.1); // back x
  near(segs[0][1][1], 0.12); // +y arm
  near(segs[1][1][1], -0.12); // −y arm
});

test("chevronArrowheads: a double mark is two stacked chevrons (4 strokes), the 2nd behind the 1st", () => {
  const segs = chevronArrowheads(0, 0, [1, 0], 2, { len: 0.2, gap: 0.16 });
  assert.equal(segs.length, 4);
  // second chevron's tip is one `gap` behind the first along −x
  near(segs[2][0][0], 0.1 - 0.16);
});

test("quadrantOf classifies a direction into its screen corner", () => {
  assert.equal(quadrantOf(45 * D), "ur");
  assert.equal(quadrantOf(135 * D), "ul");
  assert.equal(quadrantOf(225 * D), "ll");
  assert.equal(quadrantOf(315 * D), "lr");
  assert.equal(quadrantOf(-45 * D), "lr"); // negative angles normalise
});

test("quadrantWedges: a horizontal line + a steep transversal gives four distinct corners", () => {
  const TU = /** @type {[number, number]} */ ([0.5547, 0.8321]);
  const w = quadrantWedges([1, 0], TU);
  assert.equal(w.length, 4);
  const corners = new Set(w.map((x) => x.corner));
  assert.deepEqual([...corners].sort(), ["ll", "lr", "ul", "ur"]);
  // the up-right wedge (between the horizontal and the transversal) bisects at half the t angle
  const ur = w.find((x) => x.corner === "ur");
  if (!ur) throw new Error("no ur wedge");
  near(Math.atan2(ur.bisector[1], ur.bisector[0]) / D, Math.atan2(TU[1], TU[0]) / D / 2);
});

test("quadrantWedges: perpendicular axes bisect at the 45° diagonals", () => {
  const w = quadrantWedges([1, 0], [0, 1]);
  const ur = w.find((x) => x.corner === "ur");
  if (!ur) throw new Error("no ur wedge");
  near(Math.atan2(ur.bisector[1], ur.bisector[0]) / D, 45);
});

/* --------------------------- tickSegments ---------------------------- */

test("tickSegments: a single tick is a stroke PERPENDICULAR to the side at its midpoint", () => {
  // Side along +x at midpoint (2,1): the hatch runs along ±y.
  const segs = tickSegments(2, 1, [1, 0], 1, { d: 0.16 });
  assert.equal(segs.length, 1);
  near(segs[0][0][0], 2);
  near(segs[0][1][0], 2);
  near(segs[0][0][1], 0.84);
  near(segs[0][1][1], 1.16);
});

test("tickSegments: a double tick is two parallel hatches offset ALONG the side", () => {
  const segs = tickSegments(0, 0, [1, 0], 2, { d: 0.1, gap: 0.2 });
  assert.equal(segs.length, 2);
  near(segs[0][0][0], -0.1); // centres at x = ∓0.1 along the side
  near(segs[1][0][0], 0.1);
});

/* --------------------------- angleArcSpec ---------------------------- */

test("angleArcSpec: bisector of a right angle at the origin points along the 45° diagonal", () => {
  const s = angleArcSpec([0, 0], [1, 0], [0, 1], 1, { r: 0.5, labelR: 1 });
  near(Math.atan2(s.bisector[1], s.bisector[0]) / D, 45);
  near(s.labelAt[0], Math.SQRT1_2);
  near(s.labelAt[1], Math.SQRT1_2);
});

test("angleArcSpec: count gives that many concentric radii, gap apart", () => {
  const s = angleArcSpec([0, 0], [1, 0], [0, 1], 3, { r: 0.5, gap: 0.1 });
  assert.deepEqual(
    s.radii.map((r) => Math.round(r * 100) / 100),
    [0.5, 0.6, 0.7],
  );
});
