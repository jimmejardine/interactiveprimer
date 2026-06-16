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
  assert.equal(gen.kind, "choice");
  if (gen.kind !== "choice") return;
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

test("generateQuestion evaluates a variable multiple-choice question", () => {
  /** @type {QuizQuestion} */
  const vq = {
    prompt: "What is ${a} + {b}$?",
    variables: "a=[3:3] b=[5:5]", // fixed so the assertions are deterministic
    options: [
      { text: "${a + b}$", correct: true },
      { text: "${2 * a}$", correct: false },
      { text: "${a}{b}$", correct: false },
    ],
  };
  const gen = generateQuestion(vq, seededRng(3));
  assert.equal(gen.kind, "choice");
  if (gen.kind !== "choice") return;
  assert.equal(gen.prompt, "What is $3 + 5$?"); // {a}/{b} filled
  // The authored-correct option still wins after fill + shuffle, and renders the sum.
  assert.equal(gen.options[gen.correctIndex].text, "$8$");
  // Distractors are computed too: 2*a = 6, and {a}{b} concatenates to 35.
  const texts = gen.options.map((o) => o.text).sort();
  assert.deepEqual(texts, ["$35$", "$6$", "$8$"]);
});

test("a variable multiple-choice question is a re-instantiable template", () => {
  /** @type {QuizQuestion[]} */
  const bank = [
    {
      prompt: "What is ${a} + {b}$?",
      variables: "a=[1:9] b=[1:9]",
      options: [
        { text: "${a + b}$", correct: true },
        { text: "${2 * a}$", correct: false },
      ],
    },
  ];
  // One template, but count > bank size is satisfiable because it re-instantiates.
  const quiz = generateQuiz(bank, 4, seededRng(11));
  assert.equal(quiz.questions.length, 4);
  assert.ok(quiz.questions.every((q) => q.kind === "choice"));
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

test("free-text template re-instantiates to fill count past bank size", () => {
  const bank = [
    { prompt: "What is ${a} + {b}$?", variables: "a=[1:9] b=[1:9]", answer: "a + b" },
  ];
  const quiz = generateQuiz(bank, 3, seededRng(5));
  assert.equal(quiz.questions.length, 3); // one template → three instances

  for (const q of quiz.questions) {
    if (q.kind !== "text") {
      assert.fail("expected a free-text question");
      continue;
    }
    // The expected answer must equal the sum of the two numbers shown in the prompt.
    const nums = /** @type {RegExpMatchArray} */ (q.prompt.match(/-?\d+/g)).map(Number);
    assert.equal(q.expected, nums[0] + nums[1]);
  }
});

test("free-text question without variables uses a literal answer", () => {
  const quiz = generateQuiz([{ prompt: "Capital of France?", answer: "Paris" }], 1, seededRng(1));
  const q = quiz.questions[0];
  assert.equal(q.kind, "text");
  assert.equal(q.kind === "text" && q.expected, "Paris");
});

test("generateQuestion rejects a question with both options and answer", () => {
  assert.throws(
    () =>
      generateQuestion(
        /** @type {any} */ ({
          prompt: "ambiguous",
          options: [{ text: "a", correct: true }],
          answer: "x",
        }),
        seededRng(1),
      ),
    /both options and answer/,
  );
});

test("generateQuestion rejects a question with neither options nor answer", () => {
  assert.throws(
    () => generateQuestion(/** @type {any} */ ({ prompt: "empty" }), seededRng(1)),
    /either options or answer/,
  );
});
