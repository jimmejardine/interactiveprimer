// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseVariables,
  instantiate,
  substitute,
  fillExpressions,
  evalExpr,
  computeAnswer,
  checkAnswer,
  formatValue,
} from "../js/quiz-vars.js";

/** Deterministic LCG (matches test/quiz.test.js). @param {number} seed */
function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test("fillExpressions: evaluates expressions, concatenates, and leaves the rest alone", () => {
  const b = { a: 4, b: 12, color: "red" };
  assert.equal(fillExpressions("$ {a + b} $", b), "$ 16 $"); // arithmetic
  assert.equal(fillExpressions("{2 * a}", b), "8");
  assert.equal(fillExpressions("{a}", b), "4"); // bare name
  assert.equal(fillExpressions("{a}{b}", b), "412"); // adjacent groups concatenate
  assert.equal(fillExpressions("{color}", b), "red"); // string-valued choice
  // Not an expression over the bindings → left untouched (e.g. LaTeX braces / unknowns).
  assert.equal(fillExpressions("\\sqrt{x}", b), "\\sqrt{x}");
  // Double braces keep a literal LaTeX brace group.
  assert.equal(fillExpressions("x^{{12}}", b), "x^{12}");
});

test("parseVariables: integer, real, and choice kinds", () => {
  const vars = parseVariables("a=[1:10] b=[1;10] c=[1,2,3]");
  assert.deepEqual(vars[0], { name: "a", kind: "int", lo: 1, hi: 10 });
  assert.deepEqual(vars[1], { name: "b", kind: "real", lo: 1, hi: 10 });
  assert.deepEqual(vars[2], { name: "c", kind: "choice", values: ["1", "2", "3"] });
});

test("parseVariables: negatives in ranges", () => {
  const vars = parseVariables("x=[-5:5] y=[-2.5;2.5]");
  assert.deepEqual(vars[0], { name: "x", kind: "int", lo: -5, hi: 5 });
  assert.deepEqual(vars[1], { name: "y", kind: "real", lo: -2.5, hi: 2.5 });
});

test("parseVariables: rejects malformed specs", () => {
  assert.throws(() => parseVariables("a"), /name=/); // no =
  assert.throws(() => parseVariables("1a=[1:2]"), /bad variable name/);
  assert.throws(() => parseVariables("a=1:2"), /\[/); // no brackets
  assert.throws(() => parseVariables("a=[1:2:3]"), /two numbers/); // bad range
  assert.throws(() => parseVariables("a=[1:2;3]"), /exactly one/); // mixed separators
  assert.throws(() => parseVariables("a=[5:1]"), /lo > hi/);
  assert.throws(() => parseVariables("sqrt=[1:2]"), /function name/);
  assert.throws(() => parseVariables("a=[1:2] a=[3:4]"), /duplicate/);
});

test("instantiate: deterministic, in range, reals 3dp, choice from list", () => {
  const vars = parseVariables("a=[1:10] b=[0;1] c=[7,8,9]");
  const r1 = instantiate(vars, seededRng(123));
  const r2 = instantiate(vars, seededRng(123));
  assert.deepEqual(r1, r2); // same seed → same draw

  assert.ok(typeof r1.a === "number" && Number.isInteger(r1.a) && r1.a >= 1 && r1.a <= 10);
  assert.ok(typeof r1.b === "number" && r1.b >= 0 && r1.b <= 1);
  assert.equal(r1.b, Math.round(/** @type {number} */ (r1.b) * 1000) / 1000); // 3dp
  assert.ok([7, 8, 9].includes(/** @type {number} */ (r1.c)));
});

test("substitute: {name} placeholders, declared only, KaTeX-safe", () => {
  const b = { a: 3, b: 7 };
  assert.equal(substitute("What is ${a} + {b}$?", b), "What is $3 + 7$?");
  assert.equal(substitute("plain {a} text", b), "plain 3 text"); // works outside math too
  assert.equal(substitute("\\textbf{hi} and {z}", b), "\\textbf{hi} and {z}"); // unknown left alone
  // {a} consumes its own braces; to keep LaTeX braces (e.g. \frac), double them:
  assert.equal(substitute("$\\frac{a}{b}$", b), "$\\frac37$");
  assert.equal(substitute("$\\frac{{a}}{{b}}$", b), "$\\frac{3}{7}$");
});

test("formatValue trims trailing zeros on reals", () => {
  assert.equal(formatValue(2.5), "2.5");
  assert.equal(formatValue(3), "3");
  assert.equal(formatValue("red"), "red");
});

test("evalExpr: precedence, right-assoc power, unary minus, modulo, functions", () => {
  const b = { a: 3, b: 7 };
  assert.equal(evalExpr("a + b", b), 10);
  assert.equal(evalExpr("2 + 3 * 4", {}), 14);
  assert.equal(evalExpr("(2 + 3) * 4", {}), 20);
  assert.equal(evalExpr("2 ^ 3 ^ 2", {}), 512); // right-associative
  assert.equal(evalExpr("-a + 5", b), 2);
  assert.equal(evalExpr("7 % 3", {}), 1);
  assert.equal(evalExpr("sqrt(a*a + b*b)", { a: 3, b: 4 }), 5);
  assert.equal(evalExpr("max(a, b, 5)", b), 7);
});

test("evalExpr: throws on unknown name and non-finite result", () => {
  assert.throws(() => evalExpr("a + z", { a: 1 }), /unknown variable "z"/);
  assert.throws(() => evalExpr("nope(2)", {}), /unknown function/);
  assert.throws(() => evalExpr("1 / 0", {}), /finite/);
  assert.throws(() => evalExpr("2 +", {}), /unexpected end|parse/);
});

test("computeAnswer: expression, numeric literal, and literal string", () => {
  assert.equal(computeAnswer("a + b", { a: 3, b: 7 }), 10);
  assert.equal(computeAnswer("42", {}), 42);
  assert.equal(computeAnswer("Paris", {}), "Paris");
});

test("checkAnswer: numeric tolerance, string normalization, empty", () => {
  assert.equal(checkAnswer(10, "10"), true);
  assert.equal(checkAnswer(10, " 10 "), true);
  assert.equal(checkAnswer(10, "11"), false);
  assert.equal(checkAnswer(2.5, "2.5"), true);
  assert.equal(checkAnswer(2.5, "2.5005"), true); // within 1e-3
  assert.equal(checkAnswer(2.5, "2.4995"), true); // within 1e-3
  assert.equal(checkAnswer(2.5, "2.502"), false); // outside 1e-3
  assert.equal(checkAnswer(2.5, "2.49"), false); // outside 1e-3
  assert.equal(checkAnswer("Paris", "  paris "), true); // case/space-insensitive
  assert.equal(checkAnswer("Paris", "London"), false);
  assert.equal(checkAnswer(10, ""), false);
  assert.equal(checkAnswer(10, "abc"), false);
});
