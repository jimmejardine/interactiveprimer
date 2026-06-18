// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import {
  clampStep,
  createStepCollector,
  applyStepVisibility,
  chevronSegments,
  quadrantOf,
  quadrantWedges,
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

test("chevronSegments: one mark is a short stroke centred on the point along `along`", () => {
  const segs = chevronSegments(2, 1, [1, 0], 1, { d: 0.16 });
  assert.equal(segs.length, 1);
  assert.deepEqual(segs[0], [
    [1.84, 1],
    [2.16, 1],
  ]);
});

test("chevronSegments: a double tick is two strokes offset by ±gap/2 along the line", () => {
  const segs = chevronSegments(0, 0, [0, 1], 2, { d: 0.16, gap: 0.2 });
  assert.equal(segs.length, 2);
  // centres at y = -0.1 and +0.1, each ±0.16 in y
  near(segs[0][0][1], -0.26);
  near(segs[0][1][1], 0.06);
  near(segs[1][0][1], -0.06);
  near(segs[1][1][1], 0.26);
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
