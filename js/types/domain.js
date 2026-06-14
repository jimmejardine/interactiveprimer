// @ts-check
/**
 * Core domain types for the Interactive Primer, expressed as JSDoc typedefs so
 * they are checked by `tsc --noEmit` without any build step. Import them with
 * `import("../types/domain.js").Concept` style references in other files.
 *
 * The model mirrors README.md:
 *  - The knowledge structure is a DAG (we call it the "tree").
 *  - Each concept lists its prerequisite concepts (the DAG edges).
 *  - A concept MAY declare a level; a declared level propagates downstream to
 *    every concept that depends on it (directly or transitively).
 *
 * @module
 */

/**
 * A level key. The ordering of levels is defined in {@link module:js/levels}.
 * @typedef {"early-school" | "later-school" | "undergraduate" | "graduate" | "research"} Level
 */

/**
 * A single concept page in the tree.
 * @typedef {object} Concept
 * @property {string} id            Unique, URL-safe identifier (e.g. "addition").
 * @property {string} title         Human-readable title (e.g. "Addition").
 * @property {string[]} prerequisites  Ids of concepts that must be understood first.
 * @property {Level} [declaredLevel]   Optional level explicitly declared by the page.
 */

/**
 * A concept whose effective level has been resolved over the tree.
 * `effectiveLevel` is `null` when neither the concept nor any of its ancestors
 * declared a level.
 * @typedef {Concept & { effectiveLevel: Level | null }} ResolvedConcept
 */

/**
 * One option in a multiple-choice question.
 * @typedef {object} QuizOption
 * @property {string} text       The text shown to the learner.
 * @property {boolean} correct   Whether this option is the correct answer.
 */

/**
 * A multiple-choice question as authored (before option shuffling).
 * @typedef {object} QuizQuestion
 * @property {string} prompt          The question text (may contain LaTeX).
 * @property {QuizOption[]} options    Two or more options; at least one correct.
 */

/**
 * A generated test: a selection of questions with options already shuffled.
 * @typedef {object} GeneratedQuiz
 * @property {GeneratedQuestion[]} questions
 */

/**
 * A question after selection + option shuffling, ready to render.
 * @typedef {object} GeneratedQuestion
 * @property {string} prompt
 * @property {QuizOption[]} options    Shuffled options.
 * @property {number} correctIndex     Index into `options` of (a) correct answer.
 */

/**
 * The learner's self-attested confidence for a concept, 0 (none) to 3 (mastered).
 * @typedef {0 | 1 | 2 | 3} Confidence
 */

export {};
