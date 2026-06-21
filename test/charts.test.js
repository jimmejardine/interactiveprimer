// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { computeRange, resolveLineStyle, resolveLegend, createSliderBroker } from "../js/charts.js";

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

const COLORS = { bg: "#bg", ink: "#ink", line: "#line", cat: ["#c0", "#c1", "#c2"] };

test("resolveLineStyle: defaults strokeColor to the categorical palette by index", () => {
  assert.deepEqual(resolveLineStyle(undefined, COLORS, 0), { strokeColor: "#c0" });
  assert.deepEqual(resolveLineStyle(undefined, COLORS, 2), { strokeColor: "#c2" });
});

test("resolveLineStyle: an object applies to every curve and can override the colour", () => {
  assert.deepEqual(resolveLineStyle({ strokeWidth: 3 }, COLORS, 1), { strokeColor: "#c1", strokeWidth: 3 });
  assert.deepEqual(resolveLineStyle({ strokeColor: "#z" }, COLORS, 0), { strokeColor: "#z" });
});

test("resolveLineStyle: an array indexes per curve", () => {
  const line = [{ strokeColor: "#z" }, {}];
  assert.deepEqual(resolveLineStyle(line, COLORS, 0), { strokeColor: "#z" });
  assert.deepEqual(resolveLineStyle(line, COLORS, 1), { strokeColor: "#c1" }); // {} → default cat[1]
});

test("resolveLineStyle: a function receives live colours and the index", () => {
  /** @param {{ line: string }} colors @param {number} i */
  const line = (colors, i) => ({ strokeColor: colors.line, dash: i });
  assert.deepEqual(resolveLineStyle(line, COLORS, 2), { strokeColor: "#line", dash: 2 });
});

/* ------------------------------ resolveLegend --------------------------- */

test("resolveLegend: non-array legend yields no entries", () => {
  assert.deepEqual(resolveLegend(null, undefined, COLORS), []);
  assert.deepEqual(resolveLegend(undefined, undefined, COLORS), []);
});

test("resolveLegend: colour + dash come from the matching curve style (per-index array)", () => {
  const line = [{ strokeColor: "#z" }, { dash: 2 }];
  assert.deepEqual(resolveLegend(["A", "B"], line, COLORS), [
    { label: "A", color: "#z", dashed: false }, // no dash → solid
    { label: "B", color: "#c1", dashed: true }, // default cat[1], dashed
  ]);
});

test("resolveLegend: a function line style is evaluated per index", () => {
  /** @param {{ cat: string[] }} colors @param {number} i */
  const line = (colors, i) => ({ strokeColor: colors.cat[i], dash: i === 0 ? 0 : 2 });
  assert.deepEqual(resolveLegend(["x", "x′"], line, COLORS), [
    { label: "x", color: "#c0", dashed: false }, // dash 0 → solid
    { label: "x′", color: "#c1", dashed: true },
  ]);
});

test("resolveLegend: label thunks are resolved at call time", () => {
  assert.deepEqual(resolveLegend([() => "lazy", "plain"], undefined, COLORS), [
    { label: "lazy", color: "#c0", dashed: false },
    { label: "plain", color: "#c1", dashed: false },
  ]);
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

test("broker: a mixed slider + choice group seeds the choice index and round-trips it", () => {
  const b = createSliderBroker();
  b.ensureGroup("g", [
    { name: "x", min: -5, max: 5, value: 0 },
    { name: "rule", type: "choice", options: ["2x+1", "x²", "x/2"], value: 1 },
  ]);
  assert.deepEqual(b.getGroup("g")?.values, { x: 0, rule: 1 }); // choice seeded from `value`
  /** @type {Record<string, number>[]} */
  const seen = [];
  b.subscribe("g", (v) => seen.push(v));
  b.setValues("g", { rule: 2 }); // selecting a different option
  assert.deepEqual(seen.at(-1), { x: 0, rule: 2 });
});

test("broker: a choice def with no explicit value seeds to index 0", () => {
  const b = createSliderBroker();
  b.ensureGroup("g", [{ name: "mode", type: "choice", options: ["a", "b"] }]);
  assert.deepEqual(b.getGroup("g")?.values, { mode: 0 });
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
