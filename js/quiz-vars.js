// @ts-check
/**
 * Randomized quiz inputs: parse a `variables` spec, instantiate values, substitute
 * `{name}` placeholders, evaluate an `answer` expression, and grade typed answers.
 *
 * All of this is pure and rng-injectable (like js/quiz.js) so it's deterministic
 * under test. The grammar (authored in a question's `variables` string):
 *
 *   "a=[1:10] b=[1;10] c=[1,2,3]"
 *
 * where the bracket separator chooses the kind:
 *   [lo:hi]  → integer in [lo, hi] (inclusive)
 *   [lo;hi]  → real in [lo, hi], rounded to 3 decimal places
 *   [v,v,v]  → a choice of one of the listed tokens (numbers, else strings)
 *
 * Placeholders `{name}` in the prompt expand to the value; the `answer` is an
 * expression over the variables (e.g. "a + b"), evaluated by a small safe evaluator.
 * @module
 */

/**
 * @typedef {import("./types/domain.js").Variable} Variable
 */

/** @callback Rng @returns {number} A float in [0, 1). */

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

/** Round to at most 3 decimal places (reals are generated and stored at this precision).
 * @param {number} x */
function round3(x) {
  return Math.round(x * 1000) / 1000;
}

/**
 * Format a value for display/substitution: reals show up to 3 dp with trailing zeros
 * trimmed (so 2.5 not 2.500); integers and strings pass through.
 * @param {number | string} v
 * @returns {string}
 */
export function formatValue(v) {
  if (typeof v === "number") return String(round3(v));
  return v;
}

/**
 * Parse a `variables` spec into a list of {@link Variable}. Throws with a clear
 * message on any malformed assignment.
 * @param {string} spec
 * @returns {Variable[]}
 */
export function parseVariables(spec) {
  /** @type {Variable[]} */
  const vars = [];
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
 * @param {Variable[]} vars
 * @param {Rng} rng
 * @returns {Record<string, number | string>}
 */
export function instantiate(vars, rng) {
  /** @type {Record<string, number | string>} */
  const bindings = {};
  for (const v of vars) {
    if (v.kind === "int") {
      bindings[v.name] = v.lo + Math.floor(rng() * (v.hi - v.lo + 1));
    } else if (v.kind === "real") {
      bindings[v.name] = round3(v.lo + rng() * (v.hi - v.lo));
    } else {
      const raw = v.values[Math.floor(rng() * v.values.length)];
      bindings[v.name] = NUMBER_RE.test(raw) ? Number(raw) : raw;
    }
  }
  return bindings;
}

/**
 * Replace every `{name}` placeholder of a bound variable with its formatted value.
 * Unknown `{…}` (and all other text, KaTeX included) is left untouched.
 * @param {string} text
 * @param {Record<string, number | string>} bindings
 * @returns {string}
 */
export function substitute(text, bindings) {
  return text.replace(/\{([A-Za-z_]\w*)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(bindings, name) ? formatValue(bindings[name]) : whole,
  );
}

/**
 * Evaluate an arithmetic expression against the bindings. Supports + - * / % ^,
 * parentheses, unary minus, and the whitelisted {@link FUNCS}. NOT `eval`: a tiny
 * recursive-descent parser. Throws on unknown identifiers and non-finite results.
 * @param {string} src
 * @param {Record<string, number | string>} bindings
 * @returns {number}
 */
export function evalExpr(src, bindings) {
  // Tokenize.
  /** @type {Array<{t:string, v:any}>} */
  const toks = [];
  const re = /\s*([A-Za-z_]\w*|\d+(?:\.\d+)?|[+\-*/%^(),])/g;
  let m;
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
  /** @param {string} [v] */
  const eat = (v) => {
    const tk = toks[i];
    if (!tk || (v !== undefined && tk.v !== v)) throw new Error(`unexpected token in "${src}"`);
    i++;
    return tk;
  };

  /** additive: term (('+'|'-') term)* @returns {number} */
  function parseExpr() {
    let left = parseTerm();
    while (peek() && peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = eat().v;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  /** multiplicative: power (('*'|'/'|'%') power)* @returns {number} */
  function parseTerm() {
    let left = parsePower();
    while (peek() && peek().t === "op" && ["*", "/", "%"].includes(peek().v)) {
      const op = eat().v;
      const right = parsePower();
      left = op === "*" ? left * right : op === "/" ? left / right : left % right;
    }
    return left;
  }
  /** power: unary ('^' power)?  (right-associative) @returns {number} */
  function parsePower() {
    const base = parseUnary();
    if (peek() && peek().t === "op" && peek().v === "^") {
      eat("^");
      return Math.pow(base, parsePower());
    }
    return base;
  }
  /** unary: ('-'|'+') unary | primary @returns {number} */
  function parseUnary() {
    if (peek() && peek().t === "op" && (peek().v === "-" || peek().v === "+")) {
      const op = eat().v;
      const val = parseUnary();
      return op === "-" ? -val : val;
    }
    return parsePrimary();
  }
  /** primary: number | func '(' args ')' | id | '(' expr ')' @returns {number} */
  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new Error(`unexpected end of "${src}"`);
    if (tk.t === "num") {
      eat();
      return tk.v;
    }
    if (tk.t === "op" && tk.v === "(") {
      eat("(");
      const v = parseExpr();
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
        const fn = /** @type {any} */ (FUNCS)[name];
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

  const result = parseExpr();
  if (i !== toks.length) throw new Error(`trailing tokens in "${src}"`);
  if (!Number.isFinite(result)) throw new Error(`expression "${src}" is not a finite number`);
  return result;
}

/**
 * Compute the correct answer for a free-text question. A numeric literal is a
 * constant; otherwise the expression is evaluated against the bindings; a string
 * that can't be evaluated (e.g. "Paris") is taken as a literal text answer.
 * @param {string | number} answer
 * @param {Record<string, number | string>} bindings
 * @returns {number | string}
 */
export function computeAnswer(answer, bindings) {
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
 * @param {number | string} expected
 * @param {string} raw
 * @returns {boolean}
 */
export function checkAnswer(expected, raw) {
  const input = raw.trim();
  if (input === "") return false;
  if (typeof expected === "number") {
    const got = Number(input);
    if (!Number.isFinite(got)) return false;
    return Math.abs(got - expected) <= Math.max(1e-3, 1e-9 * Math.abs(expected));
  }
  const norm = (/** @type {string} */ s) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(input) === norm(expected);
}
