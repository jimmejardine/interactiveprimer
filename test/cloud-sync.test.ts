import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldPull,
  shouldPush,
  changedEntries,
  reconcileCourse,
  PULL_TTL_MS,
  WRITE_TTL_MS,
} from "../src/cloud-sync-core.ts";

test("shouldPull: never pulled → true", () => {
  assert.equal(shouldPull(0, 1000, PULL_TTL_MS), true);
  assert.equal(shouldPull(NaN, 1000, PULL_TTL_MS), true);
});

test("shouldPull: within the 6h window → false; past it → true", () => {
  const now = 100_000_000;
  assert.equal(shouldPull(now - (PULL_TTL_MS - 1), now, PULL_TTL_MS), false);
  assert.equal(shouldPull(now - PULL_TTL_MS, now, PULL_TTL_MS), true);
});

test("shouldPush: needs pending change AND an elapsed 15min window", () => {
  const now = 10_000_000;
  assert.equal(shouldPush(0, 0, now, WRITE_TTL_MS), false); // nothing dirty
  assert.equal(shouldPush(2, 0, now, WRITE_TTL_MS), true); // dirty + never pushed
  assert.equal(shouldPush(1, now - (WRITE_TTL_MS - 1), now, WRITE_TTL_MS), false); // too soon
  assert.equal(shouldPush(1, now - WRITE_TTL_MS, now, WRITE_TTL_MS), true);
});

test("changedEntries: reports added, changed, and removed(→0) ids", () => {
  const before = [{ id: "a", stars: 3 }, { id: "b", stars: 5 }];
  const after = [{ id: "a", stars: 7 }, { id: "c", stars: 2 }]; // a changed, b removed, c added
  const byId = Object.fromEntries(changedEntries(before, after).map((e) => [e.id, e.stars]));
  assert.deepEqual(byId, { a: 7, c: 2, b: 0 });
});

test("changedEntries: identical snapshots → empty", () => {
  const s = [{ id: "a", stars: 3 }];
  assert.equal(changedEntries(s, s.slice()).length, 0);
});

test("reconcileCourse: cloud wins when set, else keep local", () => {
  assert.equal(reconcileCourse("x", "y"), "y");
  assert.equal(reconcileCourse("x", ""), "x");
  assert.equal(reconcileCourse("", ""), "");
});
