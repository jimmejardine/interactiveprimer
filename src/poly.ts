/**
 * Single-variable polynomial parsing + comparison — pure and DOM-free, so it's
 * unit-testable and reusable. Used to grade free-text polynomial answers (see the quiz),
 * accepting BOTH plain typed text (`10x^2+13x-30`, `10x²`) AND the LaTeX a MathLive
 * `<math-field>` emits (`10x^{2}+13x-30`, `10\cdot x^2`), and treating reordered / differently
 * spaced forms as equal.
 *
 * Scope (deliberately small): one variable, non-negative integer powers, numeric coefficients.
 * Anything else (parentheses, fractions, a second variable, `x^-1`) is "unparseable" → not a
 * match, since we ask the learner for the expanded polynomial.
 * @module
 */

/** Map common unicode superscript digits to plain digits (for `x²` → `x^2`). */
const SUPERSCRIPTS = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

/**
 * Strip formatting noise so plain text and MathLive LaTeX reduce to the same shape:
 * lowercase, remove LaTeX wrappers/operators, convert superscripts, drop spaces/braces/`*`.
 */
function clean(src: string): string {
  let s = String(src).toLowerCase();
  // Unicode minus/middle-dot and LaTeX operators → ASCII equivalents.
  s = s.replace(/[−‒–—]/g, "-"); // various dashes → hyphen-minus
  s = s.replace(/\\left|\\right|\\!|\\,|\\;|\\ /g, "");
  s = s.replace(/\\cdot|\\times|·|×/g, ""); // multiplication signs → implicit
  // Convert superscript run before stripping braces (so `x²` and `x^{2}` both become `x^2`).
  s = s.replace(/[⁰¹²³⁴-⁹]+/g, (run) => {
    const digits = [...run].map((c) => (SUPERSCRIPTS as Record<string, string>)[c] ?? "").join("");
    return digits ? `^${digits}` : "";
  });
  s = s.replace(/[{}$\s*]/g, ""); // braces, $, whitespace, explicit *
  return s;
}

/**
 * The variable a polynomial string is written in: its first ASCII letter, or "x" if none.
 */
export function detectVariable(src: string): string {
  const m = clean(src).match(/[a-z]/);
  return m ? m[0] : "x";
}

/**
 * Parse a single-variable polynomial into a `power → coefficient` map (like terms combined),
 * or null if the whole string isn't a clean polynomial in `variable`.
 */
export function parsePolynomial(src: string, variable: string = "x"): Map<number, number> | null {
  const v = variable.toLowerCase();
  let s = clean(src);
  if (s === "") return null;
  if (!s.startsWith("+") && !s.startsWith("-")) s = `+${s}`;

  // Each signed term: a sign, then a chunk with no further +/- (no negative exponents).
  const termRe = /([+-])([^+-]+)/g;
  // A term is: optional coefficient, optional variable with optional ^power.
  const ve = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape the variable for the regex
  const partRe = new RegExp(`^(\\d*(?:\\.\\d+)?)(?:${ve}(?:\\^(\\d+))?)?$`);

  const poly: Map<number, number> = new Map();
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = termRe.exec(s)) !== null) {
    consumed += m[0].length;
    const sign = m[1] === "-" ? -1 : 1;
    const body = m[2];
    const pm = body.match(partRe);
    if (!pm) return null; // not a clean term → unparseable
    const hasVar = body.includes(v);
    const coeffStr = pm[1];
    if (!hasVar && coeffStr === "") return null; // a lone sign, e.g. "+"
    const coeff = sign * (coeffStr === "" ? 1 : Number(coeffStr));
    if (!Number.isFinite(coeff)) return null;
    const power = hasVar ? (pm[2] ? Number(pm[2]) : 1) : 0;
    poly.set(power, (poly.get(power) ?? 0) + coeff);
  }
  if (consumed !== s.length) return null; // leftover characters (parens, second variable, …)
  return poly;
}

/**
 * Whether two polynomial strings denote the same polynomial (order/format independent).
 * The variable is taken from `expected`. Unparseable `given` → false.
 */
export function comparePolynomial(expected: string, given: string): boolean {
  const variable = detectVariable(expected);
  const a = parsePolynomial(expected, variable);
  const b = parsePolynomial(given, variable);
  if (!a || !b) return false;
  const powers = new Set([...a.keys(), ...b.keys()]);
  const tol = 1e-9;
  for (const p of powers) {
    if (Math.abs((a.get(p) ?? 0) - (b.get(p) ?? 0)) > tol) return false;
  }
  return true;
}
