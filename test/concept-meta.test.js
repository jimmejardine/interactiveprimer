// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { parseConceptMeta } from "../js/concept-meta.js";

test("parseConceptMeta accepts a full, valid concept", () => {
  const meta = parseConceptMeta({
    id: "mathematics/arithmetic/addition",
    title: "Addition",
    prerequisites: ["mathematics/arithmetic/counting"],
    declaredLevel: 2.5,
    root: false,
  });
  assert.equal(meta.id, "mathematics/arithmetic/addition");
  assert.equal(meta.declaredLevel, 2.5);
  assert.deepEqual(meta.prerequisites, ["mathematics/arithmetic/counting"]);
});

test("parseConceptMeta defaults prerequisites to an empty array", () => {
  const meta = parseConceptMeta({ id: "a/b", title: "B" });
  assert.deepEqual(meta.prerequisites, []);
  assert.equal(meta.declaredLevel, undefined);
});

test("parseConceptMeta rejects bad ids", () => {
  assert.throws(() => parseConceptMeta({ id: "", title: "X" }));
  assert.throws(() => parseConceptMeta({ id: "/leading", title: "X" }));
  assert.throws(() => parseConceptMeta({ id: "trailing/", title: "X" }));
  assert.throws(() => parseConceptMeta({ id: "a//b", title: "X" }));
});

test("parseConceptMeta rejects missing/blank titles", () => {
  assert.throws(() => parseConceptMeta({ id: "a/b" }));
  assert.throws(() => parseConceptMeta({ id: "a/b", title: "   " }));
});

test("parseConceptMeta rejects non-numeric or non-finite levels", () => {
  assert.throws(() => parseConceptMeta({ id: "a/b", title: "B", declaredLevel: "2" }));
  assert.throws(() => parseConceptMeta({ id: "a/b", title: "B", declaredLevel: Infinity }));
});

test("parseConceptMeta rejects non-string prerequisites", () => {
  assert.throws(() => parseConceptMeta({ id: "a/b", title: "B", prerequisites: [1, 2] }));
});
