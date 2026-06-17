// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { makeSceneStrings, getSceneStrings } from "../js/scene-strings.js";

/**
 * Build a fake `doc` whose querySelector returns stub <script> elements by selector. `locale`
 * and `english` are the JSON text for the tagged / untagged scene-strings blocks (omit for absent).
 * @param {{ locale?: string, english?: string }} blocks
 * @returns {any}
 */
function fakeDoc({ locale, english } = {}) {
  return {
    /** @param {string} selector */
    querySelector(selector) {
      // The locale selector carries [data-locale] but not :not(...); the English one is the :not.
      const wantsLocale = selector.includes("[data-locale]") && !selector.includes(":not");
      const text = wantsLocale ? locale : english;
      return text == null ? null : { textContent: text };
    },
  };
}

const EN = `{ "addNumberLine@1": { "start": "Start at {a}.", "equation": "{a}+{b}={sum}" } }`;
const ES = `{ "addNumberLine@1": { "start": "Empieza en {a}." } }`;

test("uses the active-locale string when present", () => {
  const S = makeSceneStrings("addNumberLine@1", fakeDoc({ locale: ES, english: EN }));
  assert.equal(S("start"), "Empieza en {a}.");
});

test("falls back to the English block per-key when the locale omits a key", () => {
  const S = makeSceneStrings("addNumberLine@1", fakeDoc({ locale: ES, english: EN }));
  // `equation` is missing from the es overlay → English wins, no placeholder.
  assert.equal(S("equation"), "{a}+{b}={sum}");
});

test("English-only page (no locale block) returns the English string", () => {
  const S = makeSceneStrings("addNumberLine@1", fakeDoc({ english: EN }));
  assert.equal(S("start"), "Start at {a}.");
});

test("missing in both blocks yields a visible placeholder", () => {
  const S = makeSceneStrings("addNumberLine@1", fakeDoc({ locale: ES, english: EN }));
  assert.equal(S("nope"), "$$addNumberLine@1.nope$$");
});

test("an unknown scene name yields placeholders for every key", () => {
  const S = makeSceneStrings("ghost@1", fakeDoc({ english: EN }));
  assert.equal(S("start"), "$$ghost@1.start$$");
});

test("interpolates {vars} into the resolved string, leaving unknown placeholders intact", () => {
  const S = makeSceneStrings("addNumberLine@1", fakeDoc({ english: EN }));
  assert.equal(S("start", { a: 7 }), "Start at 7.");
  assert.equal(S("equation", { a: 1, b: 2 }), "1+2={sum}"); // {sum} not provided → kept
});

test("getSceneStrings prefers the locale block, else English", () => {
  assert.deepEqual(getSceneStrings(fakeDoc({ locale: ES, english: EN })), {
    "addNumberLine@1": { start: "Empieza en {a}." },
  });
  assert.deepEqual(getSceneStrings(fakeDoc({ english: EN })), {
    "addNumberLine@1": { start: "Start at {a}.", equation: "{a}+{b}={sum}" },
  });
});
