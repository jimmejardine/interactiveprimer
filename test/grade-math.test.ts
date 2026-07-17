import test from "node:test";
import assert from "node:assert/strict";
import { ComputeEngine } from "@cortex-js/compute-engine";
import { gradeEquivalent } from "../src/grade-math.ts";

// A real Compute Engine — the same library the browser lazy-loads from a CDN.
const ce = new ComputeEngine();

test("gradeEquivalent accepts equivalent algebraic forms", () => {
  assert.equal(gradeEquivalent(ce, "x^2 + 7x + 12", "(x+3)(x+4)"), true); // factored
  assert.equal(gradeEquivalent(ce, "x^2 + 7x + 12", "12 + 7x + x^2"), true); // reordered
  assert.equal(gradeEquivalent(ce, "x^2 + 7x + 12", "x^{2}+7x+12"), true); // MathLive LaTeX
  assert.equal(gradeEquivalent(ce, "1/2", "0.5"), true); // numeric equivalence
});

test("gradeEquivalent rejects non-equivalent answers", () => {
  assert.equal(gradeEquivalent(ce, "2x", "x"), false);
  assert.equal(gradeEquivalent(ce, "x^2", "x"), false);
  assert.equal(gradeEquivalent(ce, "x^2 + 7x + 12", "x^2 + 7x + 11"), false);
});

test("gradeEquivalent returns false for empty input", () => {
  assert.equal(gradeEquivalent(ce, "x + 1", ""), false);
  assert.equal(gradeEquivalent(ce, "x + 1", "   "), false);
});
