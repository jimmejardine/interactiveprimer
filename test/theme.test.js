// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { pickInitialTheme, THEMES } from "../js/theme.js";

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
