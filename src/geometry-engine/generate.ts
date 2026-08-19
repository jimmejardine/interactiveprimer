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
import { anglePos, lengthPos, selectScaffolds, SCAFFOLDS, SCAFFOLD_LIST } from "./scaffolds.ts";
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
  const m = new Map(fig.angles.map((a) => [a.key, a.value]));
  for (const L of fig.lengths ?? []) m.set(L.key, L.value);
  return m;
}

function quantityKeys(fig: Figure): string[] {
  return [...fig.angles.map((a) => a.key), ...(fig.lengths ?? []).map((L) => L.key)];
}

function quantityPos(fig: Figure, key: string): [number, number] {
  const ang = fig.angles.find((a) => a.key === key);
  if (ang) return anglePos(fig, ang);
  const len = fig.lengths?.find((L) => L.key === key);
  if (len) return lengthPos(fig, len);
  return [0, 0];
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
    /** Prefer (and, when possible, require) this many distinct rule ids in the trace. */
    minDistinctRules?: number;
  } = {},
): Problem | null {
  const values = valueMap(figure);
  const keys = quantityKeys(figure);
  // A 4-term sum (quad interior = 360°) cannot fire until 3 angles are known. Raise the
  // given-count floor/ceiling to whatever the largest allowed relation needs, or the
  // generator returns null and the UI says "no theorems learned".
  const needed = minGivensFor(figure, allowed);
  const maxGivens = Math.min(keys.length - 1, Math.max(opts.maxGivens ?? 2, needed));
  const minGivens = Math.min(maxGivens, Math.max(opts.minGivens ?? 1, needed));
  const { minSteps = 2, maxSteps = 4, attempts = 120, require = [], minDistinctRules = 0 } = opts;
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
    const dist = traceDist(trace, minSteps, maxSteps, minDistinctRules);
    if (dist === 0) return problem;
    if (!best || dist < best.dist) best = { problem, dist };
  }
  return best ? best.problem : null;
}

/** 0 if the trace is in-band and diverse enough; otherwise how far it misses. */
function traceDist(trace: DerivStep[], minSteps: number, maxSteps: number, minDistinct: number): number {
  const len = trace.length;
  const stepDist = len < minSteps ? minSteps - len : len > maxSteps ? len - maxSteps : 0;
  const distinct = new Set(trace.map((s) => s.rule)).size;
  const ruleDist = distinct < minDistinct ? minDistinct - distinct : 0;
  return stepDist + ruleDist;
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
    minDistinctRules?: number;
  } = {},
): Problem | null {
  const require = opts.require ?? [];
  const explicit = opts.scaffolds && opts.scaffolds !== "auto";
  let specs = explicit
    ? (opts.scaffolds as string[]).filter((n) => SCAFFOLDS[n]).map((n) => SCAFFOLD_LIST.find((s) => s.name === n)!)
    : selectScaffolds(allowed, require);
  // An explicit list that names no known scaffold is a config error — do NOT
  // silently substitute a different figure family (that used to draw parallel
  // lines on an isosceles page when the bundle was stale).
  if (!specs.length) return null;
  // A diversity request should try figures that actually have that many theorems.
  const need = opts.minDistinctRules ?? 0;
  if (!explicit && need >= 2) {
    const rich = specs.filter((s) => s.uses.length >= need);
    if (rich.length) specs = rich;
  }

  let best: Problem | null = null;
  let bestDist = Infinity;
  // Walk the eligible figures in a fresh order so a mixed page's circle
  // scaffolds are not starved by the first parallel figure that fits. Repeat
  // if the list is short (a single-scaffold page still gets several rolls).
  const names = shuffled(specs.map((s) => s.name), rng);
  const tries = Math.max(names.length, 4);
  for (let i = 0; i < tries; i++) {
    const name = names[i % names.length];
    const figure = SCAFFOLDS[name](rng);
    const problem = generateProblem(figure, allowed, rng, opts);
    if (!problem) continue;
    const dist = traceDist(problem.blanks, opts.minSteps ?? 2, opts.maxSteps ?? 4, need);
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
  const values = valueMap(figure);
  const givens = givenKeys.map((k) => ({
    key: k,
    value: values.get(k) as number,
    pos: quantityPos(figure, k),
  }));
  const blanks = trace.map((s) => ({
    key: s.produces,
    value: s.value,
    conceptId: s.conceptId,
    justifyKey: s.justifyKey,
    rule: s.rule,
    premises: s.premises,
    pos: quantityPos(figure, s.produces),
  }));
  return { figure, givens, blanks, target, steps: trace.length };
}
