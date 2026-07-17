/**
 * Core domain types for the Interactive Primer.
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
 */
export type Level = number;

/**
 * The authored metadata for one concept (the inline `concept-meta` JSON block on a
 * page, and the unit of the knowledge graph).
 */
export interface ConceptMeta {
  /** Full-path id, e.g. "arithmetic/addition". No longer authored (implied by the file
   * path / URL); populated by the build/runtime from the path. */
  id?: string;
  /** Human-readable title, e.g. "Addition". No longer authored in this block — it lives
   * in the `<primer-title>` element (so it's translatable). */
  title?: string;
  /** Full-path ids of concepts required first (DAG edges). */
  prerequisites: string[];
  /** Optional numeric level explicitly declared. */
  declaredLevel?: Level;
  /** Optional ISO date "YYYY-MM-DD" — when the lesson content was finished. */
  completedDate?: string;
  /** Optional ISO date "YYYY-MM-DD" — when this concept was flagged as needing review. */
  needsReviewDate?: string;
  /** When true, this page is a *course*: a curated path whose member concepts the build
   * harvests from its inline `<primer-ref>`s (see `courseMembers`). */
  course?: boolean;
  /** Legacy: previously set on translation overlays; overlays now carry a trailing
   * `<!-- sourceHash: … -->` comment instead (see scripts/i18n-check.js). */
  sourceHash?: string;
}

/**
 * A concept in the graph: its authored metadata with `id` and `title` resolved (from the file
 * path and the `<primer-title>` element respectively) so both are always present. `titleHtml` is
 * the raw `<primer-title>` markup, present only when the title carries inline elements (e.g. a
 * `<primer-math>` math title) — consumers typeset it while `title` stays plain text for text uses.
 * `explicitPrerequisites` are just the concept-meta–declared prerequisites (a subset of the unioned
 * `prerequisites`); the rest are implicit, harvested from inline `<primer-ref>`s in the prose.
 * `courseMembers` (present only on a `course: true` page) is its ordered, de-duped concept list,
 * harvested from the page's normal + soft `<primer-ref>`s.
 */
export interface Concept extends ConceptMeta {
  id: string;
  title: string;
  titleHtml?: string;
  explicitPrerequisites?: string[];
  courseMembers?: string[];
}

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
 */
export interface ResolvedConcept extends Concept {
  level: Level;
  levelGrounded: boolean;
  successors?: string[];
  titles?: Record<string, string>;
}

export type DiagnosticCode =
  | "duplicate-id"
  | "dangling-prerequisite"
  | "cycle"
  | "missing-root"
  | "orphan"
  | "declared-below-prerequisite"
  | "ungrounded-level"
  | "id-path-mismatch"
  | "metadata-error";

/** A validation finding from the graph checker. */
export interface Diagnostic {
  severity: "error" | "warning";
  code: DiagnosticCode;
  message: string;
  /** The concept id this finding relates to, if any. */
  concept?: string;
}

/**
 * The drawn variable values for one question instance, keyed by variable name (see
 * src/quiz-vars.ts). Passed to any function-valued `prompt`/`text`/`answer`.
 */
export type Bindings = Record<string, string | number>;

/**
 * One option in a multiple-choice question. An option shows EITHER `text` (typeset, may
 * contain LaTeX) OR a `chart` (the name of a registered chart scene, rendered as a small
 * graph via <primer-chart> — so the choices themselves can be plots). Exactly one is given.
 * `text` may be a function of the drawn {@link Bindings} (e.g. `(b) => \`$${b.a + b.b}$\``).
 */
export interface QuizOption {
  /** The text shown to the learner (when not a chart/geometry option). */
  text?: string | ((b: Bindings) => string);
  /** Name of a registered chart scene to render as this option. */
  chart?: string;
  /** Name of a registered geometry scene to render as this option (a small figure,
   * e.g. "which diagram shows alternate angles?"). Like `chart`, carries no text. */
  geometry?: string;
  /** Whether this option is the correct answer. */
  correct: boolean;
}

/** A multiple-choice question as authored (before option shuffling). */
export interface QuizQuestion {
  /** The question text (may contain LaTeX), or a function of the drawn variable bindings. */
  prompt: string | ((b: Bindings) => string);
  /** Optional name of a registered geometry scene rendered ABOVE the prompt (a "given this
   * diagram, …" question). Carries no answer logic of its own. */
  figure?: string;
  /** Two or more options; at least one correct. */
  options: QuizOption[];
  /** Optional spec (see src/quiz-vars.ts). When present the prompt and each option's `text`
   * are evaluated against the drawn values: `{expr}` → the computed value (e.g. `{a + b}`,
   * `{2 * a}`), and adjacent groups concatenate (`{a}{b}` → "412"). The question then
   * re-instantiates with fresh values each draw. */
  variables?: string;
  /** Optional boolean expression over the variables that must hold (e.g. `"a != b"`,
   * `"a > b && b > 0"`); the values are re-rolled until it's true. If unsatisfiable, the
   * quiz falls back to other questions. See src/quiz-vars.ts. */
  constraints?: string;
}

/**
 * A free-text question as authored. `answer` is an expression over the `variables`
 * (e.g. "a + b"), or a literal constant when there are no variables. `variables` is a
 * spec string (see src/quiz-vars.ts), and `{name}` placeholders in `prompt` expand to
 * the generated values.
 */
export interface TextQuestion {
  /** The question text, or a function of the bindings. */
  prompt: string | ((b: Bindings) => string);
  /** Optional name of a registered geometry scene rendered ABOVE the prompt (e.g. "given
   * this diagram, find ∠x"). Pair with `keyboard: "geometry"` for angle answers. */
  figure?: string;
  /** The expected answer: an expression/literal over the variables, or a function of the
   * bindings (e.g. `(b) => b.a + b.b`). */
  answer: string | number | ((b: Bindings) => string | number);
  variables?: string;
  /** Optional boolean expression over the variables that must hold; values are re-rolled
   * until true (see src/quiz-vars.ts). */
  constraints?: string;
  /** How to grade the typed answer. Default: numeric (with tolerance) or case/space-
   * insensitive text. "polynomial" compares as a single-variable polynomial (order/format
   * independent) and offers a math editor for entering exponents. */
  compare?: "polynomial";
  /** Name of a custom MathLive virtual keyboard for the math answer field (see
   * src/math-keyboards.ts), e.g. "algebra-basic". Polynomial answers default to
   * "algebra-basic". */
  keyboard?: string;
}

/**
 * An interactive geometry-PROBLEM question: embeds a `<primer-geometry-problem>` (the
 * engine-generated "apply-the-theorem" construction sandbox). Recognised by its `problem`
 * field (it has neither `options` nor `answer`). Its solved/unsolved state folds into the
 * quiz scorecard.
 */
export interface ProblemQuestion {
  /** Name of a registered geometry problem (see `registerGeometryProblem`). */
  problem: string;
}

/**
 * A "write a program" question: embeds a `<primer-program>` (an editor + sandbox).
 * Recognised by its `program` field (it has no `options`/`answer`/`problem`). Its
 * correct/incorrect state folds into the quiz scorecard, exactly like a geometry problem.
 */
export interface ProgramQuestion {
  /** Name of a registered program exercise (see `registerProgram`). */
  program: string;
}

/** A question as authored: multiple-choice (`options`), free-text (`answer`), a geometry
 * problem (`problem`), or a program exercise (`program`). */
export type AuthoredQuestion = QuizQuestion | TextQuestion | ProblemQuestion | ProgramQuestion;

/**
 * Quiz-level settings, supplied as the OPTIONAL FIRST item returned by a `registerQuiz`
 * builder. It is recognized by having neither `options` nor `answer` (so it is not mistaken
 * for a question). Lives in the language-neutral builder, so it's shared across every locale
 * (never overlaid).
 */
export interface QuizConfig {
  /** How many questions to draw. Defaults to 5 when omitted. */
  num_questions?: number;
  /** An instructions sentence rendered in normal font directly under the "Quick quiz"
   * heading. Route translatable prose through `sceneStrings` (so the string resolves per
   * locale); may contain inline `$…$` LaTeX. */
  preamble?: string | (() => string);
}

/** One random variable parsed from a question's `variables` spec. */
export type Variable =
  | { name: string; kind: "int"; lo: number; hi: number }
  | { name: string; kind: "real"; lo: number; hi: number }
  | { name: string; kind: "choice"; values: string[] };

/** A generated test: questions ready to render (options shuffled / variables resolved). */
export interface GeneratedQuiz {
  questions: GeneratedQuestion[];
}

/** One option after generation: any function/template `text` has been resolved to a final string. */
export interface GeneratedOption {
  /** The resolved text shown (when not a chart/geometry option). */
  text?: string;
  /** Name of a registered chart scene to render as this option. */
  chart?: string;
  /** Name of a registered geometry scene to render as this option. */
  geometry?: string;
  /** Whether this option is the correct answer. */
  correct: boolean;
}

/** A multiple-choice question after selection + option shuffling, ready to render. */
export interface GeneratedChoiceQuestion {
  kind: "choice";
  prompt: string;
  /** Optional geometry scene rendered above the prompt. */
  figure?: string;
  /** Shuffled options (text resolved to strings). */
  options: GeneratedOption[];
  /** Index into `options` of (a) correct answer. */
  correctIndex: number;
}

/**
 * A free-text question after variable instantiation, ready to render. `expected` is
 * the computed correct answer used by the grader (never rendered into the DOM).
 */
export interface GeneratedTextQuestion {
  kind: "text";
  prompt: string;
  /** Optional geometry scene rendered above the prompt. */
  figure?: string;
  expected: number | string;
  /** Grading mode, carried through from the authored question. */
  compare?: "polynomial";
  /** Custom math-keyboard name, carried through from the question. */
  keyboard?: string;
}

/**
 * A geometry-problem question, ready to render: the quiz drops in a
 * `<primer-geometry-problem>` and folds its solved state into the score.
 */
export interface GeneratedProblemQuestion {
  kind: "problem";
  /** The registered geometry-problem name. */
  scene: string;
}

/**
 * A program question, ready to render: the quiz drops in a `<primer-program>` and folds
 * its correct/incorrect state into the score.
 */
export interface GeneratedProgramQuestion {
  kind: "program";
  /** The registered program name. */
  scene: string;
}

/** A generated question, ready to render and grade. */
export type GeneratedQuestion =
  | GeneratedChoiceQuestion
  | GeneratedTextQuestion
  | GeneratedProblemQuestion
  | GeneratedProgramQuestion;

/**
 * The learner's self-attested confidence for a concept, as a number of stars from
 * 0 (none) to 10 (complete mastery). An integer in the range [0, 10].
 */
export type Confidence = number;
