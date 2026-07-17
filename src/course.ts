/**
 * The learner's *current course* — a profile setting (like the theme or locale). A course is a
 * curated path through a set of concepts, declared by a page with `"course": true` in its
 * concept-meta; the stored value here is that course page's concept id (e.g.
 * `applied-mathematics/game-development-math/game-development-math`), or "" for none.
 *
 * Persisted to localStorage and broadcast via a `course-change` event so the explorers, the menu
 * and the page header update live — mirroring js/theme.js. It is also written into / read from the
 * progress export (see js/progress.js).
 * @module
 */

import { safeGet, safeSet, safeRemove } from "./storage.ts";

export const COURSE_KEY = "primer:course";

/** The current course id, or "" if none (or if localStorage is unavailable). */
export function getCurrentCourse(): string {
  return safeGet(COURSE_KEY) || "";
}

/**
 * Set (or clear, with "") the current course and broadcast `course-change`.
 * @param id  A course page's concept id, or "" to leave the course.
 */
export function setCurrentCourse(id: string) {
  const value = id || "";
  if (value) safeSet(COURSE_KEY, value);
  else safeRemove(COURSE_KEY);
  document.dispatchEvent(new CustomEvent("course-change", { detail: { course: value } }));
}

/** Leave the current course (clear it). */
export function clearCourse() {
  setCurrentCourse("");
}
