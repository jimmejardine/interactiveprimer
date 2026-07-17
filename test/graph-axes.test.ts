import test from "node:test";
import assert from "node:assert/strict";
import { unitLabel } from "../src/graph-axes.ts";

const PI = Math.PI;

test("unitLabel: π multiples format as proper fractions", () => {
  assert.equal(unitLabel(0, PI, "π"), "0");
  assert.equal(unitLabel(PI / 2, PI, "π"), "π/2");
  assert.equal(unitLabel(PI, PI, "π"), "π");
  assert.equal(unitLabel(3 * PI / 2, PI, "π"), "3π/2");
  assert.equal(unitLabel(2 * PI, PI, "π"), "2π");
  assert.equal(unitLabel(PI / 4, PI, "π"), "π/4");
  assert.equal(unitLabel(3 * PI / 4, PI, "π"), "3π/4");
});

test("unitLabel: negatives use a real minus sign", () => {
  assert.equal(unitLabel(-PI, PI, "π"), "−π");
  assert.equal(unitLabel(-PI / 4, PI, "π"), "−π/4");
  assert.equal(unitLabel(-3 * PI / 2, PI, "π"), "−3π/2");
});

test("unitLabel: near-zero and non-finite collapse to 0", () => {
  assert.equal(unitLabel(1e-12, PI, "π"), "0");
  assert.equal(unitLabel(NaN, PI, "π"), "0");
});

test("unitLabel: works for base e too", () => {
  assert.equal(unitLabel(Math.E, Math.E, "e"), "e");
  assert.equal(unitLabel(2 * Math.E, Math.E, "e"), "2e");
  assert.equal(unitLabel(Math.E / 2, Math.E, "e"), "e/2");
});
