import test from "node:test";
import assert from "node:assert/strict";
import { makeStrings, getSceneStrings } from "../src/scene-strings.ts";

/**
 * Build a fake `doc` whose querySelectorAll returns stub <script> elements by selector. `locale`
 * and `english` are the JSON text for the tagged / untagged scene-strings block(s) — a string for a
 * single block, or an array for several (the page may carry more than one); omit for absent.
 */
function fakeDoc({ locale, english }: { locale?: string | string[]; english?: string | string[] } = {}): any {
  const toList = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  return {
    querySelectorAll(selector: string) {
      // The locale selector carries [data-locale] but not :not(...); the English one is the :not.
      const wantsLocale = selector.includes("[data-locale]") && !selector.includes(":not");
      return toList(wantsLocale ? locale : english).map((textContent) => ({ textContent }));
    },
  };
}

const EN = `{ "addNumberLine@1": { "start": "Start at {a}.", "equation": "{a}+{b}={sum}" } }`;
const ES = `{ "addNumberLine@1": { "start": "Empieza en {a}." } }`;

test("uses the active-locale string when present", () => {
  const S = makeStrings("addNumberLine@1", fakeDoc({ locale: ES, english: EN }));
  assert.equal(S("start"), "Empieza en {a}.");
});

test("falls back to the English block per-key when the locale omits a key", () => {
  const S = makeStrings("addNumberLine@1", fakeDoc({ locale: ES, english: EN }));
  // `equation` is missing from the es overlay → English wins, no placeholder.
  assert.equal(S("equation"), "{a}+{b}={sum}");
});

test("English-only page (no locale block) returns the English string", () => {
  const S = makeStrings("addNumberLine@1", fakeDoc({ english: EN }));
  assert.equal(S("start"), "Start at {a}.");
});

test("missing in both blocks yields a visible placeholder", (t) => {
  // The fallback logs a diagnostic; mock console.error to keep the test output clean AND assert it fired.
  const err = t.mock.method(console, "error", () => {});
  const S = makeStrings("addNumberLine@1", fakeDoc({ locale: ES, english: EN }));
  assert.equal(S("nope"), "$$addNumberLine@1.nope$$");
  assert.equal(err.mock.callCount(), 1);
  assert.match(err.mock.calls[0].arguments[0], /addNumberLine@1\.nope/);
});

test("an unknown scene name yields placeholders for every key", (t) => {
  const err = t.mock.method(console, "error", () => {});
  const S = makeStrings("ghost@1", fakeDoc({ english: EN }));
  assert.equal(S("start"), "$$ghost@1.start$$");
  assert.equal(err.mock.callCount(), 1);
  assert.match(err.mock.calls[0].arguments[0], /ghost@1\.start/);
});

test("interpolates {vars} into the resolved string, leaving unknown placeholders intact", () => {
  const S = makeStrings("addNumberLine@1", fakeDoc({ english: EN }));
  assert.equal(S("start", { a: 7 }), "Start at 7.");
  assert.equal(S("equation", { a: 1, b: 2 }), "1+2={sum}"); // {sum} not provided → kept
});

test("merges several scene-strings blocks by namespace (disjoint namespaces combine)", () => {
  const sceneBlock = `{ "scene@1": { "s": "scene-en" } }`;
  const quizBlock = `{ "quiz@1": { "p": "quiz-en" } }`;
  // Two English blocks on the page — e.g. quiz strings kept separate from scene strings.
  const scene = makeStrings("scene@1", fakeDoc({ english: [sceneBlock, quizBlock] }));
  const quiz = makeStrings("quiz@1", fakeDoc({ english: [sceneBlock, quizBlock] }));
  assert.equal(scene("s"), "scene-en");
  assert.equal(quiz("p"), "quiz-en");
});

test("across multiple blocks, the locale value still overrides English per-key", () => {
  const enScene = `{ "scene@1": { "s": "scene-en" } }`;
  const enQuiz = `{ "quiz@1": { "p": "quiz-en" } }`;
  const esQuiz = `{ "quiz@1": { "p": "quiz-es" } }`;
  const S = makeStrings("quiz@1", fakeDoc({ english: [enScene, enQuiz], locale: [esQuiz] }));
  assert.equal(S("p"), "quiz-es");
});

test("getSceneStrings prefers the locale block, else English", () => {
  assert.deepEqual(getSceneStrings(fakeDoc({ locale: ES, english: EN })), {
    "addNumberLine@1": { start: "Empieza en {a}." },
  });
  assert.deepEqual(getSceneStrings(fakeDoc({ english: EN })), {
    "addNumberLine@1": { start: "Start at {a}.", equation: "{a}+{b}={sum}" },
  });
});
