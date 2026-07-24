/**
 * Pure, DOM-free core of the /course-quiz harvester (see src/course-quiz.ts for the full story):
 * the import-rewrite applied to fetched page scripts, the concept-prefix namespacing that makes
 * cross-page registry-name collisions harmless, and the inverse-star-weighted question sampler.
 * Split from course-quiz.ts so `node --test` can exercise the logic without the browser component
 * graph.
 * @module
 */

import type { AuthoredQuestion } from "./types/domain.ts";
import { parseJsonc } from "./jsonc.ts";

/** One harvested question, tagged with the concept page it came from. */
export interface HarvestedQuestion {
  conceptId: string;
  question: AuthoredQuestion;
}

/**
 * Rewrite a page script's bare `"primer"` import specifiers to the given absolute bundle URL.
 * MUST be a full absolute URL (origin included): path-absolute specifiers do not resolve from the
 * `blob:` base the script executes under. Handles `from "primer"`, `from 'primer'` and dynamic
 * `import("primer")`.
 */
export function rewritePrimerImports(code: string, bundleUrl: string): string {
  return code.replace(/(\bfrom\s*|\bimport\s*\(\s*)(["'])primer\2/g, (_m, lead, q) => `${lead}${q}${bundleUrl}${q}`);
}

/** The collision-proof alias for a page-scoped registry name. */
export function prefixedName(conceptId: string, name: string): string {
  return `${conceptId}::${name}`;
}

/**
 * Clone an authored question with its scene references (`chart`/`geometry` on options, `figure`,
 * `problem`, `program`) rewritten to the concept-prefixed alias names.
 */
export function prefixQuestionRefs(q: AuthoredQuestion, conceptId: string): AuthoredQuestion {
  const p = (name: unknown) => (typeof name === "string" && name ? prefixedName(conceptId, name) : name);
  const out: any = { ...q };
  if (out.figure) out.figure = p(out.figure);
  if (out.problem) out.problem = p(out.problem);
  if (out.program) out.program = p(out.program);
  if (Array.isArray(out.options)) {
    out.options = out.options.map((o: any) => {
      const oo = { ...o };
      if (oo.chart) oo.chart = p(oo.chart);
      if (oo.geometry) oo.geometry = p(oo.geometry);
      return oo;
    });
  }
  return out as AuthoredQuestion;
}

/**
 * Re-key a scene-strings block's top-level namespaces to the concept-prefixed form, returning plain
 * JSON (the runtime reader parses JSONC, of which JSON is a subset). Returns null when the block
 * doesn't parse — the caller skips it.
 */
export function rekeySceneStrings(blockText: string, conceptId: string): string | null {
  let parsed: unknown;
  try {
    parsed = parseJsonc(blockText);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const out: Record<string, unknown> = {};
  for (const [ns, value] of Object.entries(parsed as Record<string, unknown>)) {
    out[prefixedName(conceptId, ns)] = value;
  }
  return JSON.stringify(out);
}

/** An authored item is a QUESTION (vs the optional leading config entry). */
export function isQuestion(item: any): boolean {
  return !!item && (Array.isArray(item.options) || item.answer !== undefined || !!item.problem || !!item.program);
}

/**
 * Weighted concept sampler: draw probability ∝ 1/(1+stars) over the eligible concepts (0 stars →
 * highest, 10 → lowest); within a concept, questions draw without replacement until the bank
 * exhausts, then the (reshuffled) bank repeats — template questions re-instantiate with fresh
 * variables on every draw anyway. `starsOf`/`eligible` are read at DRAW time, so stars earned
 * mid-session immediately re-weight.
 */
export function makeSampler(
  pool: HarvestedQuestion[],
  starsOf: (id: string) => number,
  eligible: (id: string) => boolean,
  rng: () => number = Math.random,
): () => HarvestedQuestion | null {
  const byConcept = new Map<string, AuthoredQuestion[]>();
  for (const hq of pool) {
    const list = byConcept.get(hq.conceptId) ?? [];
    list.push(hq.question);
    byConcept.set(hq.conceptId, list);
  }
  const queues = new Map<string, AuthoredQuestion[]>();
  const shuffled = (id: string) => {
    const src = [...(byConcept.get(id) ?? [])];
    for (let i = src.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [src[i], src[j]] = [src[j], src[i]];
    }
    return src;
  };
  return () => {
    const ids = [...byConcept.keys()].filter(eligible);
    if (ids.length === 0) return null;
    const weights = ids.map((id) => 1 / (1 + Math.max(0, starsOf(id))));
    let r = rng() * weights.reduce((a, b) => a + b, 0);
    let pick = ids[ids.length - 1];
    for (let i = 0; i < ids.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        pick = ids[i];
        break;
      }
    }
    let queue = queues.get(pick);
    if (!queue || queue.length === 0) {
      queue = shuffled(pick);
      queues.set(pick, queue);
    }
    const question = queue.shift();
    return question ? { conceptId: pick, question } : null;
  };
}
