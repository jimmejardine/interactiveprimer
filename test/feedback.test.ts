import test from "node:test";
import assert from "node:assert/strict";
import { attentionEvent } from "../src/feedback.ts";

test("attentionEvent puts the concept id in the event path", () => {
  const e = attentionEvent("arithmetic/addition", "Addition");
  assert.deepEqual(e, {
    path: "needs-attention/arithmetic/addition",
    title: "Needs attention: Addition",
    event: true,
  });
});

test("attentionEvent falls back to the id when no title is given", () => {
  assert.equal(attentionEvent("calculus/calculus").title, "Needs attention: calculus/calculus");
  assert.equal(attentionEvent("calculus/calculus", "").title, "Needs attention: calculus/calculus");
});

test("attentionEvent always marks event: true", () => {
  assert.equal(attentionEvent("root", "The Tree of Knowledge").event, true);
});
