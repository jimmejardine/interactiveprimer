import test from "node:test";
import assert from "node:assert/strict";
import { mergeProgress, validateImport, FILE_TYPE, FILE_VERSION } from "../src/progress.ts";

const e = (id: string, stars: number, first: string, last: string) => ({ id, stars, first, last });

test("overwrite returns the incoming entries unchanged", () => {
  const existing = [e("a", 5, "2026-01-01", "2026-01-01")];
  const incoming = [e("b", 3, "2026-02-01", "2026-02-01")];
  assert.deepEqual(mergeProgress(existing, incoming, "overwrite"), incoming);
});

test("merge unions disjoint ids", () => {
  const existing = [e("a", 5, "2026-01-01", "2026-01-01")];
  const incoming = [e("b", 3, "2026-02-01", "2026-02-01")];
  const merged = mergeProgress(existing, incoming, "merge");
  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.find((m) => m.id === "a"),
    existing[0],
  );
  assert.deepEqual(
    merged.find((m) => m.id === "b"),
    incoming[0],
  );
});

test("merge: the later `last` date supplies the stars", () => {
  const existing = [e("a", 2, "2026-01-01", "2026-03-01")];
  const incoming = [e("a", 9, "2026-02-01", "2026-05-01")];
  const [m] = mergeProgress(existing, incoming, "merge");
  assert.equal(m.stars, 9); // incoming is newer
});

test("merge: an older incoming loses its stars to the local score", () => {
  const existing = [e("a", 8, "2026-01-01", "2026-05-01")];
  const incoming = [e("a", 1, "2026-01-01", "2026-02-01")];
  const [m] = mergeProgress(existing, incoming, "merge");
  assert.equal(m.stars, 8); // existing is newer
});

test("merge: first takes the min and last takes the max across both", () => {
  const existing = [e("a", 2, "2026-03-01", "2026-04-01")];
  const incoming = [e("a", 9, "2026-01-15", "2026-06-01")];
  const [m] = mergeProgress(existing, incoming, "merge");
  assert.equal(m.first, "2026-01-15"); // earliest first-rated
  assert.equal(m.last, "2026-06-01"); // latest updated
  assert.equal(m.stars, 9); // from the later `last`
});

test("merge: equal `last` → incoming wins the stars (deliberate import)", () => {
  const existing = [e("a", 4, "2026-01-01", "2026-05-01")];
  const incoming = [e("a", 7, "2026-02-01", "2026-05-01")];
  const [m] = mergeProgress(existing, incoming, "merge");
  assert.equal(m.stars, 7);
  assert.equal(m.first, "2026-01-01");
});

test("merge: an undated (legacy) entry loses the date tie to a dated one", () => {
  const existing = [e("a", 4, "", "")];
  const incoming = [e("a", 7, "2026-02-01", "2026-02-01")];
  const [m] = mergeProgress(existing, incoming, "merge");
  assert.equal(m.stars, 7); // dated incoming beats undated existing
  assert.equal(m.first, "2026-02-01"); // empty dates are ignored by min/max
  assert.equal(m.last, "2026-02-01");
});

test("merge: a dated local entry beats an undated incoming", () => {
  const existing = [e("a", 6, "2026-02-01", "2026-02-01")];
  const incoming = [e("a", 1, "", "")];
  const [m] = mergeProgress(existing, incoming, "merge");
  assert.equal(m.stars, 6);
});

test("validateImport accepts a well-formed payload", () => {
  const obj = {
    type: FILE_TYPE,
    version: FILE_VERSION,
    exported: "2026-06-18",
    entries: [{ id: "arithmetic/addition", stars: 5, first: "2026-01-01", last: "2026-06-01" }],
  };
  const entries = validateImport(obj);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    id: "arithmetic/addition",
    stars: 5,
    first: "2026-01-01",
    last: "2026-06-01",
  });
});

test("validateImport tolerates missing dates (→ empty strings)", () => {
  const entries = validateImport({ type: FILE_TYPE, entries: [{ id: "a", stars: 3 }] });
  assert.deepEqual(entries[0], { id: "a", stars: 3, first: "", last: "" });
});

test("validateImport rejects a wrong type", () => {
  assert.throws(() => validateImport({ type: "something-else", entries: [] }));
  assert.throws(() => validateImport(null));
});

test("validateImport rejects missing/invalid entries", () => {
  assert.throws(() => validateImport({ type: FILE_TYPE }));
  assert.throws(() => validateImport({ type: FILE_TYPE, entries: [{ stars: 3 }] })); // no id
  assert.throws(() =>
    validateImport({ type: FILE_TYPE, entries: [{ id: "a", stars: 99 }] }),
  ); // out of range
  assert.throws(() =>
    validateImport({ type: FILE_TYPE, entries: [{ id: "a", stars: "x" }] }),
  ); // non-numeric
});
