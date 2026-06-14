// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { shuffle, generateQuestion, generateQuiz } from "../js/quiz.js";

/** @typedef {import("../js/types/domain.js").QuizQuestion} QuizQuestion */

/**
 * Deterministic RNG: a simple seeded LCG so tests are reproducible.
 * @param {number} seed
 * @returns {() => number}
 */
function seededRng(seed) {
  let state = seed >>> 0;
  return () => {
    // Numerical Recipes LCG.
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test("shuffle is a permutation and does not mutate input", () => {
  const input = [1, 2, 3, 4, 5];
  const out = shuffle(input, seededRng(42));
  assert.deepEqual(input, [1, 2, 3, 4, 5]); // unchanged
  assert.deepEqual(new Set(out), new Set(input)); // same elements
  assert.equal(out.length, input.length);
});

/** @type {QuizQuestion} */
const q = {
  prompt: "What is $2 + 2$?",
  options: [
    { text: "3", correct: false },
    { text: "4", correct: true },
    { text: "5", correct: false },
  ],
};

test("generateQuestion shuffles options and tracks the correct index", () => {
  const gen = generateQuestion(q, seededRng(7));
  assert.equal(gen.options.length, 3);
  assert.equal(gen.options[gen.correctIndex].text, "4");
  assert.ok(gen.options[gen.correctIndex].correct);
});

test("generateQuestion rejects malformed questions", () => {
  assert.throws(() =>
    generateQuestion({ prompt: "bad", options: [{ text: "only", correct: true }] }, seededRng(1)),
  );
  assert.throws(() =>
    generateQuestion(
      { prompt: "no correct", options: [{ text: "a", correct: false }, { text: "b", correct: false }] },
      seededRng(1),
    ),
  );
});

test("generateQuiz picks distinct questions, capped at bank size", () => {
  /** @type {QuizQuestion[]} */
  const bank = [
    { prompt: "Q1", options: [{ text: "a", correct: true }, { text: "b", correct: false }] },
    { prompt: "Q2", options: [{ text: "a", correct: true }, { text: "b", correct: false }] },
    { prompt: "Q3", options: [{ text: "a", correct: true }, { text: "b", correct: false }] },
  ];
  const quiz = generateQuiz(bank, 2, seededRng(99));
  assert.equal(quiz.questions.length, 2);

  const all = generateQuiz(bank, 10, seededRng(99));
  assert.equal(all.questions.length, 3); // capped at bank size
  const prompts = all.questions.map((q) => q.prompt);
  assert.equal(new Set(prompts).size, 3); // distinct
});

test("generateQuiz rejects an empty bank", () => {
  assert.throws(() => generateQuiz([], 3, seededRng(1)));
});
