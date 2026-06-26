// @ts-check
/**
 * The "welcome back" resume banner on the landing page (`/`). If the learner has a focused course
 * they haven't finished, a dismissible banner fills the `#welcome-back` placeholder (just above the
 * "Search concepts" box) -- "You're x / y concepts through <course>. Want to pick up with <next
 * concept>?" -- offering to jump straight to the next concept.
 *
 * "The course" is the learner's explicitly focused course (`primer:course`, see js/course.js); a
 * concept counts as done once it has a confidence score (stars > 0, see js/confidence-store.js). The
 * banner shows whenever a course is focused and not yet complete (done < total) -- including a fresh
 * course with nothing done yet -- on every visit (there is no persistent dismissal; "No thanks" just
 * closes it for the current view). It is invoked from index.html's inline module and re-uses the
 * page's `--primer-*` theme tokens.
 * @module
 */

import { getCurrentCourse } from "./course.js";
import { loadGraph } from "./graph-data.js";
import { readEntry } from "./confidence-store.js";
import { getLocale, t } from "./i18n.js";

/** @typedef {import("./types/domain.js").ResolvedConcept} ResolvedConcept */

/**
 * The pure resume calculation: how far through the course, and the first concept not yet done.
 * Returns null only when there is no concept to resume -- an empty member list, or the course is
 * already complete (done >= total). A freshly-selected course with nothing done yet (done = 0) still
 * resumes, at its first concept. DOM-free and exported so it is unit-tested directly.
 * @param {string[]} courseMembers  the course's ordered member ids
 * @param {(id: string) => boolean} isDone  whether a member counts as completed
 * @returns {{ done: number, total: number, nextId: string } | null}
 */
export function computeResume(courseMembers, isDone) {
  if (!Array.isArray(courseMembers) || courseMembers.length === 0) return null;
  const total = courseMembers.length;
  let done = 0;
  /** @type {string | null} */
  let nextId = null;
  for (const id of courseMembers) {
    if (isDone(id)) done += 1;
    else if (nextId === null) nextId = id; // first member not yet done, in course order
  }
  if (done >= total || nextId === null) return null;
  return { done, total, nextId };
}

/**
 * A concept's title in the active locale, falling back to its English title. Plain text (never the
 * `titleHtml`) so the banner carries no un-typeset KaTeX.
 * @param {ResolvedConcept} node
 * @param {string} locale
 * @returns {string}
 */
function localizedTitle(node, locale) {
  return node.titles?.[locale] ?? node.title;
}

/**
 * Decide whether to show the banner, and show it. Logs the exact reason it does or doesn't appear
 * (a quiet aid while this settles in). Best-effort: any failure silently does nothing.
 * @returns {Promise<void>}
 */
export async function maybeShowWelcomeBack() {
  try {
    /** @param {string} msg */
    const why = (msg) => console.info("[welcome-back]", msg);

    const courseId = getCurrentCourse();
    if (!courseId) return void why("no course selected (primer:course is empty)");

    const { byId } = await loadGraph();
    const course = byId.get(courseId);
    if (!course) return void why(`focused course not in graph: ${courseId}`);
    const members = course.courseMembers;
    if (!members || members.length === 0) return void why(`focused course has no members: ${courseId}`);

    const resume = computeResume(members, (id) => (readEntry(id)?.stars ?? 0) > 0);
    if (!resume) return void why(`course already complete: ${courseId}`);

    if (!document.getElementById("welcome-back")) {
      return void why("no #welcome-back placeholder on this page (landing only)");
    }

    const locale = getLocale();
    const next = byId.get(resume.nextId);
    showBanner({
      done: resume.done,
      total: resume.total,
      nextId: resume.nextId,
      courseTitle: localizedTitle(course, locale),
      nextTitle: next ? localizedTitle(next, locale) : resume.nextId,
    });
    why(`shown: ${resume.done}/${resume.total}, next = ${resume.nextId}`);
  } catch (err) {
    console.info("[welcome-back] error:", err);
  }
}

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.id = "welcome-back-style";
  style.textContent = `
    /* Reuse the landing page's .tile shape; make it span the full width (both tile columns) and wear
       the golden course accent instead of the default border. */
    .wb-tile { width: 100%; box-sizing: border-box; margin: 0 0 1.6rem; border-color: var(--primer-course, #e3b15c); }
    .wb-tile:hover, .wb-tile:focus-visible { border-color: var(--primer-course, #e3b15c); }
    .wb-tile:focus-visible { box-shadow: 0 0 0 3px var(--primer-course, #e3b15c); }
    .wb-tile .wb-em { font-weight: 700; color: var(--primer-ink, #111); }
    .wb-bar {
      height: 5px; border-radius: 999px; overflow: hidden; margin: 0.5rem 0 0;
      background: color-mix(in srgb, var(--primer-ink, #111) 12%, transparent);
    }
    .wb-bar > span { display: block; height: 100%; background: var(--primer-course, #e3b15c); }
  `;
  document.head.appendChild(style);
}

/**
 * Append a chrome-string template into `parent`, splitting on a `{placeholder}` token and inserting
 * the emphasised (bold) value in its place. Robust to any text around it.
 * @param {HTMLElement} parent
 * @param {string} template  the chrome string with the placeholder still literal (e.g. "{course}")
 * @param {string} token  the placeholder to split on, e.g. "{course}"
 * @param {string} emphasis  the bold value to insert
 */
function appendEmphasised(parent, template, token, emphasis) {
  const [before, after = ""] = template.split(token);
  const em = document.createElement("span");
  em.className = "wb-em";
  em.textContent = emphasis;
  parent.append(document.createTextNode(before), em, document.createTextNode(after));
}

/**
 * Build the resume call-to-action and drop it into the landing page's `#welcome-back` placeholder. It
 * reuses the landing's `.tile` shape (full width, spanning both tile columns) with the golden course
 * border, and the whole tile is a link to the next concept (no buttons).
 * @param {{ done: number, total: number, nextId: string, courseTitle: string, nextTitle: string }} info
 */
function showBanner({ done, total, nextId, courseTitle, nextTitle }) {
  const slot = document.getElementById("welcome-back");
  if (!slot) return;
  injectStyles();

  const tile = document.createElement("a");
  tile.className = "tile wb-tile";
  tile.href = `/concepts/${nextId}.html`;
  tile.setAttribute("aria-label", `${t("welcome.title")}: ${nextTitle}`);

  const title = document.createElement("span");
  title.className = "t-title";
  const emoji = document.createElement("span");
  emoji.className = "t-emoji";
  emoji.setAttribute("aria-hidden", "true");
  emoji.textContent = "🔖";
  const text = document.createElement("span");
  text.className = "t-text";
  text.textContent = t("welcome.title");
  const arrow = document.createElement("span");
  arrow.className = "arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  title.append(emoji, text, arrow);

  // One description line: the progress sentence (course bold) + the resume question (next concept bold).
  const desc = document.createElement("p");
  desc.className = "t-desc";
  appendEmphasised(desc, t("welcome.progress", { done, total }), "{course}", courseTitle);
  desc.appendChild(document.createTextNode(" "));
  appendEmphasised(desc, t("welcome.resume"), "{concept}", nextTitle);

  const bar = document.createElement("div");
  bar.className = "wb-bar";
  const fill = document.createElement("span");
  fill.style.width = `${Math.round((done / total) * 100)}%`;
  bar.appendChild(fill);

  tile.append(title, desc, bar);
  slot.replaceChildren(tile); // fill the placeholder above the search box
}
