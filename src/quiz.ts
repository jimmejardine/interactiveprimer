/**
 * Generation of randomly-generated test pages. Question kinds:
 *  - multiple-choice (the authored entry has `options`): pick distinct questions and
 *    shuffle each one's options.
 *  - free-text (the authored entry has `answer`): the learner types an answer. When the
 *    entry also has `variables`, it's a TEMPLATE — random values are drawn, `{name}`
 *    placeholders in the prompt are filled, and the `answer` expression is evaluated to
 *    the expected value. A template is re-instantiable, so one template can produce many
 *    questions in a single quiz.
 *  - geometry problem (`problem`) and program exercise (`program`): a self-contained
 *    interactive element (`<primer-geometry-problem>` / `<primer-program>`) that generates
 *    and grades itself; generation just passes its registered name through as the `scene`.
 *
 * All randomness flows through an injectable RNG (`() => number` in [0, 1)) so the logic
 * is deterministic under test. In the browser, pass `Math.random`.
 * @module
 */

import {
  parseVariables,
  drawBindings,
  ConstraintError,
  substitute,
  fillExpressions,
  computeAnswer,
} from "./quiz-vars.ts";

import type {
  QuizConfig,
  QuizQuestion,
  TextQuestion,
  AuthoredQuestion,
  GeneratedQuiz,
  GeneratedQuestion,
} from "./types/domain.ts";

/** Returns a float in [0, 1). */
export type Rng = () => number;

/**
 * Fisher–Yates shuffle, returning a new array (does not mutate the input).
 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** A prompt for an error message: a string prompt as-is, a function prompt a generic label. */
function describe(prompt: unknown): string {
  return typeof prompt === "string" ? prompt : "<computed prompt>";
}

/** Whether it's a multiple-choice question. */
function isChoice(q: AuthoredQuestion): boolean {
  return Array.isArray((q as any).options);
}
/** Whether it's a free-text question. */
function isText(q: AuthoredQuestion): boolean {
  return (q as any).answer !== undefined;
}
/** Whether it's an interactive geometry-problem question. */
function isProblem(q: AuthoredQuestion): boolean {
  return typeof (q as any).problem === "string";
}
/** Whether it's a "write a program" question. */
function isProgram(q: AuthoredQuestion): boolean {
  return typeof (q as any).program === "string";
}

/**
 * Split a builder's returned array into an optional config object + the question bank. The
 * builder may return a CONFIG object as its FIRST item — recognized by having neither `options`
 * nor `answer` (so it isn't a question). It carries quiz-level settings: `num_questions` (how many
 * to draw) and `preamble` (an instructions sentence shown under the heading). When the first item
 * is a real question, there's no config and the whole array is the bank.
 */
export function extractConfig(
  bank: Array<AuthoredQuestion | QuizConfig>,
): { config: QuizConfig; questions: AuthoredQuestion[] } {
  const first = bank[0] as AuthoredQuestion;
  if (first && !isChoice(first) && !isText(first) && !isProblem(first) && !isProgram(first)) {
    return { config: bank[0] as QuizConfig, questions: bank.slice(1) as AuthoredQuestion[] };
  }
  return { config: {}, questions: bank as AuthoredQuestion[] };
}
/** A question with a non-empty `variables` spec can be re-instantiated (either kind —
 * free-text or multiple-choice). */
function isTemplate(q: AuthoredQuestion): boolean {
  const variables = (q as any).variables;
  return typeof variables === "string" && variables.trim() !== "";
}

/**
 * Prepare a single question for rendering. Multiple-choice shuffles its options and
 * records the correct index; free-text instantiates its variables, fills `{name}`
 * placeholders, and computes the expected answer. Throws on a malformed question.
 */
export function generateQuestion(question: AuthoredQuestion, rng: Rng): GeneratedQuestion {
  // An interactive geometry-problem question carries no options/answer — pass its scene straight
  // through (the <primer-geometry-problem> generates and grades itself; the quiz folds in its result).
  if (isProblem(question)) {
    return { kind: "problem", scene: (question as any).problem };
  }
  // A "write a program" question carries no options/answer — pass its program name straight through
  // (the <primer-program> generates + grades itself; the quiz folds in its result).
  if (isProgram(question)) {
    return { kind: "program", scene: (question as any).program };
  }
  const choice = isChoice(question);
  const text = isText(question);
  if (choice && text) {
    throw new Error(`Question has both options and answer: "${describe((question as any).prompt)}"`);
  }
  if (!choice && !text) {
    throw new Error(`Question needs either options or answer: "${describe((question as any).prompt)}"`);
  }

  if (choice) {
    const q = question as QuizQuestion;
    if (q.options.length < 2) {
      throw new Error(`Question needs at least 2 options: "${describe(q.prompt)}"`);
    }
    // Optional randomized template: draw values (re-rolling until `constraints` hold). A `prompt`
    // or option `text` may be a FUNCTION of the bindings (called with them); a string instead has
    // its `{expr}` groups evaluated when there are variables (non-variable string MCQs are
    // unchanged). Chart options (no `text`) pass through untouched.
    const bindings = q.variables
      ? drawBindings(parseVariables(q.variables), q.constraints, rng)
      : null;
    const b = bindings ?? {};
    const prompt =
      typeof q.prompt === "function" ? q.prompt(b) : bindings ? fillExpressions(q.prompt, bindings) : q.prompt;
    const prepared = q.options.map((o) => {
      const text =
        typeof o.text === "function"
          ? o.text(b)
          : bindings && o.text !== undefined
            ? fillExpressions(o.text, bindings)
            : o.text;
      return { ...o, text };
    });
    const options = shuffle(prepared, rng);
    const correctIndex = options.findIndex((o) => o.correct);
    if (correctIndex === -1) {
      throw new Error(`Question has no correct option: "${describe(prompt)}"`);
    }
    return { kind: "choice", prompt, options, correctIndex, figure: (q as any).figure };
  }

  const q = question as TextQuestion;
  const bindings = q.variables
    ? drawBindings(parseVariables(q.variables), q.constraints, rng)
    : {};
  // `prompt` and `answer` may each be a FUNCTION of the bindings (e.g. `answer: (b) => b.a + b.b`);
  // a string `prompt` fills its `{name}` placeholders and a string/number `answer` is evaluated.
  const prompt = typeof q.prompt === "function" ? q.prompt(bindings) : substitute(q.prompt, bindings);
  const expected = typeof q.answer === "function" ? q.answer(bindings) : computeAnswer(q.answer, bindings);
  return { kind: "text", prompt, expected, compare: q.compare, keyboard: q.keyboard, figure: (q as any).figure };
}

/**
 * Generate a test from a bank: draw up to `count` questions by repeatedly picking a uniformly
 * random entry from a live pool. When an entry is picked it leaves the pool — UNLESS it's a
 * variable TEMPLATE (`isTemplate`), which stays and can be drawn again (re-instantiated with fresh
 * values each time). So a static question appears at most once (a quiz is distinct, capped at how
 * many statics were authored), while a single template can fill many slots.
 *
 * If a picked question's `constraints` can't be satisfied (a {@link ConstraintError} after the
 * re-roll limit) it leaves the pool too — even a template, since an unsatisfiable spec can never be
 * drawn — and selection continues from the rest. If the pool empties before reaching `count`, the
 * quiz is built from as many as were possible. Throws on an empty bank, or if NOTHING could be built;
 * other errors (a malformed question) propagate so authoring mistakes surface.
 */
export function generateQuiz(bank: AuthoredQuestion[], count: number, rng: Rng): GeneratedQuiz {
  if (bank.length === 0) throw new Error("Cannot generate a quiz from an empty bank");

  const pool = bank.slice(); // live working copy: statics are spliced out on pick; templates stay
  const questions: GeneratedQuestion[] = [];

  while (questions.length < count && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    const candidate = pool[i];
    try {
      questions.push(generateQuestion(candidate, rng));
      // A static is used once → remove it. A template stays so it can be drawn again.
      if (!isTemplate(candidate)) pool.splice(i, 1);
    } catch (err) {
      if (err instanceof ConstraintError) {
        pool.splice(i, 1); // unsatisfiable — drop it (even a template) and draw another
        continue;
      }
      throw err; // malformed question, etc. — surface it
    }
  }

  if (questions.length === 0) {
    throw new Error("Couldn't build any quiz questions (constraints unsatisfiable?)");
  }
  return { questions };
}
