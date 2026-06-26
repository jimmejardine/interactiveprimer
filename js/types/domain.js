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
 *  - There is exactly one root: the concept whose id is "root". Every other concept
 *    reaches it through prerequisites.
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
 * @property {string} [id]          Full-path id, e.g. "arithmetic/addition". No longer authored
 *   (implied by the file path / URL); populated by the build/runtime from the path.
 * @property {string} [title]       Human-readable title, e.g. "Addition". No longer authored in
 *   this block — it lives in the `<primer-title>` element (so it's translatable).
 * @property {string[]} prerequisites  Full-path ids of concepts required first (DAG edges).
 * @property {Level} [declaredLevel]   Optional numeric level explicitly declared.
 * @property {string} [completedDate]    Optional ISO date "YYYY-MM-DD" — when the lesson content was finished.
 * @property {string} [needsReviewDate]  Optional ISO date "YYYY-MM-DD" — when this concept was flagged as needing review.
 * @property {boolean} [course]          When true, this page is a *course*: a curated path whose
 *   member concepts the build harvests from its inline `<primer-ref>`s (see `courseMembers`).
 * @property {string} [sourceHash]       Legacy: previously set on translation overlays; overlays now
 *   carry a trailing `<!-- sourceHash: … -->` comment instead (see scripts/i18n-check.js).
 */

/** A concept in the graph: its authored metadata with `id` and `title` resolved (from the file
 * path and the `<primer-title>` element respectively) so both are always present. `titleHtml` is
 * the raw `<primer-title>` markup, present only when the title carries inline elements (e.g. a
 * `<primer-math>` math title) — consumers typeset it while `title` stays plain text for text uses.
 * `explicitPrerequisites` are just the concept-meta–declared prerequisites (a subset of the unioned
 * `prerequisites`); the rest are implicit, harvested from inline `<primer-ref>`s in the prose.
 * `courseMembers` (present only on a `course: true` page) is its ordered, de-duped concept list,
 * harvested from the page's normal + soft `<primer-ref>`s.
 * @typedef {ConceptMeta & { id: string, title: string, titleHtml?: string, explicitPrerequisites?: string[], courseMembers?: string[] }} Concept */

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
 *   "duplicate-id" | "dangling-prerequisite" | "cycle" | "missing-root" |
 *   "orphan" | "declared-below-prerequisite" | "ungrounded-level" |
 *   "id-path-mismatch" | "metadata-error"
 * )} DiagnosticCode
 */

/**
 * The drawn variable values for one question instance, keyed by variable name (see
 * js/quiz-vars.js). Passed to any function-valued `prompt`/`text`/`answer`.
 * @typedef {Record<string, string | number>} Bindings
 */

/**
 * One option in a multiple-choice question. An option shows EITHER `text` (typeset, may
 * contain LaTeX) OR a `chart` (the name of a registered chart scene, rendered as a small
 * graph via <primer-chart> — so the choices themselves can be plots). Exactly one is given.
 * `text` may be a function of the drawn {@link Bindings} (e.g. `(b) => \`$${b.a + b.b}$\``).
 * @typedef {object} QuizOption
 * @property {string | ((b: Bindings) => string)} [text]  The text shown to the learner (when not a chart/geometry option).
 * @property {string} [chart]    Name of a registered chart scene to render as this option.
 * @property {string} [geometry] Name of a registered geometry scene to render as this option (a small
 *   figure, e.g. "which diagram shows alternate angles?"). Like `chart`, carries no text.
 * @property {boolean} correct   Whether this option is the correct answer.
 */

/**
 * A multiple-choice question as authored (before option shuffling).
 * @typedef {object} QuizQuestion
 * @property {string | ((b: Bindings) => string)} prompt   The question text (may contain LaTeX), or a
 *   function of the drawn variable bindings.
 * @property {string} [figure]   Optional name of a registered geometry scene rendered ABOVE the prompt
 *   (a "given this diagram, …" question). Carries no answer logic of its own.
 * @property {QuizOption[]} options    Two or more options; at least one correct.
 * @property {string} [variables]     Optional spec (see js/quiz-vars.js). When present the
 *   prompt and each option's `text` are evaluated against the drawn values: `{expr}` →
 *   the computed value (e.g. `{a + b}`, `{2 * a}`), and adjacent groups concatenate
 *   (`{a}{b}` → "412"). The question then re-instantiates with fresh values each draw.
 * @property {string} [constraints]   Optional boolean expression over the variables that
 *   must hold (e.g. `"a != b"`, `"a > b && b > 0"`); the values are re-rolled until it's
 *   true. If unsatisfiable, the quiz falls back to other questions. See js/quiz-vars.js.
 */

/**
 * A free-text question as authored. `answer` is an expression over the `variables`
 * (e.g. "a + b"), or a literal constant when there are no variables. `variables` is a
 * spec string (see js/quiz-vars.js), and `{name}` placeholders in `prompt` expand to
 * the generated values.
 * @typedef {object} TextQuestion
 * @property {string | ((b: Bindings) => string)} prompt   The question text, or a function of the bindings.
 * @property {string} [figure]   Optional name of a registered geometry scene rendered ABOVE the prompt
 *   (e.g. "given this diagram, find ∠x"). Pair with `keyboard: "geometry"` for angle answers.
 * @property {string | number | ((b: Bindings) => string | number)} answer   The expected answer: an
 *   expression/literal over the variables, or a function of the bindings (e.g. `(b) => b.a + b.b`).
 * @property {string} [variables]
 * @property {string} [constraints]   Optional boolean expression over the variables that
 *   must hold; values are re-rolled until true (see js/quiz-vars.js).
 * @property {"polynomial"} [compare]   How to grade the typed answer. Default: numeric (with
 *   tolerance) or case/space-insensitive text. "polynomial" compares as a single-variable
 *   polynomial (order/format independent) and offers a math editor for entering exponents.
 * @property {string} [keyboard]   Name of a custom MathLive virtual keyboard for the math
 *   answer field (see js/math-keyboards.js), e.g. "algebra-basic". Polynomial answers default
 *   to "algebra-basic".
 */

/**
 * An interactive geometry-PROBLEM question: embeds a `<primer-geometry-problem>` (the engine-generated
 * "apply-the-theorem" construction sandbox). Recognised by its `problem` field (it has neither
 * `options` nor `answer`). Its solved/unsolved state folds into the quiz scorecard.
 * @typedef {object} ProblemQuestion
 * @property {string} problem   Name of a registered geometry problem (see `registerGeometryProblem`).
 */

/** A question as authored: multiple-choice (`options`), free-text (`answer`), or a geometry problem (`problem`).
 * @typedef {QuizQuestion | TextQuestion | ProblemQuestion} AuthoredQuestion */

/**
 * Quiz-level settings, supplied as the OPTIONAL FIRST item returned by a `registerQuiz` builder.
 * It is recognized by having neither `options` nor `answer` (so it is not mistaken for a question).
 * Lives in the language-neutral builder, so it's shared across every locale (never overlaid).
 * @typedef {object} QuizConfig
 * @property {number} [num_questions]   How many questions to draw. Defaults to 5 when omitted.
 * @property {string | (() => string)} [preamble]   An instructions sentence rendered in normal
 *   font directly under the "Quick quiz" heading. Route translatable prose through `sceneStrings`
 *   (so the string resolves per locale); may contain inline `$…$` LaTeX.
 */

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
 * One option after generation: any function/template `text` has been resolved to a final string.
 * @typedef {object} GeneratedOption
 * @property {string} [text]     The resolved text shown (when not a chart/geometry option).
 * @property {string} [chart]    Name of a registered chart scene to render as this option.
 * @property {string} [geometry] Name of a registered geometry scene to render as this option.
 * @property {boolean} correct   Whether this option is the correct answer.
 */

/**
 * A multiple-choice question after selection + option shuffling, ready to render.
 * @typedef {object} GeneratedChoiceQuestion
 * @property {"choice"} kind
 * @property {string} prompt
 * @property {string} [figure]   Optional geometry scene rendered above the prompt.
 * @property {GeneratedOption[]} options    Shuffled options (text resolved to strings).
 * @property {number} correctIndex     Index into `options` of (a) correct answer.
 */

/**
 * A free-text question after variable instantiation, ready to render. `expected` is
 * the computed correct answer used by the grader (never rendered into the DOM).
 * @typedef {object} GeneratedTextQuestion
 * @property {"text"} kind
 * @property {string} prompt
 * @property {string} [figure]   Optional geometry scene rendered above the prompt.
 * @property {number | string} expected
 * @property {"polynomial"} [compare]   Grading mode, carried through from the authored question.
 * @property {string} [keyboard]   Custom math-keyboard name, carried through from the question.
 */

/**
 * A geometry-problem question, ready to render: the quiz drops in a `<primer-geometry-problem>` and
 * folds its solved state into the score.
 * @typedef {object} GeneratedProblemQuestion
 * @property {"problem"} kind
 * @property {string} scene   The registered geometry-problem name.
 */

/** A generated question, ready to render and grade.
 * @typedef {GeneratedChoiceQuestion | GeneratedTextQuestion | GeneratedProblemQuestion} GeneratedQuestion */

/**
 * The learner's self-attested confidence for a concept, as a number of stars from
 * 0 (none) to 10 (complete mastery). An integer in the range [0, 10].
 * @typedef {number} Confidence
 */

export {};
