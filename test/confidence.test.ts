import test from "node:test";
import assert from "node:assert/strict";
import { combineRating } from "../src/confidence.ts";

const MAX = 10;

test("with no stars yet (rating 0), uses the test percentage alone", () => {
  assert.equal(combineRating(0, 0.8, MAX), 8);
  assert.equal(combineRating(0, 1, MAX), 10);
  assert.equal(combineRating(0, 0, MAX), 0);
  assert.equal(combineRating(0, 2 / 3, MAX), 7); // 6.67 → 7
});

test("with existing stars, averages current and test percentage", () => {
  assert.equal(combineRating(4, 1, MAX), 7); // (4 + 10) / 2
  assert.equal(combineRating(4, 0, MAX), 2); // (4 + 0) / 2
  assert.equal(combineRating(6, 0.8, MAX), 7); // (6 + 8) / 2
});

test("rounds to a whole number of stars", () => {
  assert.equal(combineRating(5, 1, MAX), 8); // (5 + 10) / 2 = 7.5 → 8
  assert.equal(combineRating(5, 2 / 3, MAX), 6); // (5 + 6.67)/2 = 5.83 → 6
});

test("clamps fraction and result into range", () => {
  assert.equal(combineRating(0, 1.5, MAX), 10); // fraction over 1 clamps
  assert.equal(combineRating(0, -0.5, MAX), 0); // negative clamps
  assert.equal(combineRating(10, 1, MAX), 10); // stays within max
});
