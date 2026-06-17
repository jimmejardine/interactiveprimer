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
/** @param {{objectsList: any[]}} board @param {number} n */
function add(board, n) {
  for (let i = 0; i < n; i++) board.objectsList.push({ id: board.objectsList.length, setAttribute() {} });
}

test("createStepCollector captures only the elements each step creates", () => {
  const board = fakeBoard();
  add(board, 3); // base elements (created outside any step)
  const { step, steps } = createStepCollector(board);
  step("one", () => add(board, 2));
  step("two", () => add(board, 1));
  assert.equal(steps.length, 2);
  assert.deepEqual(
    steps.map((s) => s.caption),
    ["one", "two"],
  );
  assert.equal(steps[0].els.length, 2); // the 2 created in step "one" — base excluded
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

test("applyStepVisibility reveals step i iff i < current", () => {
  const s0 = [fakeEl()];
  const s1 = [fakeEl(), fakeEl()];
  const s2 = [fakeEl()];
  const steps = [
    { caption: "a", els: s0 },
    { caption: "b", els: s1 },
    { caption: "c", els: s2 },
  ];

  applyStepVisibility(steps, 0); // nothing revealed
  assert.equal(s0[0].visible, false);
  assert.equal(s1[0].visible, false);
  assert.equal(s2[0].visible, false);

  applyStepVisibility(steps, 2); // steps 0 and 1 revealed, step 2 hidden
  assert.equal(s0[0].visible, true);
  assert.equal(s1[0].visible, true);
  assert.equal(s1[1].visible, true);
  assert.equal(s2[0].visible, false);

  applyStepVisibility(steps, 3); // all revealed
  assert.equal(s2[0].visible, true);
});
