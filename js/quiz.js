// @ts-check
/**
 * Generation of "randomly generated multiple choice test" pages.
 *
 * All randomness flows through an injectable RNG (`() => number` in [0, 1)) so the
 * logic is deterministic under test. In the browser, pass `Math.random`.
 * @module
 */

/** @typedef {import("./types/domain.js").QuizQuestion} QuizQuestion */
/** @typedef {import("./types/domain.js").GeneratedQuiz} GeneratedQuiz */
/** @typedef {import("./types/domain.js").GeneratedQuestion} GeneratedQuestion */
/** @typedef {import("./types/domain.js").QuizOption} QuizOption */

/**
 * @callback Rng
 * @returns {number} A float in [0, 1).
 */

/**
 * Fisher–Yates shuffle, returning a new array (does not mutate the input).
 * @template T
 * @param {readonly T[]} items
 * @param {Rng} rng
 * @returns {T[]}
 */
export function shuffle(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Prepare a single question: shuffle its options and record the correct index.
 * Throws if the question has fewer than two options or no correct option.
 * @param {QuizQuestion} question
 * @param {Rng} rng
 * @returns {GeneratedQuestion}
 */
export function generateQuestion(question, rng) {
  if (question.options.length < 2) {
    throw new Error(`Question needs at least 2 options: "${question.prompt}"`);
  }
  const options = shuffle(question.options, rng);
  const correctIndex = options.findIndex((o) => o.correct);
  if (correctIndex === -1) {
    throw new Error(`Question has no correct option: "${question.prompt}"`);
  }
  return { prompt: question.prompt, options, correctIndex };
}

/**
 * Generate a test from a bank of questions: pick `count` distinct questions at
 * random, then shuffle each one's options. If `count` exceeds the bank size, all
 * questions are used.
 * @param {QuizQuestion[]} bank
 * @param {number} count
 * @param {Rng} rng
 * @returns {GeneratedQuiz}
 */
export function generateQuiz(bank, count, rng) {
  if (bank.length === 0) throw new Error("Cannot generate a quiz from an empty bank");
  const take = Math.min(count, bank.length);
  const picked = shuffle(bank, rng).slice(0, take);
  return { questions: picked.map((q) => generateQuestion(q, rng)) };
}
