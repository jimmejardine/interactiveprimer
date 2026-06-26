// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { getMathKeyboard } from "../js/math-keyboards.js";

test("getMathKeyboard returns a layout with rows for a known name", () => {
  const kb = getMathKeyboard("algebra-basic");
  assert.ok(kb, "algebra-basic should exist");
  assert.ok(Array.isArray(/** @type {any} */ (kb).rows));
  assert.ok(/** @type {any} */ (kb).rows.length > 0);
});

test("getMathKeyboard returns null for unknown / missing names", () => {
  assert.equal(getMathKeyboard("nope"), null);
  assert.equal(getMathKeyboard(undefined), null);
  assert.equal(getMathKeyboard(null), null);
  assert.equal(getMathKeyboard(""), null);
});

test("geometry-angles has a degree key and Greek unknowns; geometry-lengths has neither", () => {
  const ang = /** @type {any} */ (getMathKeyboard("geometry-angles"));
  assert.ok(ang, "geometry-angles keyboard should exist");
  const angInserts = ang.rows.flat().map((/** @type {any} */ c) => c.insert).filter(Boolean);
  assert.ok(angInserts.includes("^\\circ"), "angles keyboard should have a degree key");
  assert.ok(angInserts.includes("\\alpha") && angInserts.includes("\\theta"), "angles keyboard should have Greek unknowns");

  const len = /** @type {any} */ (getMathKeyboard("geometry-lengths"));
  assert.ok(len, "geometry-lengths keyboard should exist");
  const lenCaps = len.rows.flat();
  const lenInserts = lenCaps.map((/** @type {any} */ c) => c.insert).filter(Boolean);
  const lenLabels = lenCaps.map((/** @type {any} */ c) => c.label);
  assert.ok(!lenInserts.includes("^\\circ"), "lengths keyboard should NOT have a degree key");
  assert.ok(!lenInserts.includes("\\theta") && !lenInserts.includes("\\alpha"), "lengths keyboard should NOT have angle Greek");
  assert.ok(lenLabels.includes("a") || lenLabels.includes("x"), "lengths keyboard should carry a length variable");

  assert.equal(getMathKeyboard("geometry"), null, "the old 'geometry' keyboard is removed");
});
