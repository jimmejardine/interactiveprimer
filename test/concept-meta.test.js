// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { parseConceptMeta } from "../js/concept-meta.js";

test("parseConceptMeta accepts a full, valid concept", () => {
  const meta = parseConceptMeta({
    id: "arithmetic/addition",
    title: "Addition",
    prerequisites: ["arithmetic/counting"],
    declaredLevel: 2.5,
    root: false,
  });
  assert.equal(meta.id, "arithmetic/addition");
  assert.equal(meta.declaredLevel, 2.5);
  assert.deepEqual(meta.prerequisites, ["arithmetic/counting"]);
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

test("parseConceptMeta accepts optional curation dates", () => {
  const meta = parseConceptMeta({
    id: "a/b",
    title: "B",
    completedDate: "2026-06-15",
    needsReviewDate: "2027-01-01",
  });
  assert.equal(meta.completedDate, "2026-06-15");
  assert.equal(meta.needsReviewDate, "2027-01-01");
});

test("parseConceptMeta leaves curation dates undefined when absent", () => {
  const meta = parseConceptMeta({ id: "a/b", title: "B" });
  assert.equal(meta.completedDate, undefined);
  assert.equal(meta.needsReviewDate, undefined);
});

test("parseConceptMeta rejects malformed or non-string dates", () => {
  assert.throws(() => parseConceptMeta({ id: "a/b", title: "B", completedDate: "15-06-2026" }));
  assert.throws(() => parseConceptMeta({ id: "a/b", title: "B", completedDate: "2026-13-40" }));
  assert.throws(() => parseConceptMeta({ id: "a/b", title: "B", needsReviewDate: 20260615 }));
});
