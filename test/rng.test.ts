import test from "node:test";
import assert from "node:assert/strict";
import { makeRng } from "../src/rng.ts";

test("the same seed yields the same sequence (deterministic)", () => {
  const a = makeRng(12345);
  const b = makeRng(12345);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test("different seeds yield different sequences", () => {
  const a = makeRng(1);
  const b = makeRng(2);
  assert.notEqual(a(), b());
});

test("rng() stays in [0, 1)", () => {
  const r = makeRng(99);
  for (let i = 0; i < 500; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});

test("int(lo, hi) is inclusive and in range", () => {
  const r = makeRng(7);
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const v = r.int(1, 6);
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 6, `bad int: ${v}`);
    seen.add(v);
  }
  // Over 1000 draws of a d6 every face should appear (incl. the inclusive endpoints 1 and 6).
  for (const face of [1, 2, 3, 4, 5, 6]) assert.ok(seen.has(face), `face ${face} never drawn`);
});

test("int with lo === hi always returns that value", () => {
  const r = makeRng(3);
  for (let i = 0; i < 10; i++) assert.equal(r.int(4, 4), 4);
});

test("pick returns an element of the array (deterministically per seed)", () => {
  const arr = ["a", "b", "c", "d"];
  const r = makeRng(42);
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(r.pick(arr)));
  // same seed → same first pick
  assert.equal(makeRng(42).pick(arr), makeRng(42).pick(arr));
});
