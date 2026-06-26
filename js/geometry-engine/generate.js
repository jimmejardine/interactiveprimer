// @ts-check
/**
 * The problem GENERATOR (selector). Given a concrete figure (from a scaffold), the allowed theorem
 * pool (prerequisite-DAG-gated), and a seeded `rng`, it chooses a target angle and a small givens set
 * whose allowed-rule forward-closure *reaches* the target in a sequence of `[minSteps, maxSteps]`
 * theorem applications — then returns the figure plus an ordered, justified **solution chain** that the
 * interactive element turns into the learner's fill-in blanks and per-step hints. Because the figure is
 * concrete and consistent, the target has a unique true value and derivability is proven by the chain.
 *
 * Pure + DOM-free, unit-tested.
 * @module
 */

import { forwardChain, traceTarget } from "./chain.js";
import { anglePos } from "./scaffolds.js";

/**
 * @typedef {import("./scaffolds.js").Figure} Figure
 * @typedef {{ key: string, value: number, conceptId: string, justifyKey: string, rule: string,
 *   premises: string[], pos: [number, number] }} Blank
 * @typedef {{
 *   figure: Figure,
 *   givens: Array<{ key: string, value: number, pos: [number, number] }>,
 *   blanks: Blank[],
 *   target: string,
 *   steps: number,
 * }} Problem
 */

/** @param {Figure} fig @returns {Map<string, number>} */
function valueMap(fig) {
  return new Map(fig.angles.map((a) => [a.key, a.value]));
}

/** Fisher–Yates with a seeded rng. @template T @param {T[]} arr @param {import("../rng.js").Rng} rng @returns {T[]} */
function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generate one problem from a figure. Searches (bounded, seeded) for a (givens, target) pair whose
 * forward-chain trace length is in `[minSteps, maxSteps]`; keeps the closest-to-band candidate as a
 * fallback so it always returns something solvable. Returns `null` only if NOTHING is derivable under
 * the allowed pool (e.g. the page has learned no relevant theorem).
 * @param {Figure} figure
 * @param {Set<string>} allowed  Allowed theorem conceptIds (the DAG-gated pool).
 * @param {import("../rng.js").Rng} rng
 * @param {{ minSteps?: number, maxSteps?: number, minGivens?: number, maxGivens?: number, attempts?: number }} [opts]
 * @returns {Problem | null}
 */
export function generateProblem(figure, allowed, rng, opts = {}) {
  const { minSteps = 2, maxSteps = 4, minGivens = 1, maxGivens = 2, attempts = 120 } = opts;
  const values = valueMap(figure);
  const keys = figure.angles.map((a) => a.key);
  /** @type {{ problem: Problem, dist: number } | null} */
  let best = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const order = shuffled(keys, rng);
    const givensCount = rng.int(minGivens, Math.min(maxGivens, keys.length - 1));
    const givenKeys = order.slice(0, givensCount);
    const target = order[givensCount + rng.int(0, Math.max(0, order.length - givensCount - 1))];
    if (!target || givenKeys.includes(target)) continue;

    /** @type {Array<[string, number]>} */
    const givenEntries = givenKeys.map((k) => [k, /** @type {number} */ (values.get(k))]);
    const { steps } = forwardChain(figure.relations, givenEntries, allowed);
    const trace = traceTarget(steps, target);
    if (!trace || trace.length === 0) continue;

    const problem = buildProblem(figure, givenKeys, trace, target);
    const len = trace.length;
    const dist = len < minSteps ? minSteps - len : len > maxSteps ? len - maxSteps : 0;
    if (dist === 0) return problem;
    if (!best || dist < best.dist) best = { problem, dist };
  }
  return best ? best.problem : null;
}

/**
 * Assemble the `Problem` shape from a chosen givens set + the ordered solution trace.
 * @param {Figure} figure @param {string[]} givenKeys @param {import("./chain.js").DerivStep[]} trace @param {string} target
 * @returns {Problem}
 */
function buildProblem(figure, givenKeys, trace, target) {
  const byKey = new Map(figure.angles.map((a) => [a.key, a]));
  const pos = (/** @type {string} */ k) => anglePos(figure, /** @type {any} */ (byKey.get(k)));
  const givens = givenKeys.map((k) => ({
    key: k,
    value: /** @type {any} */ (byKey.get(k)).value,
    pos: pos(k),
  }));
  const blanks = trace.map((s) => ({
    key: s.produces,
    value: s.value,
    conceptId: s.conceptId,
    justifyKey: s.justifyKey,
    rule: s.rule,
    premises: s.premises,
    pos: pos(s.produces),
  }));
  return { figure, givens, blanks, target, steps: trace.length };
}
