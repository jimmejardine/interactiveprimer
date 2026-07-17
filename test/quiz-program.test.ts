import test from "node:test";
import assert from "node:assert/strict";
import {
  SENTINEL,
  inputLiteral,
  displayValue,
  buildProgramSource,
  extractAnswer,
  compareResult,
} from "../src/quiz-program.ts";

test("inputLiteral: JS literals for each INPUT shape", () => {
  assert.equal(inputLiteral(42), "42");
  assert.equal(inputLiteral("hi"), '"hi"');
  assert.equal(inputLiteral([1, 2, 3]), "[1,2,3]");
  assert.equal(inputLiteral({ a: 1 }), '{"a":1}');
  assert.equal(inputLiteral(undefined), "undefined");
});

test("displayValue: quotes strings, JSON-ish otherwise", () => {
  assert.equal(displayValue("hi"), '"hi"');
  assert.equal(displayValue([1, 2]), "[1,2]");
  assert.equal(displayValue(7), "7");
});

test("buildProgramSource: injects INPUT and appends the sentinel report", () => {
  const src = buildProgramSource([1, 2, 3], "ANSWER = INPUT.length;");
  assert.match(src, /^const INPUT = \[1,2,3\];/);
  assert.match(src, /ANSWER = INPUT\.length;/);
  assert.ok(src.includes(SENTINEL), "carries the sentinel");
  // typeof guard so an unassigned ANSWER can't throw a ReferenceError
  assert.match(src, /typeof ANSWER/);
});

test("extractAnswer: pulls the tagged report out and keeps the rest as output", () => {
  const report = SENTINEL + JSON.stringify({ assigned: true, value: 6 });
  const r = extractAnswer(["debug line", report]);
  assert.equal(r.found, true);
  assert.equal(r.assigned, true);
  assert.equal(r.value, 6);
  assert.deepEqual(r.output, ["debug line"]);
});

test("extractAnswer: unassigned ANSWER reports assigned:false", () => {
  const report = SENTINEL + JSON.stringify({ assigned: false, value: null });
  const r = extractAnswer([report]);
  assert.equal(r.found, true);
  assert.equal(r.assigned, false);
  assert.equal(r.value, null);
  assert.deepEqual(r.output, []);
});

test("extractAnswer: last tagged line wins (ours is emitted last)", () => {
  const decoy = SENTINEL + JSON.stringify({ assigned: true, value: 1 });
  const real = SENTINEL + JSON.stringify({ assigned: true, value: 2 });
  const r = extractAnswer([decoy, real]);
  assert.equal(r.value, 2);
  assert.deepEqual(r.output, []); // both tagged lines stripped
});

test("extractAnswer: no report line (e.g. a crash before the postamble)", () => {
  const r = extractAnswer(["boom"]);
  assert.equal(r.found, false);
  assert.equal(r.assigned, false);
  assert.deepEqual(r.output, ["boom"]);
});

test("compareResult: numbers with tolerance and numeric coercion", () => {
  assert.equal(compareResult(6, 6), true);
  assert.equal(compareResult(6, 7), false);
  assert.equal(compareResult(1 / 3, 0.3333333333), true); // within tolerance
  assert.equal(compareResult(10, "10"), true); // beginner returned a numeric string
  assert.equal(compareResult(10, "ten"), false);
  assert.equal(compareResult(1, true), false); // boolean is not numerically coerced
});

test("compareResult: strings and booleans compare strictly", () => {
  assert.equal(compareResult("racecar", "racecar"), true);
  assert.equal(compareResult("Racecar", "racecar"), false);
  assert.equal(compareResult(true, true), true);
  assert.equal(compareResult(true, false), false);
});

test("compareResult: arrays and objects compare structurally", () => {
  assert.equal(compareResult([1, 2, 3], [1, 2, 3]), true);
  assert.equal(compareResult([1, 2, 3], [1, 2]), false);
  assert.equal(compareResult([1, 2], [2, 1]), false); // order matters
  assert.equal(compareResult({ a: 1, b: 2 }, { b: 2, a: 1 }), true); // key order doesn't
  assert.equal(compareResult({ a: 1 }, { a: 1, b: 2 }), false);
  assert.equal(compareResult([{ n: 1 }], [{ n: "1" }]), true); // nested numeric coercion
});

test("compareResult: null and mismatched types", () => {
  assert.equal(compareResult(null, null), true);
  assert.equal(compareResult(null, 0), false);
  assert.equal(compareResult([1], { 0: 1 }), false);
});
