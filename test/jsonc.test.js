// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonc } from "../js/jsonc.js";

test("parses JSON with // and /* */ comments", () => {
  const text = `{
    // a line comment
    "a": 1,
    "b": 2 /* trailing block comment */
  }`;
  assert.deepEqual(parseJsonc(text), { a: 1, b: 2 });
});

test("tolerates trailing commas in objects and arrays", () => {
  assert.deepEqual(parseJsonc('[1, 2, 3,]'), [1, 2, 3]);
  assert.deepEqual(parseJsonc('{ "a": 1, "b": 2, }'), { a: 1, b: 2 });
});

test("preserves comment-looking text inside strings", () => {
  assert.deepEqual(parseJsonc('{ "u": "http://x // not a comment" }'), {
    u: "http://x // not a comment",
  });
  assert.deepEqual(parseJsonc('{ "s": "a /* keep me */ b" }'), { s: "a /* keep me */ b" });
});

test("parses clean JSON identically to JSON.parse", () => {
  const text = '{"prompt":"What is $2+3$?","options":[{"text":"$5$","correct":true}]}';
  assert.deepEqual(parseJsonc(text), JSON.parse(text));
});

test("a commented quiz bank parses to the expected questions", () => {
  const bank = `[
    {
      "prompt": "What is $2 + 3$?",
      "options": [
        { "text": "$5$", "correct": true }, // the answer
        { "text": "$6$", "correct": false }
      ]
    },
  ]`;
  const parsed = parseJsonc(bank);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].options[0].correct, true);
});
