// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS, levelRank, maxLevel, levelLabel } from "../js/levels.js";

test("LEVELS are in ascending rank order", () => {
  assert.equal(levelRank("early-school"), 0);
  assert.equal(levelRank("research"), LEVELS.length - 1);
  assert.ok(levelRank("undergraduate") > levelRank("later-school"));
});

test("levelRank throws on unknown level", () => {
  assert.throws(() => levelRank(/** @type {any} */ ("nonsense")));
});

test("maxLevel treats null as 'no level'", () => {
  assert.equal(maxLevel(null, null), null);
  assert.equal(maxLevel("undergraduate", null), "undergraduate");
  assert.equal(maxLevel(null, "graduate"), "graduate");
  assert.equal(maxLevel("early-school", "research"), "research");
  assert.equal(maxLevel("graduate", "later-school"), "graduate");
});

test("levelLabel is human friendly", () => {
  assert.equal(levelLabel("early-school"), "Early school");
  assert.equal(levelLabel("research"), "Research");
});
