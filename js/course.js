// @ts-check
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

export const COURSE_KEY = "primer:course";

/** The current course id, or "" if none (or if localStorage is unavailable). @returns {string} */
export function getCurrentCourse() {
  try {
    return localStorage.getItem(COURSE_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * Set (or clear, with "") the current course and broadcast `course-change`.
 * @param {string} id  A course page's concept id, or "" to leave the course.
 */
export function setCurrentCourse(id) {
  const value = id || "";
  try {
    if (value) localStorage.setItem(COURSE_KEY, value);
    else localStorage.removeItem(COURSE_KEY);
  } catch {
    /* persistence is best-effort */
  }
  document.dispatchEvent(new CustomEvent("course-change", { detail: { course: value } }));
}

/** Leave the current course (clear it). */
export function clearCourse() {
  setCurrentCourse("");
}
