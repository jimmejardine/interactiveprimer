/**
 * The forward-chainer: the heart of the geometry theorem engine. Given the figure's tagged linear
 * relations (src/geometry-engine/rules.ts), a set of KNOWN angle values (the givens), and the set of
 * **allowed** `conceptId`s (the prerequisite-DAG-gated theorem pool), it repeatedly applies any
 * allowed relation that has exactly one unknown angle — solving for that angle — until nothing new can
 * be derived (a fixpoint). Each derivation records its provenance (the rule + premises) so the
 * generator can present the solution as an ordered, justified chain.
 *
 * Pure + DOM-free, hence unit-tested.
 * @module
 */

import type { Relation } from "./rules.ts";

/** Isolate the single unknown in `r` given `known`, or null if it isn't one-unknown-ready. */
function solveRelation(r: Relation, known: Map<string, number>): { key: string; value: number } | null {
  const unknown = r.terms.filter((t) => !known.has(t.key));
  if (unknown.length !== 1) return null;
  const u = unknown[0];
  if (r.kind === "ratio") {
    const [a, b, c, d] = r.terms.map((t) => t.key);
    const A = known.get(a), B = known.get(b), C = known.get(c), D = known.get(d);
    // a/b = c/d
    if (u.key === a && B !== undefined && C !== undefined && D !== undefined && D !== 0) return { key: a, value: (B * C) / D };
    if (u.key === b && A !== undefined && C !== undefined && D !== undefined && C !== 0) return { key: b, value: (A * D) / C };
    if (u.key === c && A !== undefined && B !== undefined && D !== undefined && B !== 0) return { key: c, value: (A * D) / B };
    if (u.key === d && A !== undefined && B !== undefined && C !== undefined && A !== 0) return { key: d, value: (B * C) / A };
    return null;
  }
  if (r.kind === "pythag") {
    const [a, b, c] = r.terms.map((t) => t.key);
    const A = known.get(a), B = known.get(b), C = known.get(c);
    if (u.key === c && A !== undefined && B !== undefined) return { key: c, value: Math.sqrt(A * A + B * B) };
    if (u.key === a && B !== undefined && C !== undefined && C * C >= B * B) return { key: a, value: Math.sqrt(C * C - B * B) };
    if (u.key === b && A !== undefined && C !== undefined && C * C >= A * A) return { key: b, value: Math.sqrt(C * C - A * A) };
    return null;
  }
  if (u.coef === 0) return null;
  let s = r.constant;
  for (const t of r.terms) {
    if (t === u) continue;
    s -= t.coef * (known.get(t.key) as number);
  }
  return { key: u.key, value: s / u.coef };
}

export interface DerivStep {
  produces: string;
  value: number;
  rule: string;
  conceptId: string;
  justifyKey: string;
  premises: string[];
  relation: Relation;
}

/**
 * Forward-chain to a fixpoint. Returns the full `known` map (givens + everything derived) and the
 * ordered list of derivation steps. A relation is applied only if its `conceptId` is allowed and it
 * has exactly one unknown term; the unknown is then solved from the others. Already-known angles are
 * never re-derived, so the loop terminates.
 * @param givens  Known angle values to start from.
 * @param allowedConceptIds  Theorems the learner may use (by lesson conceptId).
 */
export function forwardChain(
  relations: Relation[],
  givens: Array<[string, number]> | Map<string, number>,
  allowedConceptIds: Set<string>,
): { known: Map<string, number>; steps: DerivStep[] } {
  const known: Map<string, number> = givens instanceof Map ? new Map(givens) : new Map(givens);
  const steps: DerivStep[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const r of relations) {
      if (!allowedConceptIds.has(r.conceptId) && !allowedConceptIds.has(r.rule)) continue;
      const solved = solveRelation(r, known);
      if (!solved) continue;
      known.set(solved.key, solved.value);
      steps.push({
        produces: solved.key,
        value: solved.value,
        rule: r.rule,
        conceptId: r.conceptId,
        justifyKey: r.justifyKey,
        premises: r.terms.filter((t) => t.key !== solved.key).map((t) => t.key),
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
 */
export function traceTarget(steps: DerivStep[], target: string): DerivStep[] | null {
  const byKey: Map<string, DerivStep> = new Map();
  for (const st of steps) if (!byKey.has(st.produces)) byKey.set(st.produces, st);
  if (!byKey.has(target)) return null;
  const ordered: DerivStep[] = [];
  const seen = new Set();
  const visit = (key: string) => {
    const st = byKey.get(key);
    if (!st || seen.has(key)) return;
    seen.add(key);
    for (const p of st.premises) visit(p); // premises first
    ordered.push(st);
  };
  visit(target);
  return ordered;
}
