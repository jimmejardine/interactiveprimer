// @ts-check
// Conflict-resolution cases specific to cross-device sync (millisecond `last` stamps). The broader
// merge/validate behaviour is covered by test/progress.test.js (via the js/progress.js re-export).
import test from "node:test";
import assert from "node:assert/strict";
import { mergeProgress } from "../js/progress-core.js";

/** @param {string} id @param {number} stars @param {string} first @param {string} last */
const e = (id, stars, first, last) => ({ id, stars, first, last });

test("two devices, same concept: the later millisecond `last` wins, order-independently", () => {
  const a = [e("calc", 4, "2026-07-01", "2026-07-07T09:00:00.000Z")];
  const b = [e("calc", 9, "2026-07-01", "2026-07-07T09:00:05.000Z")]; // 5s later, same day
  assert.equal(mergeProgress(a, b, "merge")[0].stars, 9);
  assert.equal(mergeProgress(b, a, "merge")[0].stars, 9); // whichever side is "incoming", newest wins
});

test("a date-only `last` loses a same-day tie to a precise instant", () => {
  const dateOnly = [e("x", 2, "2026-07-07", "2026-07-07")];
  const instant = [e("x", 8, "2026-07-07", "2026-07-07T12:00:00.000Z")];
  assert.equal(mergeProgress(dateOnly, instant, "merge")[0].stars, 8);
  assert.equal(mergeProgress(instant, dateOnly, "merge")[0].stars, 8);
});

test("two devices, different concepts: union — nothing is lost", () => {
  const a = [e("p", 3, "2026-07-01", "2026-07-01T00:00:00.000Z")];
  const b = [e("q", 6, "2026-07-02", "2026-07-02T00:00:00.000Z")];
  const merged = mergeProgress(a, b, "merge");
  assert.equal(merged.length, 2);
  assert.deepEqual(new Set(merged.map((m) => m.id)), new Set(["p", "q"]));
});
