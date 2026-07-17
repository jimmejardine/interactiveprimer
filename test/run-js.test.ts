import test from "node:test";
import assert from "node:assert/strict";
import { formatArgs, formatError } from "../src/run-js.ts";

test("formatArgs: strings bare, other values stringified, joined by spaces", () => {
  assert.equal(formatArgs(["hi", 42]), "hi 42");
  assert.equal(formatArgs(["x =", 3.5, true]), "x = 3.5 true");
  assert.equal(formatArgs([{ a: 1 }]), '{"a":1}');
  assert.equal(formatArgs([[1, 2, 3]]), "[1,2,3]");
  assert.equal(formatArgs([null, undefined]), "null undefined");
  assert.equal(formatArgs([]), "");
});

test("formatError: name+message, string, and fallback", () => {
  assert.equal(formatError({ name: "TypeError", message: "x is not a function" }), "TypeError: x is not a function");
  assert.equal(formatError("boom"), "boom");
  assert.equal(formatError({ message: "just a message" }), "just a message");
});
