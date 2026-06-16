// @ts-check
/**
 * Generation of randomly-generated test pages. Two question kinds:
 *  - multiple-choice (the authored entry has `options`): pick distinct questions and
 *    shuffle each one's options.
 *  - free-text (the authored entry has `answer`): the learner types an answer. When the
 *    entry also has `variables`, it's a TEMPLATE — random values are drawn, `{name}`
 *    placeholders in the prompt are filled, and the `answer` expression is evaluated to
 *    the expected value. A template is re-instantiable, so one template can produce many
 *    questions in a single quiz.
 *
 * All randomness flows through an injectable RNG (`() => number` in [0, 1)) so the logic
 * is deterministic under test. In the browser, pass `Math.random`.
 * @module
 */

import {
  parseVariables,
  instantiate,
  substitute,
  computeAnswer,
} from "./quiz-vars.js";

/** @typedef {import("./types/domain.js").QuizOption} QuizOption */
/** @typedef {import("./types/domain.js").QuizQuestion} QuizQuestion */
/** @typedef {import("./types/domain.js").TextQuestion} TextQuestion */
/** @typedef {import("./types/domain.js").AuthoredQuestion} AuthoredQuestion */
/** @typedef {import("./types/domain.js").GeneratedQuiz} GeneratedQuiz */
/** @typedef {import("./types/domain.js").GeneratedQuestion} GeneratedQuestion */

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

/** @param {AuthoredQuestion} q @returns {boolean} Whether it's a multiple-choice question. */
function isChoice(q) {
  return Array.isArray(/** @type {any} */ (q).options);
}
/** @param {AuthoredQuestion} q @returns {boolean} Whether it's a free-text question. */
function isText(q) {
  return /** @type {any} */ (q).answer !== undefined;
}
/** A free-text question with a non-empty `variables` spec can be re-instantiated.
 * @param {AuthoredQuestion} q @returns {boolean} */
function isTemplate(q) {
  const variables = /** @type {any} */ (q).variables;
  return isText(q) && typeof variables === "string" && variables.trim() !== "";
}

/**
 * Prepare a single question for rendering. Multiple-choice shuffles its options and
 * records the correct index; free-text instantiates its variables, fills `{name}`
 * placeholders, and computes the expected answer. Throws on a malformed question.
 * @param {AuthoredQuestion} question
 * @param {Rng} rng
 * @returns {GeneratedQuestion}
 */
export function generateQuestion(question, rng) {
  const choice = isChoice(question);
  const text = isText(question);
  if (choice && text) {
    throw new Error(`Question has both options and answer: "${question.prompt}"`);
  }
  if (!choice && !text) {
    throw new Error(`Question needs either options or answer: "${question.prompt}"`);
  }

  if (choice) {
    const q = /** @type {QuizQuestion} */ (question);
    if (q.options.length < 2) {
      throw new Error(`Question needs at least 2 options: "${q.prompt}"`);
    }
    const options = shuffle(q.options, rng);
    const correctIndex = options.findIndex((o) => o.correct);
    if (correctIndex === -1) {
      throw new Error(`Question has no correct option: "${q.prompt}"`);
    }
    return { kind: "choice", prompt: q.prompt, options, correctIndex };
  }

  const q = /** @type {TextQuestion} */ (question);
  const bindings = q.variables ? instantiate(parseVariables(q.variables), rng) : {};
  const prompt = substitute(q.prompt, bindings);
  const expected = computeAnswer(q.answer, bindings);
  return { kind: "text", prompt, expected, compare: q.compare };
}

/**
 * Generate a test from a bank: fill `count` questions. Static (non-template)
 * questions are used at most once (distinct, capped at how many were authored);
 * variable TEMPLATES are re-instantiable, so when templates are present `count` is
 * always satisfiable — one template can yield many random instances.
 * @param {AuthoredQuestion[]} bank
 * @param {number} count
 * @param {Rng} rng
 * @returns {GeneratedQuiz}
 */
export function generateQuiz(bank, count, rng) {
  if (bank.length === 0) throw new Error("Cannot generate a quiz from an empty bank");

  // First pass: each bank entry at most once, in random order (statics and templates
  // mixed, so both get a fair chance). To exceed the bank size, only templates repeat
  // (re-instantiated each time); with no templates, the quiz is capped at the bank size.
  const order = shuffle(bank, rng);
  const templates = shuffle(
    bank.filter((q) => isTemplate(q)),
    rng,
  );

  /** @type {AuthoredQuestion[]} */
  const picked = [];
  for (let i = 0; picked.length < count; i++) {
    if (i < order.length) picked.push(order[i]);
    else if (templates.length > 0) picked.push(templates[(i - order.length) % templates.length]);
    else break; // only statics, and they're exhausted
  }

  return { questions: picked.map((q) => generateQuestion(q, rng)) };
}
