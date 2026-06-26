// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { shuffle, generateQuestion, generateQuiz, extractConfig } from "../js/quiz.js";
import { registerQuiz, getQuiz } from "../js/scenes.js";

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

test("generateQuestion honours a variable constraint", () => {
  /** @type {QuizQuestion} */
  const vq = {
    prompt: "What is ${a} + {b}$?",
    variables: "a=[1:6] b=[1:6]",
    constraints: "a != b",
    options: [
      { text: "${a + b}$", correct: true },
      { text: "${2 * a}$", correct: false },
    ],
  };
  // Across many seeds the drawn a, b always differ → the two options never coincide.
  for (let seed = 1; seed <= 20; seed++) {
    const gen = generateQuestion(vq, seededRng(seed));
    if (gen.kind !== "choice") continue;
    const texts = gen.options.map((o) => o.text);
    assert.equal(new Set(texts).size, texts.length); // no duplicate option
  }
});

test("generateQuiz falls back past an unsatisfiable-constraint question", () => {
  /** @type {QuizQuestion[]} */
  const bank = [
    // Impossible: a and b are pinned to 5 but must differ → always re-rolls out.
    {
      prompt: "bad",
      variables: "a=[5:5] b=[5:5]",
      constraints: "a != b",
      options: [{ text: "${a}$", correct: true }, { text: "${b}$", correct: false }],
    },
    { prompt: "Q2", options: [{ text: "a", correct: true }, { text: "b", correct: false }] },
    { prompt: "Q3", options: [{ text: "a", correct: true }, { text: "b", correct: false }] },
  ];
  const quiz = generateQuiz(bank, 2, seededRng(7));
  assert.equal(quiz.questions.length, 2);
  assert.ok(quiz.questions.every((q) => /** @type {any} */ (q).prompt !== "bad")); // the bad one is dropped

  // A bank whose ONLY question is unsatisfiable can't build anything → throws.
  assert.throws(() => generateQuiz([bank[0]], 1, seededRng(7)));
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
  const prompts = all.questions.map((q) => /** @type {any} */ (q).prompt);
  assert.equal(new Set(prompts).size, 3); // distinct
});

test("generateQuiz rejects an empty bank", () => {
  assert.throws(() => generateQuiz([], 3, seededRng(1)));
});

test("generateQuiz: a static is drawn at most once; a template fills the rest", () => {
  /** @type {QuizQuestion[]} */
  const bank = [
    // One static MCQ (a fixed prompt) …
    { prompt: "static", options: [{ text: "a", correct: true }, { text: "b", correct: false }] },
    // … and one template that re-instantiates with fresh values.
    {
      prompt: "What is ${a} + {b}$?",
      variables: "a=[1:9] b=[1:9]",
      options: [{ text: "${a + b}$", correct: true }, { text: "${2 * a}$", correct: false }],
    },
  ];
  // Across many seeds: count (4) > bank size (2), yet it always fills to 4 because the template
  // repeats, and the lone static never appears more than once.
  for (let seed = 1; seed <= 30; seed++) {
    const quiz = generateQuiz(bank, 4, seededRng(seed));
    assert.equal(quiz.questions.length, 4);
    const statics = quiz.questions.filter((q) => /** @type {any} */ (q).prompt === "static");
    assert.ok(statics.length <= 1, `static appeared ${statics.length} times (seed ${seed})`);
  }
});

test("generateQuiz returns as many as possible when statics run out and there's no template", () => {
  /** @type {QuizQuestion[]} */
  const bank = [
    { prompt: "Q1", options: [{ text: "a", correct: true }, { text: "b", correct: false }] },
    { prompt: "Q2", options: [{ text: "a", correct: true }, { text: "b", correct: false }] },
  ];
  const quiz = generateQuiz(bank, 5, seededRng(7)); // ask for 5, only 2 statics exist
  assert.equal(quiz.questions.length, 2);
  assert.equal(new Set(quiz.questions.map((q) => /** @type {any} */ (q).prompt)).size, 2); // distinct
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

test("registerQuiz/getQuiz round-trips a builder, and its bank generates", () => {
  /** @type {import("../js/scenes.js").QuizBuilder} */
  const builder = ({ sceneStrings }) => [
    { prompt: () => sceneStrings("q"), options: [{ text: "$2$", correct: true }, { text: "$3$", correct: false }] },
  ];
  registerQuiz("test/demo@1", builder);
  assert.equal(getQuiz("test/demo@1"), builder);
  assert.equal(getQuiz("test/missing@1"), undefined);
  // The bank a builder returns feeds generateQuiz like any other (sceneStrings stubbed here),
  // after extractConfig splits off any leading config item (none here).
  const { questions } = extractConfig(builder({ sceneStrings: (k) => k }));
  const quiz = generateQuiz(questions, 1, seededRng(5));
  assert.equal(/** @type {any} */ (quiz.questions[0]).prompt, "q");
});

test("string and function forms of `text`/`answer` are identical", () => {
  // The same variables + seed draw the same bindings and shuffle identically, so the string form
  // (its `{…}` evaluated) and the function form must resolve to the same option text / expected.
  /** @type {QuizQuestion} */
  const stringMc = {
    prompt: "{a + b}",
    variables: "a=[1:9] b=[1:9]",
    options: [{ text: "${a + b}$", correct: true }, { text: "${2 * a}$", correct: false }],
  };
  /** @type {QuizQuestion} */
  const fnMc = {
    prompt: (v) => `${Number(v.a) + Number(v.b)}`,
    variables: "a=[1:9] b=[1:9]",
    options: [
      { text: (v) => `$${Number(v.a) + Number(v.b)}$`, correct: true },
      { text: (v) => `$${2 * Number(v.a)}$`, correct: false },
    ],
  };
  const s = generateQuestion(stringMc, seededRng(99));
  const f = generateQuestion(fnMc, seededRng(99));
  assert.equal(s.kind, "choice");
  assert.equal(f.kind, "choice");
  if (s.kind !== "choice" || f.kind !== "choice") return;
  assert.equal(s.prompt, f.prompt);
  assert.deepEqual(s.options.map((o) => o.text), f.options.map((o) => o.text));

  // Free-text answer: string expression vs function, same seed → same expected.
  const sa = generateQuestion({ prompt: "x", variables: "a=[1:9] b=[1:9]", answer: "a + b" }, seededRng(5));
  const fa = generateQuestion(
    { prompt: "x", variables: "a=[1:9] b=[1:9]", answer: (v) => Number(v.a) + Number(v.b) },
    seededRng(5),
  );
  assert.equal(sa.kind === "text" && sa.expected, fa.kind === "text" && fa.expected);
});

test("free-text: a function answer is computed from the drawn bindings", () => {
  const quiz = generateQuiz(
    [{ prompt: (v) => `What is ${v.a} + ${v.b}?`, variables: "a=[1:9] b=[1:9]", answer: (v) => Number(v.a) + Number(v.b) }],
    1,
    seededRng(7),
  );
  const q = quiz.questions[0];
  assert.equal(q.kind, "text");
  // The prompt function ran with the bindings, and `expected` equals their sum.
  const m = q.prompt.match(/What is (\d+) \+ (\d+)\?/);
  assert.ok(m, `prompt "${q.prompt}" should be filled from bindings`);
  assert.equal(q.kind === "text" && q.expected, Number(m[1]) + Number(m[2]));
});

test("free-text: a function prompt with no variables receives empty bindings", () => {
  const quiz = generateQuiz([{ prompt: () => "Capital of France?", answer: "Paris" }], 1, seededRng(1));
  assert.equal(/** @type {any} */ (quiz.questions[0]).prompt, "Capital of France?");
});

test("multiple-choice: function prompt and option text resolve from bindings", () => {
  const quiz = generateQuiz(
    [
      {
        prompt: (v) => `What is ${v.a} + ${v.b}?`,
        variables: "a=[1:9] b=[1:9]",
        options: [
          { text: (v) => String(Number(v.a) + Number(v.b)), correct: true },
          { text: (v) => String(Number(v.a) * Number(v.b) + 1), correct: false },
        ],
      },
    ],
    1,
    seededRng(3),
  );
  const q = quiz.questions[0];
  assert.equal(q.kind, "choice");
  if (q.kind !== "choice") return;
  const m = q.prompt.match(/What is (\d+) \+ (\d+)\?/);
  assert.ok(m, `prompt "${q.prompt}" should be filled from bindings`);
  // The correct option's resolved text equals the sum.
  assert.equal(q.options[q.correctIndex].text, String(Number(m[1]) + Number(m[2])));
});

test("extractConfig: a leading config item (no options/answer) is split from the questions", () => {
  /** @type {Array<any>} */
  const bank = [
    { num_questions: 4, preamble: "Solve each." },
    { prompt: "Q1", options: [{ text: "a", correct: true }, { text: "b", correct: false }] },
    { prompt: "Q2", answer: "Paris" },
  ];
  const { config, questions } = extractConfig(bank);
  assert.equal(config.num_questions, 4);
  assert.equal(config.preamble, "Solve each.");
  assert.equal(questions.length, 2);
  assert.equal(/** @type {any} */ (questions[0]).prompt, "Q1");
});

test("a geometry-problem question is generated as a problem kind, not mistaken for config", () => {
  // A leading {problem} item must NOT be eaten as config (it has no options/answer).
  /** @type {Array<any>} */
  const bank = [{ problem: "angleChase" }, { prompt: "Q1", answer: "Paris" }];
  const { config, questions } = extractConfig(bank);
  assert.deepEqual(config, {});
  assert.equal(questions.length, 2);
  const gen = generateQuestion({ problem: "angleChase" }, seededRng(1));
  assert.equal(gen.kind, "problem");
  assert.equal(/** @type {any} */ (gen).scene, "angleChase");
});

test("geometry option + figure carry through generation", () => {
  const choice = /** @type {any} */ (generateQuestion(
    {
      prompt: "Which shows alternate angles?",
      figure: "altFig",
      options: [{ geometry: "optA", correct: true }, { geometry: "optB", correct: false }],
    },
    seededRng(2),
  ));
  assert.equal(choice.kind, "choice");
  assert.equal(choice.figure, "altFig");
  assert.ok(choice.options.every((/** @type {any} */ o) => typeof o.geometry === "string"));

  const txt = /** @type {any} */ (generateQuestion(
    { prompt: "Find ∠x", figure: "chase", answer: 70, keyboard: "geometry" },
    seededRng(3),
  ));
  assert.equal(txt.kind, "text");
  assert.equal(txt.figure, "chase");
  assert.equal(txt.keyboard, "geometry");
  assert.equal(txt.expected, 70);
});

test("extractConfig: no config item → empty config and the whole bank is questions", () => {
  /** @type {Array<any>} */
  const bank = [
    { prompt: "Q1", options: [{ text: "a", correct: true }, { text: "b", correct: false }] },
    { prompt: "Q2", answer: "Paris" },
  ];
  const { config, questions } = extractConfig(bank);
  assert.deepEqual(config, {});
  assert.equal(questions.length, 2);
  // The generated quiz draws from exactly these questions.
  const quiz = generateQuiz(questions, 2, seededRng(1));
  assert.equal(quiz.questions.length, 2);
});

test("extractConfig: a config carrying only preamble leaves num_questions undefined (component defaults to 5)", () => {
  const { config, questions } = extractConfig([
    { preamble: "Read carefully." },
    { prompt: "Q1", answer: "x" },
  ]);
  assert.equal(config.preamble, "Read carefully.");
  assert.equal(config.num_questions, undefined);
  assert.equal(questions.length, 1);
});

test("multiple-choice: a chart option (no text) passes through untouched", () => {
  const quiz = generateQuiz(
    [
      {
        prompt: "Which graph?",
        options: [
          { chart: "optA", correct: true },
          { chart: "optB", correct: false },
        ],
      },
    ],
    1,
    seededRng(2),
  );
  const q = quiz.questions[0];
  assert.equal(q.kind, "choice");
  if (q.kind !== "choice") return;
  assert.ok(q.options.every((o) => typeof o.chart === "string" && o.text === undefined));
});
