// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import {
  reviewInterval,
  statusOf,
  courseProgress,
  activityBuckets,
  currentStreak,
  daysAgo,
  isGraduated,
  pickNextConcept,
  MASTERED_AT,
} from "../js/progress-stats.js";

const NOW = Date.parse("2026-07-08T12:00:00Z"); // "today" = 2026-07-08

/** Build the graph index + learner entries used across the tests. */
function fixture() {
  const byId = new Map([
    ["a", { prerequisites: [] }],
    ["b", { prerequisites: ["a"] }],
    ["c", { prerequisites: ["a", "b"] }],
    ["d", { prerequisites: ["z"] }], // z never mastered
    ["e", { prerequisites: ["a"] }], // a is mastered → ready
    ["f", { prerequisites: [] }], // no prereqs → ready
  ]);
  const entriesById = new Map([
    ["a", { stars: 10, first: "2026-07-08", last: "2026-07-08T10:00:00Z" }], // mastered, fresh
    ["b", { stars: 5, first: "2026-06-01", last: "2026-06-01T10:00:00Z" }], // learning, stale → review-due
  ]);
  const members = ["a", "b", "c", "d", "e", "f"];
  return { byId, entriesById, members };
}

test("reviewInterval lengthens with mastery, floored at 1 and capped", () => {
  assert.equal(reviewInterval(MASTERED_AT), 16); // 2^4
  assert.equal(reviewInterval(10), 64); // 2^6
  assert.equal(reviewInterval(1), 1); // 2^-3 → floor 1
  assert.equal(reviewInterval(30), 240); // capped
  assert.ok(reviewInterval(9) > reviewInterval(8));
});

test("statusOf classifies all five states", () => {
  const { byId, entriesById } = fixture();
  const opts = { masteredAt: MASTERED_AT, nowMs: NOW };
  assert.equal(statusOf("a", entriesById, byId, opts), "mastered"); // 10, fresh
  assert.equal(statusOf("b", entriesById, byId, opts), "review-due"); // 5, stale
  assert.equal(statusOf("c", entriesById, byId, opts), "locked"); // unrated, b not mastered
  assert.equal(statusOf("d", entriesById, byId, opts), "locked"); // unrated, z not mastered
  assert.equal(statusOf("e", entriesById, byId, opts), "ready"); // unrated, a mastered
  assert.equal(statusOf("f", entriesById, byId, opts), "ready"); // unrated, no prereqs
});

test("a fresh mastered concept is not yet review-due", () => {
  const { byId, entriesById } = fixture();
  // a was updated today; well within its interval.
  assert.equal(statusOf("a", entriesById, byId, { nowMs: NOW }), "mastered");
});

test("courseProgress rolls up counts, xp, frontier, reviews", () => {
  const { byId, entriesById, members } = fixture();
  const p = courseProgress(members, entriesById, byId, { masteredAt: MASTERED_AT, now: NOW });

  assert.equal(p.total, 6);
  assert.equal(p.started, 2); // a, b
  assert.equal(p.notStarted, 4);
  assert.equal(p.mastered, 1); // a
  assert.equal(p.learning, 1); // b
  assert.equal(p.ready, 2); // e, f
  assert.equal(p.locked, 2); // c, d
  assert.equal(p.reviewDue, 1); // b
  assert.equal(p.xp, 15); // 10 + 5
  assert.equal(p.xpMax, 60);
  assert.ok(Math.abs(p.fracMastered - 1 / 6) < 1e-9);
  assert.equal(p.lastActive, "2026-07-08");

  assert.deepEqual(
    p.frontier.map((c) => c.id),
    ["e", "f"],
  );
  assert.deepEqual(
    p.reviews.map((c) => c.id),
    ["b"],
  );
  // every member appears once, in order
  assert.deepEqual(
    p.perConcept.map((c) => c.id),
    members,
  );
});

test("reviews queue is sorted most-overdue first", () => {
  const byId = new Map([
    ["x", { prerequisites: [] }],
    ["y", { prerequisites: [] }],
  ]);
  const entriesById = new Map([
    ["x", { stars: 8, first: "2026-06-20", last: "2026-06-20T00:00:00Z" }], // interval 16d, ~18d overdue-ish
    ["y", { stars: 5, first: "2026-06-20", last: "2026-06-20T00:00:00Z" }], // interval 2d, far more overdue
  ]);
  const p = courseProgress(["x", "y"], entriesById, byId, { now: NOW });
  assert.deepEqual(
    p.reviews.map((c) => c.id),
    ["y", "x"],
  );
});

test("activityBuckets counts first and (distinct) last days", () => {
  const b = activityBuckets([
    { first: "2026-07-01", last: "2026-07-01T09:00:00Z" }, // same day → 1
    { first: "2026-07-01", last: "2026-07-03T09:00:00Z" }, // two days → +1 each
  ]);
  assert.equal(b.get("2026-07-01"), 2);
  assert.equal(b.get("2026-07-03"), 1);
});

test("currentStreak counts consecutive days ending today", () => {
  const entries = [
    { first: "2026-07-08", last: "2026-07-08T09:00:00Z" }, // today
    { first: "2026-07-07", last: "2026-07-07T09:00:00Z" }, // yesterday
    { first: "2026-07-05", last: "2026-07-05T09:00:00Z" }, // gap on the 6th
  ];
  assert.equal(currentStreak(entries, NOW), 2);
  // nothing today → streak 0
  assert.equal(currentStreak([{ first: "2026-07-06", last: "2026-07-06T09:00:00Z" }], NOW), 0);
});

test("isGraduated: perfect 10 revisited on a later day drops out of review", () => {
  assert.equal(isGraduated({ stars: 10, first: "2026-05-01", last: "2026-06-01T09:00:00Z" }), true);
  assert.equal(isGraduated({ stars: 10, first: "2026-07-08", last: "2026-07-08T09:00:00Z" }), false); // same day
  assert.equal(isGraduated({ stars: 9, first: "2026-05-01", last: "2026-06-01T09:00:00Z" }), false); // not 10
  assert.equal(isGraduated({ stars: 10, first: "", last: "" }), false); // undated legacy
});

test("a graduated 10/10 is never review-due even when stale; a same-day 10/10 still is", () => {
  const byId = new Map([
    ["g", { prerequisites: [] }],
    ["h", { prerequisites: [] }],
  ]);
  const entriesById = new Map([
    ["g", { stars: 10, first: "2026-05-01", last: "2026-06-01T00:00:00Z" }], // 10, redone later → graduated
    ["h", { stars: 10, first: "2026-05-01", last: "2026-05-01T00:00:00Z" }], // 10, rated once, now stale
  ]);
  const opts = { masteredAt: MASTERED_AT, nowMs: NOW };
  assert.equal(statusOf("g", entriesById, byId, opts), "mastered");
  assert.equal(statusOf("h", entriesById, byId, opts), "review-due");

  const p = courseProgress(["g", "h"], entriesById, byId, { now: NOW });
  assert.deepEqual(
    p.reviews.map((c) => c.id),
    ["h"],
  );
  assert.equal(p.reviewDue, 1);
});

test("pickNextConcept: ready-first (course order), then learning, then null", () => {
  const byId = new Map([
    ["a", { prerequisites: [] }],
    ["b", { prerequisites: ["a"] }],
    ["c", { prerequisites: ["b"] }],
  ]);
  const members = ["a", "b", "c"];
  const starsFrom = (/** @type {Record<string,number>} */ s) => (/** @type {string} */ id) => s[id] ?? 0;

  assert.equal(pickNextConcept(members, byId, starsFrom({})), "a"); // fresh → first base concept
  assert.equal(pickNextConcept(members, byId, starsFrom({ a: 10 })), "b"); // a mastered → b ready, c locked
  assert.equal(pickNextConcept(members, byId, starsFrom({ a: 10, b: 9 })), "c"); // b mastered → c ready
  assert.equal(pickNextConcept(members, byId, starsFrom({ a: 10, b: 4 })), "b"); // no ready → finish learning b
  assert.equal(pickNextConcept(members, byId, starsFrom({ a: 10, b: 8, c: 10 })), null); // all mastered
});

test("pickNextConcept: a ready concept beats an earlier learning one; locked concepts are skipped", () => {
  const byId = new Map([
    ["x", { prerequisites: [] }],
    ["y", { prerequisites: [] }],
  ]);
  // x is mid-learning (earlier in order), y is unstarted & ready → ready wins.
  assert.equal(pickNextConcept(["x", "y"], byId, (id) => (id === "x" ? 4 : 0)), "y");

  // Both unstarted but locked by an unmastered prereq → nothing ready, nothing learning → null.
  const locked = new Map([
    ["p", { prerequisites: ["z"] }],
    ["q", { prerequisites: ["p"] }],
  ]);
  assert.equal(pickNextConcept(["p", "q"], locked, () => 0), null);
});

test("daysAgo is floor of elapsed days, 0 for missing", () => {
  assert.equal(daysAgo("2026-07-01T12:00:00Z", NOW), 7);
  assert.equal(daysAgo("", NOW), 0);
});
