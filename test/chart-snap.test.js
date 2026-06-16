// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { snapToAnchor } from "../js/chart-snap.js";

test("snaps to the nearest anchor within threshold", () => {
  assert.equal(snapToAnchor(0.94, [0, 1, 2, 3], 0.15), 1);
  assert.equal(snapToAnchor(88, [-180, -90, 0, 90, 180], 10), 90);
  assert.equal(snapToAnchor(-95, [-180, -90, 0, 90, 180], 10), -90);
});

test("leaves the value unchanged when no anchor is within threshold", () => {
  assert.equal(snapToAnchor(0.5, [0, 1, 2, 3], 0.15), 0.5);
  assert.equal(snapToAnchor(45, [-90, 0, 90], 10), 45);
});

test("an anchor exactly `threshold` away still snaps", () => {
  assert.equal(snapToAnchor(1.15, [0, 1, 2, 3], 0.15), 1);
});

test("an exact hit returns the anchor", () => {
  assert.equal(snapToAnchor(2, [0, 1, 2, 3], 0.15), 2);
});

test("picks the closer of two nearby anchors", () => {
  assert.equal(snapToAnchor(1.6, [1, 2], 0.5), 2);
  assert.equal(snapToAnchor(1.4, [1, 2], 0.5), 1);
});

test("on a tie keeps the first (nearest) anchor", () => {
  assert.equal(snapToAnchor(1.5, [1, 2], 0.6), 1);
});

test("empty / missing anchors and bad inputs return the value", () => {
  assert.equal(snapToAnchor(1.23, [], 0.5), 1.23);
  assert.equal(snapToAnchor(1.23, undefined, 0.5), 1.23);
  assert.equal(snapToAnchor(1.23, null, 0.5), 1.23);
  assert.equal(snapToAnchor(1.23, [0, 1], -1), 1.23); // negative threshold never snaps
});

test("skips non-finite anchors", () => {
  assert.equal(snapToAnchor(0.95, [Number.NaN, 1, Infinity], 0.15), 1);
});
