/**
 * Grade a typed math answer by ALGEBRAIC EQUIVALENCE using the CortexJS Compute Engine — so a
 * factored, reordered, or otherwise-equivalent form of the expected answer is accepted
 * (`(x+3)(x+4)` ≡ `x^2+7x+12` ≡ `12+7x+x^2`; `1/2` ≡ `0.5`). Both the authored `expected`
 * (ASCII, e.g. "x^2 + 7x + 12") and the learner's input (MathLive LaTeX, e.g. "x^{2}+7x+12")
 * parse directly via `ce.parse`.
 *
 * The Compute Engine is INJECTED — the browser lazy-loads it from a CDN (src/compute-engine.ts);
 * tests construct one from the dev package — so this stays pure and unit-testable, and a
 * caller can fall back to the simple comparator when CE isn't available.
 * @module
 */

/**
 * Whether `given` is mathematically equivalent to `expected`.
 * @param ce          A CortexJS ComputeEngine instance.
 * @param expected    The authored correct answer (ASCII or LaTeX).
 * @param given       The learner's typed answer (plain text or MathLive LaTeX).
 */
export function gradeEquivalent(ce: any, expected: string, given: string): boolean {
  if (typeof given !== "string" || given.trim() === "") return false;
  try {
    const a = ce.parse(String(expected));
    const b = ce.parse(given);
    if (!a || !b || a.isValid === false || b.isValid === false) return false;
    return a.isEqual(b) === true;
  } catch {
    return false; // unparseable / undecidable → not a match
  }
}
