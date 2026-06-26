// @ts-check
/**
 * The forward-chainer: the heart of the geometry theorem engine. Given the figure's tagged linear
 * relations (js/geometry-engine/rules.js), a set of KNOWN angle values (the givens), and the set of
 * **allowed** `conceptId`s (the prerequisite-DAG-gated theorem pool), it repeatedly applies any
 * allowed relation that has exactly one unknown angle — solving for that angle — until nothing new can
 * be derived (a fixpoint). Each derivation records its provenance (the rule + premises) so the
 * generator can present the solution as an ordered, justified chain.
 *
 * Pure + DOM-free, hence unit-tested.
 * @module
 */

/**
 * @typedef {import("./rules.js").Relation} Relation
 * @typedef {{ produces: string, value: number, rule: string, conceptId: string, justifyKey: string,
 *   premises: string[], relation: Relation }} DerivStep
 */

/**
 * Forward-chain to a fixpoint. Returns the full `known` map (givens + everything derived) and the
 * ordered list of derivation steps. A relation is applied only if its `conceptId` is allowed and it
 * has exactly one unknown term; the unknown is then solved from the others. Already-known angles are
 * never re-derived, so the loop terminates.
 * @param {Relation[]} relations
 * @param {Array<[string, number]> | Map<string, number>} givens  Known angle values to start from.
 * @param {Set<string>} allowedConceptIds  Theorems the learner may use (by lesson conceptId).
 * @returns {{ known: Map<string, number>, steps: DerivStep[] }}
 */
export function forwardChain(relations, givens, allowedConceptIds) {
  /** @type {Map<string, number>} */
  const known = givens instanceof Map ? new Map(givens) : new Map(givens);
  /** @type {DerivStep[]} */
  const steps = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const r of relations) {
      if (!allowedConceptIds.has(r.conceptId)) continue;
      const unknown = r.terms.filter((t) => !known.has(t.key));
      if (unknown.length !== 1) continue;
      const u = unknown[0];
      if (u.coef === 0) continue;
      let s = r.constant;
      for (const t of r.terms) {
        if (t === u) continue;
        s -= t.coef * /** @type {number} */ (known.get(t.key));
      }
      const value = s / u.coef;
      known.set(u.key, value);
      steps.push({
        produces: u.key,
        value,
        rule: r.rule,
        conceptId: r.conceptId,
        justifyKey: r.justifyKey,
        premises: r.terms.filter((t) => t !== u).map((t) => t.key),
        relation: r,
      });
      progressed = true;
    }
  }
  return { known, steps };
}

/**
 * Backward-trace from a target the minimal ORDERED sub-chain of steps needed to produce it: the step
 * that produced the target, preceded (recursively) by the steps that produced its derived premises.
 * Givens (never produced by a step) are leaves and contribute no step. The result is in derivation
 * order (premises before the steps that use them) and de-duplicated. Returns `null` if the target was
 * never derived.
 * @param {DerivStep[]} steps
 * @param {string} target
 * @returns {DerivStep[] | null}
 */
export function traceTarget(steps, target) {
  /** @type {Map<string, DerivStep>} */
  const byKey = new Map();
  for (const st of steps) if (!byKey.has(st.produces)) byKey.set(st.produces, st);
  if (!byKey.has(target)) return null;
  /** @type {DerivStep[]} */
  const ordered = [];
  const seen = new Set();
  /** @param {string} key */
  const visit = (key) => {
    const st = byKey.get(key);
    if (!st || seen.has(key)) return;
    seen.add(key);
    for (const p of st.premises) visit(p); // premises first
    ordered.push(st);
  };
  visit(target);
  return ordered;
}
