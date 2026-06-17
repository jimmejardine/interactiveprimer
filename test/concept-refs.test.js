// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { extractConceptRefs } from "../js/concept-refs.js";

test("extracts the `to` id of a single ref", () => {
  assert.deepEqual(
    extractConceptRefs(`<p>two lines are <primer-ref to="geometry/parallel-lines">parallel</primer-ref></p>`),
    ["geometry/parallel-lines"],
  );
});

test("accepts single or double quotes and tolerates spacing/attrs", () => {
  const html = `
    <primer-ref to='arithmetic/counting'>x</primer-ref>
    <primer-ref  data-x  to = "arithmetic/addition" >y</primer-ref>`;
  assert.deepEqual(extractConceptRefs(html), ["arithmetic/counting", "arithmetic/addition"]);
});

test("de-dupes repeated and empty refs, in first-seen order", () => {
  const html = `
    <primer-ref to="geometry/parallel-lines">a</primer-ref>
    <primer-ref to="geometry/parallel-lines"></primer-ref>
    <primer-ref to="">skip me</primer-ref>`;
  assert.deepEqual(extractConceptRefs(html), ["geometry/parallel-lines"]);
});

test("ignores refs inside HTML comments", () => {
  const html = `
    <!-- example: <primer-ref to="geometry/should-not-count">x</primer-ref> -->
    <primer-ref to="geometry/real">y</primer-ref>`;
  assert.deepEqual(extractConceptRefs(html), ["geometry/real"]);
});

test("ignores other tags and plain anchors", () => {
  const html = `<a href="/concepts/geometry/parallel-lines.html">not a ref</a>
    <primer-theorem name="x">t</primer-theorem>`;
  assert.deepEqual(extractConceptRefs(html), []);
});

test("returns an empty array when there are no refs", () => {
  assert.deepEqual(extractConceptRefs("<p>nothing here</p>"), []);
});
