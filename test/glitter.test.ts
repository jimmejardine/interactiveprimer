import test from "node:test";
import assert from "node:assert/strict";
import { glitterIntensity } from "../src/glitter.ts";

test("no glitter below 70%", () => {
  assert.equal(glitterIntensity(0), 0);
  assert.equal(glitterIntensity(0.5), 0);
  assert.equal(glitterIntensity(0.699), 0);
});

test("at exactly 70% there is a small (non-zero) glitter floor", () => {
  assert.ok(glitterIntensity(0.7) > 0); // e.g. 7/10 still sparkles
  assert.ok(Math.abs(glitterIntensity(0.7) - 0.15) < 1e-9);
});

test("ramps from the 70% floor up to full at 100%", () => {
  assert.ok(glitterIntensity(0.85) > glitterIntensity(0.7)); // monotonic increase
  assert.ok(Math.abs(glitterIntensity(0.85) - 0.575) < 1e-9); // 0.15 + 0.85 * 0.5
  assert.equal(glitterIntensity(1), 1);
});

test("clamps above 100%", () => {
  assert.equal(glitterIntensity(1.5), 1);
});
