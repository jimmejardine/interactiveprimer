// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { clampStep, createStepCollector, applyStepVisibility } from "../js/geometry.js";

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
