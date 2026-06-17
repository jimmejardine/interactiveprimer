// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { computeRange, resolveLineStyle, createSliderBroker } from "../js/charts.js";

const DEG = Math.PI / 180;
/** @param {number} a @param {number} b */
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

/* ----------------------------- computeRange ----------------------------- */

test("computeRange: symmetric padded range from the data peak", () => {
  const r = computeRange([(x) => Math.sin(x * DEG)]); // peak 1 over ±360°
  approx(r.ymax, 1.2);
  approx(r.ymin, -1.2);
});

test("computeRange: the tallest function in a group drives the shared range", () => {
  const r = computeRange([(x) => Math.sin(x * DEG), (x) => 2 * Math.sin(x * DEG), (x) => 0.5 * Math.sin(x * DEG)]);
  approx(r.ymax, 2.4); // 2 * pad(1.2)
  approx(r.ymin, -2.4);
});

test("computeRange: floor guarantees a non-zero range for a flat function", () => {
  const r = computeRange([() => 0]);
  approx(r.ymax, 1.2); // floor 1 * pad 1.2
});

test("computeRange: custom pad and floor are honoured", () => {
  approx(computeRange([() => 0], { pad: 2, floor: 3 }).ymax, 6);
  approx(computeRange([(x) => 5 * Math.sin(x * DEG)], { pad: 1 }).ymax, 5);
});

test("computeRange: non-finite samples are ignored", () => {
  const r = computeRange([(x) => (x > 0 ? 2 : Infinity)]); // finite samples peak at 2
  approx(r.ymax, 2.4);
});

test("computeRange: a throwing function can't break sampling", () => {
  const r = computeRange([
    () => {
      throw new Error("boom");
    },
  ]);
  approx(r.ymax, 1.2); // all samples bad → floor
});

/* ---------------------------- resolveLineStyle --------------------------- */

const V = { bg: "#bg", ink: "#ink", line: "#line", cat: ["#c0", "#c1", "#c2"] };

test("resolveLineStyle: defaults strokeColor to the categorical palette by index", () => {
  assert.deepEqual(resolveLineStyle(undefined, V, 0), { strokeColor: "#c0" });
  assert.deepEqual(resolveLineStyle(undefined, V, 2), { strokeColor: "#c2" });
});

test("resolveLineStyle: an object applies to every curve and can override the colour", () => {
  assert.deepEqual(resolveLineStyle({ strokeWidth: 3 }, V, 1), { strokeColor: "#c1", strokeWidth: 3 });
  assert.deepEqual(resolveLineStyle({ strokeColor: "#z" }, V, 0), { strokeColor: "#z" });
});

test("resolveLineStyle: an array indexes per curve", () => {
  const line = [{ strokeColor: "#z" }, {}];
  assert.deepEqual(resolveLineStyle(line, V, 0), { strokeColor: "#z" });
  assert.deepEqual(resolveLineStyle(line, V, 1), { strokeColor: "#c1" }); // {} → default cat[1]
});

test("resolveLineStyle: a function receives live colours and the index", () => {
  /** @param {{ line: string }} v @param {number} i */
  const line = (v, i) => ({ strokeColor: v.line, dash: i });
  assert.deepEqual(resolveLineStyle(line, V, 2), { strokeColor: "#line", dash: 2 });
});

/* -------------------------------- broker -------------------------------- */

test("broker: ensureGroup seeds values from value ?? min", () => {
  const b = createSliderBroker();
  b.ensureGroup("g", [
    { name: "A", min: 0, max: 3, value: 1 },
    { name: "f", min: 1, max: 4 },
  ]);
  assert.deepEqual(b.getGroup("g")?.values, { A: 1, f: 1 });
});

test("broker: subscribe immediately invokes with current values and returns an unsubscribe", () => {
  const b = createSliderBroker();
  b.ensureGroup("g", [{ name: "A", min: 0, max: 3, value: 1 }]);
  /** @type {Record<string, number>[]} */
  const calls = [];
  const un = b.subscribe("g", (v) => calls.push(v));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { A: 1 });
  assert.equal(typeof un, "function");
});

test("broker: setValues merges and notifies ALL subscribers", () => {
  const b = createSliderBroker();
  b.ensureGroup("g", [
    { name: "A", min: 0, max: 3, value: 1 },
    { name: "f", min: 0, max: 4, value: 1 },
  ]);
  /** @type {Record<string, number>[]} */
  const a = [];
  /** @type {Record<string, number>[]} */
  const c = [];
  b.subscribe("g", (v) => a.push(v));
  b.subscribe("g", (v) => c.push(v));
  b.setValues("g", { A: 2 });
  assert.deepEqual(a.at(-1), { A: 2, f: 1 });
  assert.deepEqual(c.at(-1), { A: 2, f: 1 });
  assert.deepEqual(b.getGroup("g")?.values, { A: 2, f: 1 });
});

test("broker: unsubscribe stops further notifications without throwing", () => {
  const b = createSliderBroker();
  b.ensureGroup("g", [{ name: "A", min: 0, max: 3, value: 1 }]);
  /** @type {Record<string, number>[]} */
  const calls = [];
  const un = b.subscribe("g", (v) => calls.push(v));
  un();
  b.setValues("g", { A: 2 });
  assert.equal(calls.length, 1); // only the immediate invoke
});

test("broker: subscribing to an unknown group is a no-op", () => {
  const b = createSliderBroker();
  const un = b.subscribe("nope", () => assert.fail("should not be called"));
  assert.doesNotThrow(un);
});

test("broker: linkChart maps a chart name to its group", () => {
  const b = createSliderBroker();
  b.ensureGroup("g", [{ name: "A", min: 0, max: 1 }]);
  b.linkChart("chartX", "g");
  assert.equal(b.groupForChart("chartX"), "g");
  assert.equal(b.groupForChart("unknown"), undefined);
});

test("broker: ensureGroup keeps live values when re-registered", () => {
  const b = createSliderBroker();
  b.ensureGroup("g", [{ name: "A", min: 0, max: 3, value: 1 }]);
  b.setValues("g", { A: 2 });
  b.ensureGroup("g", [
    { name: "A", min: 0, max: 3, value: 1 },
    { name: "B", min: 0, max: 5, value: 4 },
  ]);
  assert.deepEqual(b.getGroup("g")?.values, { A: 2, B: 4 }); // A kept, B seeded
});
