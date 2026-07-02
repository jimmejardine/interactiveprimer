// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { buildStaleRows, formatStaleRow } from "../js/stale-report.js";

const D = (/** @type {string} */ iso) => Date.parse(iso); // explicit ms — deterministic, no clock read

test("orders lessons oldest-mtime first", () => {
  const concepts = [
    { id: "b", title: "Bee" },
    { id: "a", title: "Ay" },
    { id: "c", title: "Cee" },
  ];
  const mtimeById = new Map([
    ["a", D("2026-06-22T09:00:00Z")],
    ["b", D("2026-07-02T09:00:00Z")],
    ["c", D("2026-06-19T09:00:00Z")],
  ]);
  assert.deepEqual(buildStaleRows(concepts, mtimeById), [
    { id: "c", title: "Cee", date: "2026-06-19" },
    { id: "a", title: "Ay", date: "2026-06-22" },
    { id: "b", title: "Bee", date: "2026-07-02" },
  ]);
});

test("keeps lessons only — excludes course pages, course-tree hubs, root & orphans", () => {
  const concepts = [
    { id: "physics/energy/what-is-energy", title: "What Is Energy?" }, // lesson ✓
    { id: "people/ito", title: "Kiyoshi Itô" }, // lesson ✓ (a biography page)
    { id: "physics/physics", title: "Physics", course: true }, // topic hub — course:true
    { id: "physics/courses/secondary-school/uk/gcse-year-10", title: "GCSE Year 10", course: true }, // year page
    { id: "mathematics/courses/secondary-school/uk/uk", title: "UK Secondary Mathematics" }, // nav hub (NOT course:true) via courses/
    { id: "physics/courses/courses", title: "Courses" }, // courses root hub
    { id: "root", title: "The Tree" }, // landing
    { id: "orphans", title: "The Orphans" }, // maintenance node
  ];
  const mtimeById = new Map(concepts.map((c) => [c.id, D("2026-06-20T00:00:00Z")]));
  assert.deepEqual(
    buildStaleRows(concepts, mtimeById).map((r) => r.id),
    ["people/ito", "physics/energy/what-is-energy"],
  );
});

test("ties on mtime break by id, stably", () => {
  const same = D("2026-06-25T12:00:00Z");
  const concepts = [{ id: "z", title: "Z" }, { id: "a", title: "A" }, { id: "m", title: "M" }];
  const mtimeById = new Map([["z", same], ["a", same], ["m", same]]);
  assert.deepEqual(
    buildStaleRows(concepts, mtimeById).map((r) => r.id),
    ["a", "m", "z"],
  );
});

test("accepts a Date as well as a number, and falls back to id for a missing title", () => {
  const concepts = [{ id: "x/y" }];
  const rows = buildStaleRows(concepts, new Map([["x/y", new Date("2026-06-30T00:00:00Z")]]));
  assert.deepEqual(rows, [{ id: "x/y", title: "x/y", date: "2026-06-30" }]);
});

test("skips a concept with no known mtime", () => {
  const concepts = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
  const rows = buildStaleRows(concepts, new Map([["a", D("2026-06-10T00:00:00Z")]]));
  assert.deepEqual(rows.map((r) => r.id), ["a"]);
});

test("formatStaleRow renders `date  id  title`", () => {
  assert.equal(
    formatStaleRow({ id: "mathematics/arithmetic/counting", title: "Counting", date: "2026-06-19" }),
    "2026-06-19  mathematics/arithmetic/counting  Counting",
  );
});
