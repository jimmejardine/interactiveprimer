import test from "node:test";
import assert from "node:assert/strict";
import { placeholderNames, expressionPlaceholders } from "../src/scene-string-lint.ts";

test("expressionPlaceholders flags an arithmetic expression over drawn quiz variables", () => {
  assert.deepEqual(expressionPlaceholders("In the number ${10*t + o}$, how many tens?", ["t", "o"]), ["10*t + o"]);
  assert.deepEqual(expressionPlaceholders("Solve $x + y = {x + y}$ and $x - y = {x - y}$.", ["x", "y"]), ["x + y", "x - y"]);
  assert.deepEqual(expressionPlaceholders("Next: ${a},\\ {a + 2 * d}$?", ["a", "d"]), ["a + 2 * d"]);
});

test("expressionPlaceholders leaves a bare {name} placeholder alone", () => {
  assert.deepEqual(expressionPlaceholders("In the number ${n}$, how many tens?", ["n", "t", "o"]), []);
  assert.deepEqual(expressionPlaceholders("Empecemos en {a} y sumemos {b}.", ["a", "b"]), []);
});

test("expressionPlaceholders does not flag LaTeX groups whose letters are not quiz variables", () => {
  // f, b, a here are LaTeX letters in a fraction, not drawn variables on the page.
  assert.deepEqual(expressionPlaceholders("$f'(c) = \\frac{f(b) - f(a)}{b - a}$", ["x", "n"]), []);
  assert.deepEqual(expressionPlaceholders("the discount $e^{-rT}$", ["r", "t"]), []);
});

test("expressionPlaceholders does not flag LaTeX even when its letters ARE quiz variables", () => {
  // subscripts/superscripts/commands collide with single-letter quiz vars on advanced pages.
  assert.deepEqual(expressionPlaceholders("the increment $W_{t-s}$", ["t", "s"]), []); // subscript after _
  assert.deepEqual(expressionPlaceholders("$X_{n+1}$ given the past", ["n"]), []); // subscript after _
  assert.deepEqual(expressionPlaceholders("the activation $e^{-z}$", ["z"]), []); // superscript after ^
  assert.deepEqual(expressionPlaceholders("$\\sqrt{t - s}$", ["t", "s"]), []); // \cmd argument (letter before {)
  assert.deepEqual(expressionPlaceholders("mean $e^{\\mu t}$", ["t"]), []); // backslash inside
  assert.deepEqual(expressionPlaceholders("a $d\\times r$ matrix in ${d\\times r}$", ["d", "r"]), []); // backslash inside
  assert.deepEqual(expressionPlaceholders("$f'(c) = \\dfrac{f(b) - f(a)}{b - a}$", ["a", "b"]), []); // \frac denominator after }
  assert.deepEqual(expressionPlaceholders("the sum $\\frac{a}{1 - r}$", ["a", "r"]), []); // \frac denominator
});

test("expressionPlaceholders ignores doubled {{…}} literal escapes", () => {
  assert.deepEqual(expressionPlaceholders("keep literal {{x + 1}} here", ["x"]), []);
});

test("placeholderNames extracts the simple {name} set, ignoring escapes and expressions", () => {
  assert.deepEqual([...placeholderNames("{a} + {b} = {sum}")].sort(), ["a", "b", "sum"]);
  assert.deepEqual([...placeholderNames("keep {{literal}} but use {n}")], ["n"]);
  // an expression group contributes no simple name
  assert.deepEqual([...placeholderNames("value ${10*t + o}$")], []);
});

test("placeholderNames powers an en↔locale mismatch check", () => {
  const en = placeholderNames("Let's start at {a}, and add {b}.");
  const ok = placeholderNames("Empecemos en {a} y sumemos {b}.");
  const broken = placeholderNames("Empecemos en {a} y sumemos.");
  const eq = (x: Set<string>, y: Set<string>) => x.size === y.size && [...x].every((k) => y.has(k));
  assert.ok(eq(en, ok));
  assert.ok(!eq(en, broken)); // {b} dropped in translation
});
