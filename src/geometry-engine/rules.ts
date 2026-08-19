/**
 * The catalog of geometry THEOREMS the engine can chain, plus the primitive that expresses each as a
 * tagged **linear relation** over angle values.
 *
 * Every theorem an angle-chase uses is encoded uniformly as a relation `Σ coef·value(key) = constant`
 * — vertical angles (`a − b = 0`), angles on a line (`a + b = 180`), the triangle sum
 * (`a + b + c = 180`), and so on. Carrying the math as one linear shape lets the forward-chainer
 * (src/geometry-engine/chain.ts) solve any relation with a single unknown, regardless of which theorem
 * it came from. Each relation is tagged with the **`conceptId`** of the lesson that teaches it, which
 * is how the prerequisite-DAG gating (src/geometry-engine/learned.ts) decides whether a learner may use
 * it, and with a **`justifyKey`** the UI localises into the step's explanation.
 *
 * Pure + DOM-free, hence unit-tested.
 * @module
 */

/** One angle in a relation, with its coefficient. */
export interface Term {
  key: string;
  coef: number;
}

/**
 * `linear` (default): `Σ coef·value = constant`.
 * `ratio`: terms `[a,b,c,d]` mean `a/b = c/d`.
 * `pythag`: terms `[a,b,c]` mean `a² + b² = c²` (c the hypotenuse).
 */
export type RelationKind = "linear" | "ratio" | "pythag";

/** Asserts a one-unknown-solvable relation over named quantities. */
export interface Relation {
  rule: string;
  conceptId: string;
  justifyKey: string;
  terms: Term[];
  constant: number;
  kind?: RelationKind;
  refs?: Record<string, any>;
}

/**
 * The theorem catalog: each rule names the lesson `conceptId` that teaches it (the DAG-gating key) and
 * the `justifyKey` the UI localises for a step using it. The `conceptId`s are full-path concept ids;
 * a rule is only offered when its `conceptId` is in the page's prerequisite closure.
 */
export const RULES: Record<string, { conceptId: string; justifyKey: string }> = {
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
  equilateral: {
    conceptId: "mathematics/geometry/types-of-triangles",
    justifyKey: "ruleEquilateral",
  },
  polygonSum: {
    conceptId: "mathematics/geometry/angle-sum-of-polygons",
    justifyKey: "rulePolygonSum",
  },
  polygonExterior: {
    conceptId: "mathematics/geometry/exterior-angles-of-polygons",
    justifyKey: "rulePolygonExterior",
  },
  regularInterior: {
    conceptId: "mathematics/geometry/regular-polygons",
    justifyKey: "ruleRegularInterior",
  },
  regularCentre: {
    conceptId: "mathematics/geometry/regular-polygons",
    justifyKey: "ruleRegularCentre",
  },
  parallelogramOpposite: {
    conceptId: "mathematics/geometry/properties-of-parallelograms",
    justifyKey: "rulePgramOpp",
  },
  parallelogramConsecutive: {
    conceptId: "mathematics/geometry/properties-of-parallelograms",
    justifyKey: "rulePgramConsec",
  },
  angleAtCentre: {
    conceptId: "mathematics/geometry/angle-at-the-centre",
    justifyKey: "ruleCentre",
  },
  angleInSemicircle: {
    conceptId: "mathematics/geometry/angle-in-a-semicircle",
    justifyKey: "ruleSemicircle",
  },
  sameSegment: {
    conceptId: "mathematics/geometry/angles-in-the-same-segment",
    justifyKey: "ruleSameSegment",
  },
  cyclicOpposite: {
    conceptId: "mathematics/geometry/cyclic-quadrilaterals",
    justifyKey: "ruleCyclicOpp",
  },
  tangentPerpRadius: {
    conceptId: "mathematics/geometry/tangents-to-a-circle",
    justifyKey: "ruleTangentPerp",
  },
  twoTangents: {
    conceptId: "mathematics/geometry/tangents-to-a-circle",
    justifyKey: "ruleTwoTangents",
  },
  similarAA: {
    conceptId: "mathematics/geometry/similar-triangles",
    justifyKey: "ruleSimilarAA",
  },
  similarSides: {
    conceptId: "mathematics/geometry/similar-triangles",
    justifyKey: "ruleSimilarSides",
  },
  pythagoras: {
    conceptId: "mathematics/geometry/pythagorean-theorem",
    justifyKey: "rulePythagoras",
  },
};

/** A catalog key — the name authors pass in `theorems` / `require`. */
export type RuleId = keyof typeof RULES;

/**
 * Neighbourhood a theorem belongs to. `minFamilies` scores these, not rule ids — so
 * isosceles + triangle-sum + linear-pair is still one family (triangle), not three.
 * Glue (`vertical`, `linearPair`, `anglesAtPoint`) is untagged and does not count.
 */
export type RuleFamily =
  | "parallels"
  | "triangle"
  | "polygon"
  | "parallelogram"
  | "circle"
  | "similar"
  | "length";

export const RULE_FAMILY: Partial<Record<RuleId, RuleFamily>> = {
  corresponding: "parallels",
  coInterior: "parallels",
  alternateInterior: "parallels",
  triangleSum: "triangle",
  isoscelesBase: "triangle",
  exteriorAngle: "triangle",
  equilateral: "triangle",
  polygonSum: "polygon",
  polygonExterior: "polygon",
  regularInterior: "polygon",
  regularCentre: "polygon",
  parallelogramOpposite: "parallelogram",
  parallelogramConsecutive: "parallelogram",
  angleAtCentre: "circle",
  angleInSemicircle: "circle",
  sameSegment: "circle",
  cyclicOpposite: "circle",
  tangentPerpRadius: "circle",
  twoTangents: "circle",
  similarAA: "similar",
  similarSides: "similar",
  pythagoras: "length",
};

/** Distinct theorem neighbourhoods used by `rules` (glue omitted). */
export function familiesOf(rules: Iterable<string>): Set<RuleFamily> {
  const out = new Set<RuleFamily>();
  for (const r of rules) {
    const f = RULE_FAMILY[r as RuleId];
    if (f) out.add(f);
  }
  return out;
}

/** Map a list of rule names (or raw concept ids) to the concept ids the chainer gates on. */
export function conceptIdsFor(theorems: Iterable<string>): Set<string> {
  const out: Set<string> = new Set();
  for (const t of theorems) out.add(RULES[t as RuleId]?.conceptId ?? t);
  return out;
}

/**
 * Build a tagged relation `Σ coef·value = constant` for a known rule. Throws on an unknown rule so a
 * scaffold can't silently emit an untagged relation.
 * @param refs  Optional extra info (e.g. which angles, for hints).
 */
export function rel(rule: keyof typeof RULES & string, terms: Term[], constant: number, refs?: Record<string, any>): Relation {
  const meta = RULES[rule];
  if (!meta) throw new Error(`unknown rule: ${rule}`);
  return { rule, conceptId: meta.conceptId, justifyKey: meta.justifyKey, terms, constant, refs };
}

/** An equality `a = b` (vertical / corresponding / alternate / isosceles-base). */
export function equal(a: string, b: string, rule: keyof typeof RULES & string) {
  return rel(rule, [{ key: a, coef: 1 }, { key: b, coef: -1 }], 0);
}

/** A sum-to-`total` relation over `keys` (linear pair → 180, angles at a point → 360, triangle → 180). */
export function sumTo(keys: string[], total: number, rule: keyof typeof RULES & string) {
  return rel(rule, keys.map((key) => ({ key, coef: 1 })), total);
}

/** Corresponding-side proportion `a/b = c/d`. */
export function ratioEq(a: string, b: string, c: string, d: string, rule: keyof typeof RULES & string): Relation {
  return { ...rel(rule, [a, b, c, d].map((key) => ({ key, coef: 1 })), 0), kind: "ratio" };
}

/** Pythagoras `a² + b² = c²` (c the hypotenuse). */
export function pythagEq(a: string, b: string, c: string, rule: keyof typeof RULES & string): Relation {
  return { ...rel(rule, [a, b, c].map((key) => ({ key, coef: 1 })), 0), kind: "pythag" };
}

/**
 * Evaluate whether a relation holds for a value map (used by scaffolds/tests to assert a figure is
 * self-consistent: every emitted relation must be true of the figure's ground-truth angle values).
 */
export function relationHolds(r: Relation, values: Map<string, number> | Record<string, number>): boolean {
  const get = (k: string) => (values instanceof Map ? values.get(k) : values[k]);
  if (r.kind === "ratio") {
    const [a, b, c, d] = r.terms.map((t) => get(t.key));
    if ([a, b, c, d].some((v) => v === undefined || v === 0)) return false;
    return Math.abs((a as number) / (b as number) - (c as number) / (d as number)) < 1e-6;
  }
  if (r.kind === "pythag") {
    const [a, b, c] = r.terms.map((t) => get(t.key));
    if ([a, b, c].some((v) => v === undefined)) return false;
    return Math.abs((a as number) ** 2 + (b as number) ** 2 - (c as number) ** 2) < 1e-6;
  }
  let s = 0;
  for (const t of r.terms) {
    const v = get(t.key);
    if (v === undefined) return false;
    s += t.coef * v;
  }
  return Math.abs(s - r.constant) < 1e-6;
}
