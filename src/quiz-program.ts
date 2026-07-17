/**
 * The "write a program" question kind. The learner is given a random value in a global `INPUT`
 * (a number, string, array, object, …) and must assign their final result to a global `ANSWER`;
 * we run their code in the QuickJS sandbox (src/run-js.ts) and compare `ANSWER` against a reference
 * solution's value.
 *
 * This module is the PURE core (no DOM, no sandbox) so it's unit-tested in Node:
 *   - `buildProgramSource(input, code)` wraps the learner's TypeScript in an `INPUT` preamble and a
 *     postamble that reports `ANSWER` on a sentinel-tagged `console.log` line;
 *   - `extractAnswer(lines)` pulls that report back out of the captured console output (and returns
 *     the remaining lines as the visible output);
 *   - `compareResult(expected, got)` deep-compares the reported answer to the reference value, with a
 *     tolerance on numbers and light numeric coercion so a beginner's `"10"` matches a `10`.
 *
 * The component (src/components/primer-program.ts) glues these to the editor + sandbox.
 * @module
 */

/**
 * A private marker prefixed to the one `console.log` line that carries the learner's `ANSWER`, so we
 * can tell it apart from their own `console.log` output. Uses control/PUA code points a learner would
 * never type, and is stripped from what they see.
 */
export const SENTINEL: string = "␞PRIMER_ANSWER␞";

/**
 * Serialize a value to a JS literal for injection as `const INPUT = …`. `undefined` becomes the
 * `undefined` keyword; everything else round-trips through JSON (so strings are quoted, arrays/objects
 * expand). Non-serializable inputs (functions, etc.) aren't expected — the author controls the input.
 */
export function inputLiteral(value: unknown): string {
  if (value === undefined) return "undefined";
  const json = JSON.stringify(value);
  return json === undefined ? "undefined" : json;
}

/**
 * A short, human-readable rendering of an INPUT / ANSWER value for display (the readout above the
 * editor, and the "expected / got" feedback). Strings are quoted; everything else is JSON-ish.
 */
export function displayValue(value: unknown): string {
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Assemble the full program to run: an `INPUT` preamble, the learner's code, and a postamble that
 * reports `ANSWER` on a sentinel-tagged line. `ANSWER` is read via `typeof` so an un-run/undeclared
 * `ANSWER` reports `assigned: false` instead of throwing a ReferenceError; a bare `ANSWER = …`
 * assignment (no declaration) works because the sandbox runs the code as a non-strict script.
 * @param input   The value to expose as the global `INPUT`.
 * @param code    The learner's TypeScript (transpiled by the caller before running).
 */
export function buildProgramSource(input: unknown, code: string): string {
  const report = `console.log(${JSON.stringify(SENTINEL)} + JSON.stringify({ assigned: typeof ANSWER !== "undefined", value: typeof ANSWER === "undefined" ? null : ANSWER }));`;
  return `const INPUT = ${inputLiteral(input)};\n${code}\n;${report}\n`;
}

export interface ExtractedAnswer {
  /** Whether the sentinel report line was present (it always is on a clean run). */
  found: boolean;
  /** Whether the learner actually assigned `ANSWER`. */
  assigned: boolean;
  /** The reported `ANSWER` value (null when unassigned or unparseable). */
  value: unknown;
  /** The console output with the sentinel line removed (what the learner sees). */
  output: string[];
}

/**
 * Separate the sentinel-tagged `ANSWER` report from the learner's own console output. The report is
 * emitted once at the very end; if a learner somehow prints the sentinel too, the LAST tagged line
 * wins (ours). All tagged lines are stripped from the visible output.
 * @param lines   The captured `console.log` lines from the sandbox.
 */
export function extractAnswer(lines: string[]): ExtractedAnswer {
  const output: string[] = [];
  let found = false;
  let assigned = false;
  let value: unknown = null;
  for (const line of lines) {
    if (typeof line === "string" && line.startsWith(SENTINEL)) {
      found = true;
      try {
        const parsed = JSON.parse(line.slice(SENTINEL.length));
        assigned = Boolean(parsed && parsed.assigned);
        value = parsed ? parsed.value : null;
      } catch {
        assigned = false;
        value = null;
      }
    } else {
      output.push(line);
    }
  }
  return { found, assigned, value, output };
}

/** Numeric tolerance mirroring the free-text grader: exact for integers, forgiving for 3-dp reals. */
function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(1e-6, 1e-9 * Math.abs(b));
}

/** A finite number, or a numeric string parsed to one; else null (so callers can coerce leniently). */
function toNumber(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/**
 * Deep-compare a reported `ANSWER` to the reference value. Numbers use a tolerance; if either side is
 * a number and the other is a numeric string, they're compared numerically (so `"10"` matches `10`).
 * Strings/booleans compare strictly; arrays and plain objects compare structurally (recursively).
 * @param expected   The reference solution's value.
 * @param got        The learner's reported `ANSWER`.
 */
export function compareResult(expected: unknown, got: unknown): boolean {
  // Numeric (with light coercion) when either side is a number.
  if (typeof expected === "number" || typeof got === "number") {
    const a = toNumber(expected);
    const b = toNumber(got);
    return a !== null && b !== null && nearlyEqual(a, b);
  }
  if (expected === null || got === null) return expected === got;
  if (typeof expected !== typeof got) return false;
  if (typeof expected !== "object") return expected === got; // string, boolean
  const expArr = Array.isArray(expected);
  const gotArr = Array.isArray(got);
  if (expArr || gotArr) {
    if (!expArr || !gotArr) return false;
    const a = expected as unknown[];
    const b = got as unknown[];
    return a.length === b.length && a.every((x, i) => compareResult(x, b[i]));
  }
  const a = expected as Record<string, unknown>;
  const b = got as Record<string, unknown>;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && compareResult(a[k], b[k]))
  );
}
