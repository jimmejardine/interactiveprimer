// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { extractConceptRefs, extractForwardRefs, extractSoftRefs } from "../js/concept-refs.js";

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

test("a `forward` ref is excluded from backward refs and returned by forward refs", () => {
  const html = `<primer-ref forward to="calculus/limits/idea-of-a-limit">later</primer-ref>`;
  assert.deepEqual(extractConceptRefs(html), []); // not a backward prerequisite of this page
  assert.deepEqual(extractForwardRefs(html), ["calculus/limits/idea-of-a-limit"]);
});

test("splits mixed backward + forward refs in one page", () => {
  const html = `
    <primer-ref to="arithmetic/division">div</primer-ref>
    <primer-ref to="arithmetic/addition" forward>add</primer-ref>
    <primer-ref forward to='arithmetic/subtraction'>sub</primer-ref>`;
  assert.deepEqual(extractConceptRefs(html), ["arithmetic/division"]);
  assert.deepEqual(extractForwardRefs(html), ["arithmetic/addition", "arithmetic/subtraction"]);
});

test("`forward` matcher isn't fooled by the word inside a `to` value", () => {
  const html = `<primer-ref to="calculus/forward-references">x</primer-ref>`;
  assert.deepEqual(extractConceptRefs(html), ["calculus/forward-references"]); // still backward
  assert.deepEqual(extractForwardRefs(html), []);
});

test("a `soft` ref makes no edge: excluded from both backward and forward refs", () => {
  const html = `<primer-ref soft to="people/leibniz">Leibniz</primer-ref>`;
  assert.deepEqual(extractConceptRefs(html), []);
  assert.deepEqual(extractForwardRefs(html), []);
  assert.deepEqual(extractSoftRefs(html), ["people/leibniz"]);
});

test("`soft` wins over `forward` (an edgeless ref is never a forward edge)", () => {
  const html = `<primer-ref soft forward to="people/newton">Newton</primer-ref>`;
  assert.deepEqual(extractForwardRefs(html), []);
  assert.deepEqual(extractSoftRefs(html), ["people/newton"]);
});

test("`soft` matcher isn't fooled by the word inside a `to` value", () => {
  const html = `<primer-ref to="calculus/soft-margins">x</primer-ref>`;
  assert.deepEqual(extractConceptRefs(html), ["calculus/soft-margins"]); // still backward
  assert.deepEqual(extractSoftRefs(html), []);
});

test("splits backward, forward and soft refs in one page", () => {
  const html = `
    <primer-ref to="arithmetic/division">div</primer-ref>
    <primer-ref forward to="arithmetic/addition">add</primer-ref>
    <primer-ref soft to="arithmetic/subtraction">sub</primer-ref>`;
  assert.deepEqual(extractConceptRefs(html), ["arithmetic/division"]);
  assert.deepEqual(extractForwardRefs(html), ["arithmetic/addition"]);
  assert.deepEqual(extractSoftRefs(html), ["arithmetic/subtraction"]);
});
