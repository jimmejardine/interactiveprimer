/**
 * Randomized quiz inputs: parse a `variables` spec, instantiate values, substitute
 * `{name}` placeholders, evaluate an `answer` expression, and grade typed answers.
 *
 * All of this is pure and rng-injectable (like src/quiz.ts) so it's deterministic
 * under test. The grammar (authored in a question's `variables` string):
 *
 *   "a=[1:10] b=[1;10] c=[1,2,3]"
 *
 * where the bracket separator chooses the kind:
 *   [lo:hi]  → integer in [lo, hi] (inclusive)
 *   [lo;hi]  → real in [lo, hi], rounded to 3 decimal places
 *   [v,v,v]  → a choice of one of the listed tokens (numbers, else strings). Tokens are
 *              whitespace-free (the spec splits on spaces); use `_` for a space in a string
 *              value — `[handwritten_digits,filtering_spam]` displays as "handwritten digits".
 *
 * Placeholders `{name}` in the prompt expand to the value; the `answer` is an
 * expression over the variables (e.g. "a + b"), evaluated by a small safe evaluator.
 * @module
 */

import type { Variable } from "./types/domain.ts";

/** Returns a float in [0, 1). */
export type Rng = () => number;

/** Whitelisted functions usable in an `answer` expression. */
const FUNCS = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;

/** Round to at most 3 decimal places (reals are generated and stored at this precision). */
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Format a value for display/substitution: reals show up to 3 dp with trailing zeros
 * trimmed (so 2.5 not 2.500); integers and strings pass through.
 */
export function formatValue(v: number | string): string {
  if (typeof v === "number") return String(round3(v));
  return v;
}

/**
 * Parse a `variables` spec into a list of {@link Variable}. Throws with a clear
 * message on any malformed assignment.
 */
export function parseVariables(spec: string): Variable[] {
  const vars: Variable[] = [];
  const seen = new Set();
  const tokens = spec.trim().split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    const eq = token.indexOf("=");
    if (eq === -1) throw new Error(`variable "${token}" must be name=[…]`);
    const name = token.slice(0, eq);
    const body = token.slice(eq + 1);
    if (!/^[A-Za-z_]\w*$/.test(name)) throw new Error(`bad variable name "${name}"`);
    if (name in FUNCS) throw new Error(`variable "${name}" clashes with a function name`);
    if (seen.has(name)) throw new Error(`duplicate variable "${name}"`);
    seen.add(name);

    if (body[0] !== "[" || body[body.length - 1] !== "]") {
      throw new Error(`variable "${name}" must be wrapped in [ … ]`);
    }
    const inner = body.slice(1, -1);

    const hasColon = inner.includes(":");
    const hasSemi = inner.includes(";");
    const hasComma = inner.includes(",");
    const kinds = [hasColon, hasSemi, hasComma].filter(Boolean).length;
    if (kinds !== 1) {
      throw new Error(`variable "${name}" must use exactly one of : ; , inside the brackets`);
    }

    if (hasComma) {
      const values = inner.split(",").map((s) => s.trim());
      if (values.some((v) => v === "")) throw new Error(`variable "${name}" has an empty choice`);
      vars.push({ name, kind: "choice", values });
    } else {
      const sep = hasColon ? ":" : ";";
      const parts = inner.split(sep).map((s) => s.trim());
      if (parts.length !== 2 || !NUMBER_RE.test(parts[0]) || !NUMBER_RE.test(parts[1])) {
        throw new Error(`variable "${name}" range must be [lo${sep}hi] with two numbers`);
      }
      const lo = Number(parts[0]);
      const hi = Number(parts[1]);
      if (lo > hi) throw new Error(`variable "${name}" has lo > hi`);
      vars.push(
        hasColon ? { name, kind: "int", lo, hi } : { name, kind: "real", lo, hi },
      );
    }
  }
  return vars;
}

/**
 * Instantiate variables to concrete values using the injected rng (drawn in
 * declaration order, so the sequence is deterministic under a seeded rng).
 */
export function instantiate(vars: Variable[], rng: Rng): Record<string, number | string> {
  const bindings: Record<string, number | string> = {};
  for (const v of vars) {
    if (v.kind === "int") {
      bindings[v.name] = v.lo + Math.floor(rng() * (v.hi - v.lo + 1));
    } else if (v.kind === "real") {
      bindings[v.name] = round3(v.lo + rng() * (v.hi - v.lo));
    } else {
      const raw = v.values[Math.floor(rng() * v.values.length)];
      // Choice values are whitespace-free (the spec is tokenised on spaces); an underscore in a
      // string value stands in for a space, so "handwritten_digits" displays as "handwritten digits".
      bindings[v.name] = NUMBER_RE.test(raw) ? Number(raw) : raw.replace(/_/g, " ");
    }
  }
  return bindings;
}

/** Max re-rolls when satisfying a question's `constraints` before giving up. */
export const MAX_REROLLS = 100;

/** Thrown by {@link drawBindings} when a question's constraints can't be satisfied — a
 * sentinel so the quiz builder can drop the question and draw another (vs. a genuine
 * authoring error, which propagates). */
export class ConstraintError extends Error {}

/**
 * Instantiate the variables, re-rolling until the `constraints` expression evaluates to a
 * non-zero (truthy) result — e.g. `"a != b"`, `"a > b && b > 0"`. An empty/absent
 * constraint accepts the first draw. Throws {@link ConstraintError} after `maxRerolls`.
 * (A malformed constraint — e.g. an unknown variable — makes `evalExpr` throw on the first
 * attempt, which propagates so the authoring mistake surfaces.)
 */
export function drawBindings(
  vars: Variable[],
  constraint: string | undefined,
  rng: Rng,
  maxRerolls: number = MAX_REROLLS,
): Record<string, number | string> {
  const cons = typeof constraint === "string" ? constraint.trim() : "";
  for (let attempt = 0; attempt <= maxRerolls; attempt++) {
    const bindings = instantiate(vars, rng);
    if (!cons || evalExpr(cons, bindings) !== 0) return bindings;
  }
  throw new ConstraintError(
    `could not satisfy constraint "${constraint}" after ${maxRerolls} re-rolls`,
  );
}

/**
 * Replace every `{name}` placeholder of a bound variable with its formatted value.
 * Unknown `{…}` (and all other text, KaTeX included) is left untouched.
 */
export function substitute(text: string, bindings: Record<string, number | string>): string {
  return text.replace(/\{([A-Za-z_]\w*)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(bindings, name) ? formatValue(bindings[name]) : whole,
  );
}

/**
 * Replace every `{ … }` group with the result of EVALUATING its contents against the
 * bindings — so a prompt or option can compute values: `{a + b}`, `{2 * a}`, or just
 * `{a}` (adjacent groups concatenate, e.g. `{a}{b}` → "412"). A bare bound name formats
 * its value directly (covering string-valued choices); otherwise the inside is evaluated
 * as an arithmetic expression via {@link evalExpr}. Anything that isn't a valid expression
 * over the bindings — unknown names, literal LaTeX braces — is left untouched; double the
 * braces (`{{12}}`) to keep a literal `{12}`.
 */
export function fillExpressions(text: string, bindings: Record<string, number | string>): string {
  return text.replace(/\{([^{}]+)\}/g, (whole, inner) => {
    const expr = inner.trim();
    if (/^[A-Za-z_]\w*$/.test(expr) && Object.prototype.hasOwnProperty.call(bindings, expr)) {
      return formatValue(bindings[expr]);
    }
    try {
      return formatValue(evalExpr(expr, bindings));
    } catch {
      return whole; // not an expression over the bindings — leave it as-is
    }
  });
}

/**
 * Evaluate an expression against the bindings. Supports arithmetic (`+ - * / % ^`,
 * parentheses, unary minus, the whitelisted {@link FUNCS}) AND boolean logic —
 * comparisons (`== != < > <= >=`) and `&& ||`, which return 1/0 — so the same evaluator
 * grades a quiz `constraints` expression (truthy = passes). NOT `eval`: a tiny
 * recursive-descent parser. Throws on unknown identifiers and non-finite results.
 */
export function evalExpr(src: string, bindings: Record<string, number | string>): number {
  // Tokenize.
  const toks: Array<{ t: string; v: any }> = [];
  // Multi-char operators (<=, >=, ==, !=, &&, ||) are listed before the single-char class
  // so they tokenize as one token; the class then covers single < and > (and arithmetic).
  const re = /\s*([A-Za-z_]\w*|\d+(?:\.\d+)?|<=|>=|==|!=|&&|\|\||[+\-*/%^(),<>])/g;
  let m: RegExpExecArray | null;
  let pos = 0;
  while ((m = re.exec(src)) !== null) {
    if (m.index !== pos) break; // a gap means an unrecognized character
    pos = re.lastIndex;
    const s = m[1];
    if (/^[A-Za-z_]/.test(s)) toks.push({ t: "id", v: s });
    else if (/^[\d.]/.test(s)) toks.push({ t: "num", v: Number(s) });
    else toks.push({ t: "op", v: s });
  }
  if (pos !== src.length || toks.length === 0) {
    throw new Error(`could not parse expression "${src}"`);
  }

  let i = 0;
  const peek = () => toks[i];
  const eat = (v?: string) => {
    const tk = toks[i];
    if (!tk || (v !== undefined && tk.v !== v)) throw new Error(`unexpected token in "${src}"`);
    i++;
    return tk;
  };

  // Boolean layers sit BELOW additive so `a + b <= 20` groups as `(a + b) <= 20`. They
  // return 1/0, and treat any non-zero operand as true — so a constraint expression like
  // `a != b` or `a > b && b > 0` evaluates to truthy/falsy. Comparisons reuse a small
  // epsilon for == / != since values are integers or 3-dp reals.
  const COMPARE = new Set(["==", "!=", "<", ">", "<=", ">="]);
  /** logical-or: and ('||' and)* */
  function parseOr(): number {
    let left = parseAnd();
    while (peek() && peek().t === "op" && peek().v === "||") {
      eat();
      const right = parseAnd();
      left = left !== 0 || right !== 0 ? 1 : 0;
    }
    return left;
  }
  /** logical-and: compare ('&&' compare)* */
  function parseAnd(): number {
    let left = parseCompare();
    while (peek() && peek().t === "op" && peek().v === "&&") {
      eat();
      const right = parseCompare();
      left = left !== 0 && right !== 0 ? 1 : 0;
    }
    return left;
  }
  /** comparison: additive (op additive)?  (one comparison, non-chaining) */
  function parseCompare(): number {
    const left = parseExpr();
    if (peek() && peek().t === "op" && COMPARE.has(peek().v)) {
      const op = eat().v;
      const right = parseExpr();
      switch (op) {
        case "==": return Math.abs(left - right) < 1e-9 ? 1 : 0;
        case "!=": return Math.abs(left - right) >= 1e-9 ? 1 : 0;
        case "<": return left < right ? 1 : 0;
        case ">": return left > right ? 1 : 0;
        case "<=": return left <= right ? 1 : 0;
        case ">=": return left >= right ? 1 : 0;
      }
    }
    return left;
  }

  /** additive: term (('+'|'-') term)* */
  function parseExpr(): number {
    let left = parseTerm();
    while (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = eat().v;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  /** multiplicative: power (('*'|'/'|'%') power)* */
  function parseTerm(): number {
    let left = parsePower();
    while (peek() && peek().t === "op" && ["*", "/", "%"].includes(peek().v)) {
      const op = eat().v;
      const right = parsePower();
      left = op === "*" ? left * right : op === "/" ? left / right : left % right;
    }
    return left;
  }
  /** power: unary ('^' power)?  (right-associative) */
  function parsePower(): number {
    const base = parseUnary();
    if (peek() && peek().t === "op" && peek().v === "^") {
      eat("^");
      return Math.pow(base, parsePower());
    }
    return base;
  }
  /** unary: ('-'|'+') unary | primary */
  function parseUnary(): number {
    if (peek() && peek().t === "op" && (peek().v === "-" || peek().v === "+")) {
      const op = eat().v;
      const val = parseUnary();
      return op === "-" ? -val : val;
    }
    return parsePrimary();
  }
  /** primary: number | func '(' args ')' | id | '(' orExpr ')' */
  function parsePrimary(): number {
    const tk = peek();
    if (!tk) throw new Error(`unexpected end of "${src}"`);
    if (tk.t === "num") {
      eat();
      return tk.v;
    }
    if (tk.t === "op" && tk.v === "(") {
      eat("(");
      const v = parseOr(); // re-enter at the top so a full boolean/comparison can be parenthesised
      eat(")");
      return v;
    }
    if (tk.t === "id") {
      eat();
      const name = tk.v;
      if (peek() && peek().t === "op" && peek().v === "(") {
        eat("(");
        const args = [parseExpr()];
        while (peek() && peek().t === "op" && peek().v === ",") {
          eat(",");
          args.push(parseExpr());
        }
        eat(")");
        const fn = (FUNCS as any)[name];
        if (!fn) throw new Error(`unknown function "${name}"`);
        return fn(...args);
      }
      if (!Object.prototype.hasOwnProperty.call(bindings, name)) {
        throw new Error(`unknown variable "${name}"`);
      }
      const val = bindings[name];
      if (typeof val !== "number") throw new Error(`variable "${name}" is not numeric`);
      return val;
    }
    throw new Error(`unexpected token in "${src}"`);
  }

  const result = parseOr();
  if (i !== toks.length) throw new Error(`trailing tokens in "${src}"`);
  if (!Number.isFinite(result)) throw new Error(`expression "${src}" is not a finite number`);
  return result;
}

/**
 * Compute the correct answer for a free-text question. A numeric literal is a
 * constant; otherwise the expression is evaluated against the bindings; a string
 * that can't be evaluated (e.g. "Paris") is taken as a literal text answer.
 */
export function computeAnswer(
  answer: string | number,
  bindings: Record<string, number | string>,
): number | string {
  if (typeof answer === "number") return answer;
  const trimmed = answer.trim();
  if (NUMBER_RE.test(trimmed)) return Number(trimmed);
  try {
    return evalExpr(trimmed, bindings);
  } catch {
    return trimmed; // literal text answer
  }
}

/**
 * Grade a learner's typed answer against the expected value. Numbers compare with a
 * tolerance (covering integers exactly and 3-dp reals); text compares case- and
 * whitespace-insensitively. Empty input is always wrong.
 */
export function checkAnswer(expected: number | string, raw: string): boolean {
  const input = raw.trim();
  if (input === "") return false;
  if (typeof expected === "number") {
    // Tolerate a trailing UNIT marker on a numeric answer so the same value reads the same with or
    // without it: a degree marker — "70", "70°", "70 degrees", MathLive's "70^\circ" / "70^{\circ}";
    // and a percent marker — "25", "25%", "25 percent". Each token is removed before the numeric
    // parse, targeted so a real exponent like "x^2" is left alone.
    const stripped = input
      .replace(/\^?\s*\{?\s*\\?circ\s*\}?/gi, "")
      .replace(/°/g, "")
      .replace(/\bdeg(?:rees|ree)?\b/gi, "")
      .replace(/%/g, "")
      .replace(/\bper\s?cent\b/gi, "")
      .trim();
    const got = Number(stripped);
    if (!Number.isFinite(got)) return false;
    return Math.abs(got - expected) <= Math.max(1e-3, 1e-9 * Math.abs(expected));
  }
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(input) === norm(expected);
}
