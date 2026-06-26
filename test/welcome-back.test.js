// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { computeResume } from "../js/welcome-back.js";

/** isDone backed by a Set of completed ids. @param {string[]} ids */
const doneSet = (ids) => {
  const s = new Set(ids);
  return (/** @type {string} */ id) => s.has(id);
};

test("no members → null", () => {
  assert.equal(computeResume([], doneSet([])), null);
});

test("nothing done yet → resume at the first concept (course just selected)", () => {
  assert.deepEqual(computeResume(["a", "b", "c"], doneSet([])), { done: 0, total: 3, nextId: "a" });
});

test("fully done → null (course complete shows nothing)", () => {
  assert.equal(computeResume(["a", "b", "c"], doneSet(["a", "b", "c"])), null);
});

test("part-way → done/total and the first undone member", () => {
  assert.deepEqual(computeResume(["a", "b", "c", "d"], doneSet(["a"])), {
    done: 1,
    total: 4,
    nextId: "b",
  });
});

test("next is the FIRST undone in course order, even when later ones are done", () => {
  // a and c done, b and d not → next must be b (course order), not d.
  assert.deepEqual(computeResume(["a", "b", "c", "d"], doneSet(["a", "c"])), {
    done: 2,
    total: 4,
    nextId: "b",
  });
});

test("one of many done → resumes at the second member", () => {
  const members = ["m1", "m2", "m3", "m4", "m5"];
  assert.deepEqual(computeResume(members, doneSet(["m1"])), { done: 1, total: 5, nextId: "m2" });
});
