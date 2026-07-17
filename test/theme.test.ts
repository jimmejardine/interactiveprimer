import test from "node:test";
import assert from "node:assert/strict";
import { pickInitialTheme, THEMES, catColor } from "../src/theme.ts";

/** Extract the hue number from an `hsl(h, s%, l%)` string. */
const hueOf = (s: string) => Number((s.match(/hsl\(([\d.]+)/) ?? [])[1]);

test("pickInitialTheme honours a valid stored choice", () => {
  assert.equal(pickInitialTheme("dark", false), "dark");
  assert.equal(pickInitialTheme("fun", true), "fun");
  assert.equal(pickInitialTheme("light", true), "light");
});

test("pickInitialTheme falls back to the OS preference when unset/invalid", () => {
  assert.equal(pickInitialTheme(null, true), "dark");
  assert.equal(pickInitialTheme(null, false), "light");
  assert.equal(pickInitialTheme(undefined, false), "light");
  assert.equal(pickInitialTheme("nonsense", true), "dark");
});

test("pickInitialTheme never auto-selects the fun theme", () => {
  assert.notEqual(pickInitialTheme(null, true), "fun");
  assert.notEqual(pickInitialTheme(null, false), "fun");
});

test("THEMES lists the three expected themes", () => {
  assert.deepEqual(
    THEMES.map((t) => t.id),
    ["light", "dark", "fun"],
  );
});

test("catColor rotates hue by the golden angle and passes through sat/light", () => {
  const p = { hue: 0, sat: "60%", light: "50%" };
  assert.equal(catColor(0, p), "hsl(0.0, 60%, 50%)");
  assert.ok(Math.abs(hueOf(catColor(1, p)) - 137.5) < 0.1);
  assert.ok(Math.abs(hueOf(catColor(2, p)) - 275.0) < 0.1); // 275.016 mod 360
  assert.ok(Math.abs(hueOf(catColor(3, p)) - 52.5) < 0.1); // 412.524 mod 360
});

test("catColor yields a distinct hue for each of the first 12 entries", () => {
  const p = { hue: 210, sat: "62%", light: "52%" };
  const hues = Array.from({ length: 12 }, (_, i) => hueOf(catColor(i, p)));
  assert.equal(new Set(hues).size, 12); // no collisions in the first dozen
  // The first few are well separated (low-discrepancy): consecutive entries ~137° apart.
  const gap = Math.abs(hues[0] - hues[1]);
  assert.ok(Math.min(gap, 360 - gap) > 90);
});
