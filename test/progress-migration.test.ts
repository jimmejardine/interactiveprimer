import test from "node:test";
import assert from "node:assert/strict";
import { planMigration } from "../src/progress-migration.ts";

/* ----------------------------- planMigration ---------------------------- */

test("re-keys an orphan whose leaf matches exactly one current concept", () => {
  const ops = planMigration(
    ["mathematics/people/newton"], // old id (concept was moved)
    ["people/newton", "people/leibniz", "mathematics/arithmetic/addition"],
  );
  assert.deepEqual(ops, [{ from: "mathematics/people/newton", to: "people/newton" }]);
});

test("leaves an orphan untouched when no current concept shares its leaf", () => {
  const ops = planMigration(["calculus/old/widgets"], ["people/newton", "arithmetic/addition"]);
  assert.deepEqual(ops, []);
});

test("leaves an orphan untouched when its leaf is ambiguous (2+ matches)", () => {
  const ops = planMigration(
    ["old/addition"],
    ["arithmetic/addition", "vectors/addition"], // two concepts end in "addition"
  );
  assert.deepEqual(ops, []);
});

test("ignores stored ids that still exist (not orphans)", () => {
  const ops = planMigration(
    ["people/newton", "arithmetic/addition"],
    ["people/newton", "arithmetic/addition", "people/leibniz"],
  );
  assert.deepEqual(ops, []);
});

test("two orphans sharing one leaf both target the single match", () => {
  const ops = planMigration(
    ["a/newton", "b/newton"],
    ["people/newton"],
  );
  assert.deepEqual(ops, [
    { from: "a/newton", to: "people/newton" },
    { from: "b/newton", to: "people/newton" },
  ]);
});

test("a bare (top-level) orphan id matches a current top-level concept by leaf", () => {
  // leaf of "newton" is "newton"; matches the single "people/newton".
  const ops = planMigration(["newton"], ["people/newton"]);
  assert.deepEqual(ops, [{ from: "newton", to: "people/newton" }]);
});

test("empty inputs yield no ops", () => {
  assert.deepEqual(planMigration([], ["people/newton"]), []);
  assert.deepEqual(planMigration(["people/newton"], []), []);
});
