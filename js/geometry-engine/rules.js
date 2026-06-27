// @ts-check
/**
 * The catalog of geometry THEOREMS the engine can chain, plus the primitive that expresses each as a
 * tagged **linear relation** over angle values.
 *
 * Every theorem an angle-chase uses is encoded uniformly as a relation `Σ coef·value(key) = constant`
 * — vertical angles (`a − b = 0`), angles on a line (`a + b = 180`), the triangle sum
 * (`a + b + c = 180`), and so on. Carrying the math as one linear shape lets the forward-chainer
 * (js/geometry-engine/chain.js) solve any relation with a single unknown, regardless of which theorem
 * it came from. Each relation is tagged with the **`conceptId`** of the lesson that teaches it, which
 * is how the prerequisite-DAG gating (js/geometry-engine/learned.js) decides whether a learner may use
 * it, and with a **`justifyKey`** the UI localises into the step's explanation.
 *
 * Pure + DOM-free, hence unit-tested.
 * @module
 */

/**
 * @typedef {{ key: string, coef: number }} Term  One angle in a relation, with its coefficient.
 * @typedef {{ rule: string, conceptId: string, justifyKey: string, terms: Term[], constant: number,
 *   refs?: Record<string, any> }} Relation  Asserts `Σ term.coef · value(term.key) = constant`.
 */

/**
 * The theorem catalog: each rule names the lesson `conceptId` that teaches it (the DAG-gating key) and
 * the `justifyKey` the UI localises for a step using it. The `conceptId`s are full-path concept ids;
 * a rule is only offered when its `conceptId` is in the page's prerequisite closure.
 * @type {Record<string, { conceptId: string, justifyKey: string }>}
 */
export const RULES = {
  vertical: {
    conceptId: "mathematics/geometry/vertically-opposite-angles",
    justifyKey: "ruleVertical",
  },
  linearPair: {
    conceptId: "mathematics/geometry/angles-on-a-line-and-at-a-point",
    justifyKey: "ruleLinearPair",
  },
  corresponding: {
    conceptId: "mathematics/geometry/corresponding-angles",
    justifyKey: "ruleCorresponding",
  },
  coInterior: {
    conceptId: "mathematics/geometry/co-interior-angles",
    justifyKey: "ruleCoInterior",
  },
  alternateInterior: {
    conceptId: "mathematics/geometry/alternate-interior-angles",
    justifyKey: "ruleAlternate",
  },
  anglesAtPoint: {
    conceptId: "mathematics/geometry/angles-on-a-line-and-at-a-point",
    justifyKey: "ruleAnglesAtPoint",
  },
  triangleSum: {
    conceptId: "mathematics/geometry/angle-sum-of-a-triangle",
    justifyKey: "ruleTriangleSum",
  },
  isoscelesBase: {
    conceptId: "mathematics/geometry/isosceles-triangles",
    justifyKey: "ruleIsosceles",
  },
  exteriorAngle: {
    conceptId: "mathematics/geometry/exterior-angle-of-a-triangle",
    justifyKey: "ruleExterior",
  },
};

/**
 * Build a tagged relation `Σ coef·value = constant` for a known rule. Throws on an unknown rule so a
 * scaffold can't silently emit an untagged relation.
 * @param {keyof RULES & string} rule
 * @param {Term[]} terms
 * @param {number} constant
 * @param {Record<string, any>} [refs]  Optional extra info (e.g. which angles, for hints).
 * @returns {Relation}
 */
export function rel(rule, terms, constant, refs) {
  const meta = RULES[rule];
  if (!meta) throw new Error(`unknown rule: ${rule}`);
  return { rule, conceptId: meta.conceptId, justifyKey: meta.justifyKey, terms, constant, refs };
}

/** An equality `a = b` (vertical / corresponding / alternate / isosceles-base). @param {string} a @param {string} b @param {keyof RULES & string} rule */
export function equal(a, b, rule) {
  return rel(rule, [{ key: a, coef: 1 }, { key: b, coef: -1 }], 0);
}

/** A sum-to-`total` relation over `keys` (linear pair → 180, angles at a point → 360, triangle → 180). @param {string[]} keys @param {number} total @param {keyof RULES & string} rule */
export function sumTo(keys, total, rule) {
  return rel(rule, keys.map((key) => ({ key, coef: 1 })), total);
}

/**
 * Evaluate whether a relation holds for a value map (used by scaffolds/tests to assert a figure is
 * self-consistent: every emitted relation must be true of the figure's ground-truth angle values).
 * @param {Relation} r @param {Map<string, number> | Record<string, number>} values
 * @returns {boolean}
 */
export function relationHolds(r, values) {
  const get = (/** @type {string} */ k) => (values instanceof Map ? values.get(k) : values[k]);
  let s = 0;
  for (const t of r.terms) {
    const v = get(t.key);
    if (v === undefined) return false;
    s += t.coef * v;
  }
  return Math.abs(s - r.constant) < 1e-6;
}
