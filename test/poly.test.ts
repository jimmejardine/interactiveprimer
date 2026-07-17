import test from "node:test";
import assert from "node:assert/strict";
import { parsePolynomial, detectVariable, comparePolynomial } from "../src/poly.ts";

/** Helper: parse and return a plain object {power: coeff} for easy assertions. */
function obj(str: string, v?: string) {
  const m = parsePolynomial(str, v);
  if (!m) return null;
  return Object.fromEntries([...m.entries()].sort((a, b) => a[0] - b[0]));
}

test("parses terms: coefficient, implicit 1, bare constant, signs", () => {
  assert.deepEqual(obj("10x^2+13x-30"), { 0: -30, 1: 13, 2: 10 });
  assert.deepEqual(obj("x^2 - x"), { 1: -1, 2: 1 });
  assert.deepEqual(obj("-x"), { 1: -1 });
  assert.deepEqual(obj("30"), { 0: 30 });
  assert.deepEqual(obj("x"), { 1: 1 });
  assert.deepEqual(obj("2.5x"), { 1: 2.5 });
});

test("normalizes spacing, *, leading +, and unicode superscripts", () => {
  assert.deepEqual(obj("  10*x^2 + 13*x - 30 "), { 0: -30, 1: 13, 2: 10 });
  assert.deepEqual(obj("+10x²+13x-30"), { 0: -30, 1: 13, 2: 10 });
});

test("accepts MathLive LaTeX (braced exponents, \\cdot, dashes)", () => {
  assert.deepEqual(obj("10x^{2}+13x-30"), { 0: -30, 1: 13, 2: 10 });
  assert.deepEqual(obj("10\\cdot x^{2}+13x−30"), { 0: -30, 1: 13, 2: 10 }); // unicode minus
});

test("combines like terms", () => {
  assert.deepEqual(obj("2x+3x+1+4"), { 0: 5, 1: 5 });
  assert.deepEqual(obj("x^2+2x^2"), { 2: 3 });
});

test("returns null for unparseable / factored / extra-variable input", () => {
  assert.equal(parsePolynomial("(x-1)(x+1)"), null);
  assert.equal(parsePolynomial("10y^2+x", "x"), null);
  assert.equal(parsePolynomial("", "x"), null);
  assert.equal(parsePolynomial("+", "x"), null);
  assert.equal(parsePolynomial("10x^2 + banana", "x"), null);
});

test("detectVariable finds the variable, defaulting to x", () => {
  assert.equal(detectVariable("10x^2+13x-30"), "x");
  assert.equal(detectVariable("3y^2-1"), "y");
  assert.equal(detectVariable("42"), "x");
});

test("comparePolynomial is order/format independent and tolerant", () => {
  assert.ok(comparePolynomial("10x^2+13x-30", "-30 + 13x + 10x^2"));
  assert.ok(comparePolynomial("10x^2+13x-30", "10x^{2}+13x-30"));
  assert.ok(comparePolynomial("10x^2+13x-30", "10x²+13x−30"));
  assert.ok(comparePolynomial("x^2-1", "x^2 - 1"));
  assert.ok(comparePolynomial("3y^2-1", "-1 + 3y^2")); // non-x variable
});

test("comparePolynomial rejects wrong or unparseable answers", () => {
  assert.equal(comparePolynomial("10x^2+13x-30", "10x^2+13x+30"), false);
  assert.equal(comparePolynomial("10x^2+13x-30", "10x^2+13x"), false);
  assert.equal(comparePolynomial("x^2-1", "(x-1)(x+1)"), false);
  assert.equal(comparePolynomial("x^2-1", ""), false);
});
