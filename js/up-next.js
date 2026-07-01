// @ts-check
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
 * Items 1–2 apply only when a course is active and the current concept is one of its members.
 * @module
 */

import { computeResume } from "./welcome-back.js";

/** How many "nearby" successors to suggest. */
export const MAX_NEARBY = 3;

/**
 * @typedef {"skipped" | "next" | "nearby"} UpNextKind
 * @typedef {{ id: string, kind: UpNextKind }} UpNextItem
 */

/**
 * Compute the ordered "Up next" suggestions for a concept.
 *
 * @param {object} args
 * @param {string} args.currentId  the concept the reader is on
 * @param {string[] | null} args.courseMembers  the active course's ordered member ids (hub at [0]),
 *   or null when no course is active / the graph has no members for it
 * @param {string[]} args.successors  the current concept's direct successors (ids)
 * @param {(id: string) => boolean} args.isDone  whether a concept counts as done (stars > 0)
 * @param {(id: string) => number} args.levelOf  a concept's resolved difficulty level
 * @param {(id: string) => string} args.titleOf  a concept's (localized) title, for a stable tiebreak
 * @returns {UpNextItem[]}
 */
export function computeUpNext({ currentId, courseMembers, successors, isDone, levelOf, titleOf }) {
  /** @type {UpNextItem[]} */
  const items = [];
  // Never suggest the page you're on; `seen` also dedupes across the three rules.
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
  const curLevel = levelOf(currentId);
  const nearby = (successors ?? [])
    .filter((id) => !seen.has(id) && !isDone(id))
    .sort((a, b) => {
      const da = Math.abs(levelOf(a) - curLevel);
      const db = Math.abs(levelOf(b) - curLevel);
      if (da !== db) return da - db; // closest difficulty first
      if (levelOf(a) !== levelOf(b)) return levelOf(a) - levelOf(b); // then absolute level
      return titleOf(a).localeCompare(titleOf(b)); // then title, for a stable order
    })
    .slice(0, MAX_NEARBY);
  for (const id of nearby) {
    items.push({ id, kind: "nearby" });
    seen.add(id);
  }

  return items;
}
