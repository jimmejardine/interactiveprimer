// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { searchConcepts } from "../js/concept-search.js";

const ITEMS = [
  { id: "calculus/derivative/the-derivative", title: "The Derivative" },
  { id: "calculus/derivative/derivative-of-a-constant", title: "Derivative of a Constant" },
  { id: "calculus/derivative/derivative-notation", title: "Derivative Notation" },
  { id: "arithmetic/division", title: "Division" },
  { id: "calculus/calculus", title: "Calculus" },
];

test("empty / whitespace query returns nothing", () => {
  assert.deepEqual(searchConcepts(ITEMS, ""), []);
  assert.deepEqual(searchConcepts(ITEMS, "   "), []);
});

test("no match returns nothing", () => {
  assert.deepEqual(searchConcepts(ITEMS, "zzz"), []);
});

test("ranks exact → prefix → substring", () => {
  const r = searchConcepts(ITEMS, "derivative").map((x) => x.title);
  // "Derivative Notation" / "Derivative of a Constant" start with the query (prefix) and come
  // before "The Derivative" (substring). Among the two prefixes, alphabetical order.
  assert.deepEqual(r, ["Derivative Notation", "Derivative of a Constant", "The Derivative"]);
});

test("an exact title outranks a longer prefix match", () => {
  const items = [
    { id: "a", title: "Calculus is fun" },
    { id: "b", title: "Calculus" },
  ];
  assert.deepEqual(
    searchConcepts(items, "calculus").map((x) => x.id),
    ["b", "a"],
  );
});

test("case-insensitive", () => {
  assert.deepEqual(
    searchConcepts(ITEMS, "DIVISION").map((x) => x.id),
    ["arithmetic/division"],
  );
});

test("respects the limit", () => {
  assert.equal(searchConcepts(ITEMS, "derivative", 2).length, 2);
  assert.equal(searchConcepts(ITEMS, "derivative", 0).length, 0);
});
