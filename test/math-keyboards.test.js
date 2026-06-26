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

test("the geometry keyboard exists and carries a degree key and Greek unknowns", () => {
  const kb = /** @type {any} */ (getMathKeyboard("geometry"));
  assert.ok(kb, "geometry keyboard should exist");
  const caps = kb.rows.flat();
  const inserts = caps.map((/** @type {any} */ c) => c.insert).filter(Boolean);
  assert.ok(
    inserts.includes("^\\circ"),
    "should have a degree-sign key",
  );
  assert.ok(inserts.includes("\\alpha") && inserts.includes("\\theta"), "should have Greek unknowns");
});
