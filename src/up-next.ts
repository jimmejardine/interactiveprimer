/**
 * The pure "Up next…" recommendation logic that backs the `<primer-up-next>` control shown at the
 * bottom of every concept page. Given the current concept, the reader's course (if any), their
 * star ratings, and the graph's successor/level data, it returns an ordered, deduped list of the
 * concepts to suggest next. DOM-free and exported so the rules are unit-tested directly.
 *
 * The rules (see the plan / CLAUDE.md):
 *   1. course "skipped" — the earliest course member with no stars, but ONLY when it sits before
 *      the current concept in course order (a genuine skip; otherwise the "next" item covers it).
 *   2. course "next"    — the first course member AFTER the current one that still has no stars.
 *   3. "nearby"         — up to three direct successors with no stars, closest in difficulty level.
 *   4. "review" (fallback) — ONLY when 1–3 yield nothing: up to three direct successors that ARE
 *      partly learned (1..REVIEW_MAX_STARS stars), closest in difficulty, to nudge reinforcement
 *      before the control gives up and shows the mini-explorer.
 * Items 1–2 apply only when a course is active and the current concept is one of its members.
 * @module
 */

import { computeResume } from "./welcome-back.ts";

/** How many successors to suggest (per tier). */
export const MAX_NEARBY = 3;

/** A concept with 1..REVIEW_MAX_STARS stars is "partly learned" — eligible for the review fallback. */
export const REVIEW_MAX_STARS = 5;

export type UpNextKind = "skipped" | "next" | "nearby" | "review";
export interface UpNextItem {
  id: string;
  kind: UpNextKind;
}

/**
 * Compute the ordered "Up next" suggestions for a concept.
 *
 * @param args.currentId  the concept the reader is on
 * @param args.courseMembers  the active course's ordered member ids (hub at [0]),
 *   or null when no course is active / the graph has no members for it
 * @param args.successors  the current concept's direct successors (ids)
 * @param args.starsOf  a concept's star rating (0 = unrated)
 * @param args.levelOf  a concept's resolved difficulty level
 * @param args.titleOf  a concept's (localized) title, for a stable tiebreak
 */
export function computeUpNext({ currentId, courseMembers, successors, starsOf, levelOf, titleOf }: {
  currentId: string;
  courseMembers: string[] | null;
  successors: string[];
  starsOf: (id: string) => number;
  levelOf: (id: string) => number;
  titleOf: (id: string) => string;
}): UpNextItem[] {
  const isDone = (id: string) => starsOf(id) > 0;
  const items: UpNextItem[] = [];
  // Never suggest the page you're on; `seen` also dedupes across the rules.
  const seen = new Set([currentId]);

  if (Array.isArray(courseMembers)) {
    // courseMembers[0] is the course HUB page (the course index), not a lesson to master — never
    // suggest it (as a skip, a next, or a nearby successor).
    if (courseMembers.length) seen.add(courseMembers[0]);
    const curIdx = courseMembers.indexOf(currentId);
    if (curIdx >= 0) {
      // (1) skipped — earliest unstarred member, only if genuinely BEFORE the current one.
      const resume = computeResume(courseMembers, isDone);
      if (resume && courseMembers.indexOf(resume.nextId) < curIdx && !seen.has(resume.nextId)) {
        items.push({ id: resume.nextId, kind: "skipped" });
        seen.add(resume.nextId);
      }
      // (2) next — first member after the current one that still has no stars.
      for (let i = curIdx + 1; i < courseMembers.length; i++) {
        const id = courseMembers[i];
        if (!isDone(id) && !seen.has(id)) {
          items.push({ id, kind: "next" });
          seen.add(id);
          break;
        }
      }
    }
  }

  // (3) nearby — up to MAX_NEARBY unstarred direct successors, closest in difficulty level.
  const closestFirst = byLevelProximity(levelOf(currentId), levelOf, titleOf);
  const eligible = (successors ?? []).filter((id) => !seen.has(id));
  for (const id of eligible.filter((id) => starsOf(id) === 0).sort(closestFirst).slice(0, MAX_NEARBY)) {
    items.push({ id, kind: "nearby" });
    seen.add(id);
  }

  // (4) review fallback — only when nothing above qualified: partly-learned successors (1..5 stars).
  if (items.length === 0) {
    const partly = eligible
      .filter((id) => starsOf(id) >= 1 && starsOf(id) <= REVIEW_MAX_STARS)
      .sort(closestFirst)
      .slice(0, MAX_NEARBY);
    for (const id of partly) items.push({ id, kind: "review" });
  }

  return items;
}

/**
 * A comparator that orders ids by closeness in difficulty to `curLevel`, then by absolute level,
 * then by localized title — so results are deterministic.
 */
function byLevelProximity(
  curLevel: number,
  levelOf: (id: string) => number,
  titleOf: (id: string) => string,
): (a: string, b: string) => number {
  return (a, b) => {
    const da = Math.abs(levelOf(a) - curLevel);
    const db = Math.abs(levelOf(b) - curLevel);
    if (da !== db) return da - db;
    if (levelOf(a) !== levelOf(b)) return levelOf(a) - levelOf(b);
    return titleOf(a).localeCompare(titleOf(b));
  };
}
