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

import { forwardChain, traceTarget } from "./chain.ts";
import type { DerivStep } from "./chain.ts";
import { anglePos, selectScaffolds, SCAFFOLDS } from "./scaffolds.ts";
import type { Figure } from "./scaffolds.ts";
import type { Rng } from "../rng.ts";

export interface Blank {
  key: string;
  value: number;
  conceptId: string;
  justifyKey: string;
  rule: string;
  premises: string[];
  pos: [number, number];
}

export interface Problem {
  figure: Figure;
  givens: Array<{ key: string; value: number; pos: [number, number] }>;
  blanks: Blank[];
  target: string;
  steps: number;
}

function valueMap(fig: Figure): Map<string, number> {
  return new Map(fig.angles.map((a) => [a.key, a.value]));
}

/** Fewest known angles needed to fire any allowed relation (largest relation size − 1). */
function minGivensFor(figure: Figure, allowed: Set<string>): number {
  let need = 1;
  for (const r of figure.relations) {
    if (!allowed.has(r.conceptId) && !allowed.has(r.rule)) continue;
    need = Math.max(need, r.terms.length - 1);
  }
  return need;
}

/** Fisher–Yates with a seeded rng. */
function shuffled<T>(arr: T[], rng: Rng): T[] {
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
 * @param allowed  Allowed theorem conceptIds (the DAG-gated pool).
 */
export function generateProblem(
  figure: Figure,
  allowed: Set<string>,
  rng: Rng,
  opts: {
    minSteps?: number;
    maxSteps?: number;
    minGivens?: number;
    maxGivens?: number;
    attempts?: number;
    /** Rule catalog keys that MUST appear in the solution trace. */
    require?: string[];
  } = {},
): Problem | null {
  const values = valueMap(figure);
  const keys = figure.angles.map((a) => a.key);
  // A 4-term sum (quad interior = 360°) cannot fire until 3 angles are known. Raise the
  // given-count floor/ceiling to whatever the largest allowed relation needs, or the
  // generator returns null and the UI says "no theorems learned".
  const needed = minGivensFor(figure, allowed);
  const maxGivens = Math.min(keys.length - 1, Math.max(opts.maxGivens ?? 2, needed));
  const minGivens = Math.min(maxGivens, Math.max(opts.minGivens ?? 1, needed));
  const { minSteps = 2, maxSteps = 4, attempts = 120, require = [] } = opts;
  let best: { problem: Problem; dist: number } | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const order = shuffled(keys, rng);
    const givensCount = rng.int(minGivens, maxGivens);
    const givenKeys = order.slice(0, givensCount);
    const target = order[givensCount + rng.int(0, Math.max(0, order.length - givensCount - 1))];
    if (!target || givenKeys.includes(target)) continue;

    const givenEntries: Array<[string, number]> = givenKeys.map((k) => [k, values.get(k) as number]);
    const { steps } = forwardChain(figure.relations, givenEntries, allowed);
    const trace = traceTarget(steps, target);
    if (!trace || trace.length === 0) continue;
    if (require.length && !require.every((r) => trace.some((s) => s.rule === r))) continue;

    const problem = buildProblem(figure, givenKeys, trace, target);
    const len = trace.length;
    const dist = len < minSteps ? minSteps - len : len > maxSteps ? len - maxSteps : 0;
    if (dist === 0) return problem;
    if (!best || dist < best.dist) best = { problem, dist };
  }
  return best ? best.problem : null;
}

/**
 * Pick an eligible scaffold and generate a problem. `scaffolds` omitted or `"auto"` means
 * "any scaffold whose theorems are all allowed (and that can fire `require`)".
 */
export function pickAndGenerate(
  allowed: Set<string>,
  rng: Rng,
  opts: {
    scaffolds?: string[] | "auto";
    minSteps?: number;
    maxSteps?: number;
    minGivens?: number;
    maxGivens?: number;
    attempts?: number;
    require?: string[];
  } = {},
): Problem | null {
  const require = opts.require ?? [];
  const explicit = opts.scaffolds && opts.scaffolds !== "auto";
  const names = explicit
    ? (opts.scaffolds as string[]).filter((n) => SCAFFOLDS[n])
    : selectScaffolds(allowed, require).map((s) => s.name);
  // An explicit list that names no known scaffold is a config error — do NOT
  // silently substitute a different figure family (that used to draw parallel
  // lines on an isosceles page when the bundle was stale).
  if (!names.length) return null;

  let best: Problem | null = null;
  let bestDist = Infinity;
  const tries = Math.max(names.length, 4);
  for (let i = 0; i < tries; i++) {
    const name = rng.pick(names);
    const figure = SCAFFOLDS[name](rng);
    const problem = generateProblem(figure, allowed, rng, opts);
    if (!problem) continue;
    const dist = problem.steps < (opts.minSteps ?? 2)
      ? (opts.minSteps ?? 2) - problem.steps
      : problem.steps > (opts.maxSteps ?? 4)
        ? problem.steps - (opts.maxSteps ?? 4)
        : 0;
    if (dist === 0) return problem;
    if (dist < bestDist) {
      best = problem;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Assemble the `Problem` shape from a chosen givens set + the ordered solution trace.
 */
function buildProblem(figure: Figure, givenKeys: string[], trace: DerivStep[], target: string): Problem {
  const byKey = new Map(figure.angles.map((a) => [a.key, a]));
  const pos = (k: string) => anglePos(figure, byKey.get(k) as any);
  const givens = givenKeys.map((k) => ({
    key: k,
    value: (byKey.get(k) as any).value,
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
