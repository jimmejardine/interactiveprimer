// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { BASE_LEVEL, maxLevel, formatLevel } from "../js/levels.js";

test("BASE_LEVEL is 0", () => {
  assert.equal(BASE_LEVEL, 0);
});

test("maxLevel treats null as 'no level' and compares numerically", () => {
  assert.equal(maxLevel(null, null), null);
  assert.equal(maxLevel(2, null), 2);
  assert.equal(maxLevel(null, 3.5), 3.5);
  assert.equal(maxLevel(1, 7), 7);
  assert.equal(maxLevel(7, 2.5), 7);
  assert.equal(maxLevel(2.5, 2.4), 2.5);
});

test("formatLevel trims to at most two decimals", () => {
  assert.equal(formatLevel(2), "2");
  assert.equal(formatLevel(2.5), "2.5");
  assert.equal(formatLevel(2.333333), "2.33");
});
