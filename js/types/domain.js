// @ts-check
/**
 * Core domain types for the Interactive Primer, expressed as JSDoc typedefs so
 * they are checked by `tsc` without any build step.
 *
 * The model mirrors README.md:
 *  - The knowledge structure is a DAG (we call it the "tree").
 *  - Each concept has a full-path id (e.g. "arithmetic/addition") and its
 *    prerequisites are referenced by those same full-path ids (the DAG edges).
 *  - A concept MAY declare a numeric level; a declared level propagates downstream
 *    to every concept that depends on it (directly or transitively).
 *  - A concept MAY mark itself a `root` (an entry point with no prerequisites).
 *
 * @module
 */

/**
 * A level of knowledge. A REAL number — usually an integer that roughly equates to
 * a stage of education, but fractional values are allowed so concepts can be
 * squeezed in between existing levels (e.g. 2.5).
 * @typedef {number} Level
 */

/**
 * The authored metadata for one concept (the inline `concept-meta` JSON block on a
 * page, and the unit of the knowledge graph).
 * @typedef {object} ConceptMeta
 * @property {string} id            Full-path id, e.g. "arithmetic/addition".
 * @property {string} title         Human-readable title, e.g. "Addition".
 * @property {string[]} prerequisites  Full-path ids of concepts required first (DAG edges).
 * @property {Level} [declaredLevel]   Optional numeric level explicitly declared.
 * @property {boolean} [root]          Marks an entry point (no prerequisites expected).
 * @property {string} [completedDate]    Optional ISO date "YYYY-MM-DD" — when the lesson content was finished.
 * @property {string} [needsReviewDate]  Optional ISO date "YYYY-MM-DD" — when this concept was flagged as needing review.
 * @property {string} [sourceHash]       Set only on translation overlays: hash of the English source's translatable surface this was translated from (see scripts/i18n-check.js).
 */

/** A concept in the graph. Currently identical to its authored metadata. @typedef {ConceptMeta} Concept */

/**
 * A concept whose effective level has been resolved over the tree.
 *  - `level` is the computed numeric level (max of declared + all prerequisites).
 *  - `levelGrounded` is false when no level was declared anywhere in its ancestry,
 *    so `level` fell back to the base (0).
 *  - `successors` are the ids of concepts that list this one as a direct prerequisite
 *    (the immediate mirror of `prerequisites`), computed when the graph is emitted.
 *  - `titles` maps a non-default locale to that concept's translated title, harvested
 *    from the per-locale overlays so the explorer can label nodes in the active language
 *    (falling back to the English `title`). Absent when no translation exists.
 * @typedef {Concept & { level: Level, levelGrounded: boolean, successors?: string[], titles?: Record<string, string> }} ResolvedConcept
 */

/**
 * A validation finding from the graph checker.
 * @typedef {object} Diagnostic
 * @property {"error" | "warning"} severity
 * @property {DiagnosticCode} code
 * @property {string} message
 * @property {string} [concept]   The concept id this finding relates to, if any.
 */

/**
 * @typedef {(
 *   "duplicate-id" | "dangling-prerequisite" | "cycle" | "no-roots" |
 *   "orphan" | "declared-below-prerequisite" | "ungrounded-level" |
 *   "id-path-mismatch" | "metadata-error"
 * )} DiagnosticCode
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
 * A free-text question as authored. `answer` is an expression over the `variables`
 * (e.g. "a + b"), or a literal constant when there are no variables. `variables` is a
 * spec string (see js/quiz-vars.js), and `{name}` placeholders in `prompt` expand to
 * the generated values.
 * @typedef {object} TextQuestion
 * @property {string} prompt
 * @property {string | number} answer
 * @property {string} [variables]
 */

/** A question as authored: multiple-choice (has `options`) or free-text (has `answer`).
 * @typedef {QuizQuestion | TextQuestion} AuthoredQuestion */

/**
 * One random variable parsed from a question's `variables` spec.
 * @typedef {{ name: string, kind: "int", lo: number, hi: number }
 *   | { name: string, kind: "real", lo: number, hi: number }
 *   | { name: string, kind: "choice", values: string[] }} Variable
 */

/**
 * A generated test: questions ready to render (options shuffled / variables resolved).
 * @typedef {object} GeneratedQuiz
 * @property {GeneratedQuestion[]} questions
 */

/**
 * A multiple-choice question after selection + option shuffling, ready to render.
 * @typedef {object} GeneratedChoiceQuestion
 * @property {"choice"} kind
 * @property {string} prompt
 * @property {QuizOption[]} options    Shuffled options.
 * @property {number} correctIndex     Index into `options` of (a) correct answer.
 */

/**
 * A free-text question after variable instantiation, ready to render. `expected` is
 * the computed correct answer used by the grader (never rendered into the DOM).
 * @typedef {object} GeneratedTextQuestion
 * @property {"text"} kind
 * @property {string} prompt
 * @property {number | string} expected
 */

/** A generated question, ready to render and grade.
 * @typedef {GeneratedChoiceQuestion | GeneratedTextQuestion} GeneratedQuestion */

/**
 * The learner's self-attested confidence for a concept, as a number of stars from
 * 0 (none) to 10 (complete mastery). An integer in the range [0, 10].
 * @typedef {number} Confidence
 */

export {};
