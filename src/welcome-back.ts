/**
 * The "welcome back" resume banner on the landing page (`/`). If the learner has a focused course
 * they haven't finished, a dismissible banner fills the `#welcome-back` placeholder (just above the
 * "Search concepts" box) -- "You're x / y concepts through <course>. Want to pick up with <next
 * concept>?" -- offering to jump straight to the next concept.
 *
 * "The course" is the learner's explicitly focused course (`primer:course`, see src/course.ts); a
 * concept counts as done once it has a confidence score (stars > 0, see src/confidence-store.ts). The
 * banner shows whenever a course is focused and not yet complete (done < total) -- including a fresh
 * course with nothing done yet -- on every visit (there is no persistent dismissal; "No thanks" just
 * closes it for the current view). It is invoked from index.html's inline module and re-uses the
 * page's `--primer-*` theme tokens.
 * @module
 */

import { getCurrentCourse } from "./course.ts";
import { loadGraph } from "./graph-data.ts";
import { readEntry } from "./confidence-store.ts";
import { pickNextConcept } from "./progress-stats.ts";
import { getLocale, t } from "./i18n.ts";
// <primer-ref> (the banner's concept links) is loaded lazily inside maybeShowWelcomeBack — a static import
// would pull the custom-element class (extends HTMLElement) into Node unit tests that import this module.

import type { ResolvedConcept } from "./types/domain.ts";

/**
 * The pure resume calculation: how far through the course, and the first concept not yet done.
 * Returns null only when there is no concept to resume -- an empty member list, or the course is
 * already complete (done >= total). A freshly-selected course with nothing done yet (done = 0) still
 * resumes, at its first concept. DOM-free and exported so it is unit-tested directly.
 * @param courseMembers  the course's ordered member ids
 * @param isDone  whether a member counts as completed
 */
export function computeResume(
  courseMembers: string[],
  isDone: (id: string) => boolean,
): { done: number; total: number; nextId: string } | null {
  if (!Array.isArray(courseMembers) || courseMembers.length === 0) return null;
  const total = courseMembers.length;
  let done = 0;
  let nextId: string | null = null;
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
 */
function localizedTitle(node: ResolvedConcept, locale: string): string {
  return node.titles?.[locale] ?? node.title;
}

/**
 * Decide whether to show the banner, and show it. Logs the exact reason it does or doesn't appear
 * (a quiet aid while this settles in). Best-effort: any failure silently does nothing.
 */
export async function maybeShowWelcomeBack(): Promise<void> {
  try {
    const why = (msg: string) => console.info("[welcome-back]", msg);

    const courseId = getCurrentCourse();
    if (!courseId) return void why("no course selected (primer:course is empty)");

    const { byId } = await loadGraph();
    const course = byId.get(courseId);
    if (!course) return void why(`focused course not in graph: ${courseId}`);
    const members = ((course.courseMembers ?? []).slice(1)) as string[]; // exclude the hub, like /progress
    if (!members.length) return void why(`focused course has no members: ${courseId}`);

    // The SAME "next concept" choice the /progress "Start here now" uses, so the two always agree.
    const starsOf = (id: string) => readEntry(id)?.stars ?? 0;
    const nextId = pickNextConcept(members, byId, starsOf);
    if (!nextId) return void why(`nothing to resume (all mastered / locked): ${courseId}`);

    if (!document.getElementById("welcome-back")) {
      return void why("no #welcome-back placeholder on this page (landing only)");
    }

    const locale = getLocale();
    const done = members.filter((id) => starsOf(id) >= 1).length;
    const total = members.length;
    const next = byId.get(nextId);
    await import("./components/primer-ref.ts"); // define <primer-ref> before the banner creates them
    showBanner({
      done,
      total,
      courseId,
      nextId,
      courseTitle: localizedTitle(course, locale),
      nextTitle: next ? localizedTitle(next, locale) : nextId,
    });
    why(`shown: ${done}/${total}, next = ${nextId}`);
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
    /* Override the base .tile column stack: sit the content and the rocket side by side. */
    .wb-tile { display: flex; flex-direction: row; align-items: center; gap: 1rem; }
    .wb-main { display: flex; flex-direction: column; gap: 0.35rem; flex: 1 1 auto; min-width: 0; }
    .wb-rocket { flex: none; width: 88px; height: auto; }
    @media (max-width: 36rem) { .wb-rocket { width: 60px; } }
    .wb-tile { cursor: default; }
    /* The two references are our standard concept links (a.concept-ref: accent colour + dotted underline),
       just bold here. Don't override their colour. */
    .wb-tile .wb-em { font-weight: 700; }
    /* Two action buttons: primary → next concept (filled gold), secondary → progress (outline). */
    .wb-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.7rem; }
    .wb-btn { display: inline-block; padding: 0.4rem 0.9rem; border-radius: 999px; font-weight: 600; font-size: 0.9rem;
      text-decoration: none; border: 1px solid var(--primer-course, #e3b15c); transition: filter 0.12s, box-shadow 0.12s; }
    .wb-btn-primary { background: var(--primer-course, #e3b15c); color: #33280a; }
    .wb-btn-secondary { background: transparent; color: var(--primer-ink, #111); }
    .wb-btn:hover, .wb-btn:focus-visible { filter: brightness(1.05); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15); }
    .wb-bar {
      height: 5px; border-radius: 999px; overflow: hidden; margin: 0.5rem 0 0;
      background: color-mix(in srgb, var(--primer-ink, #111) 12%, transparent);
    }
    .wb-bar > span { display: block; height: 100%; background: var(--primer-course, #e3b15c); }
  `;
  document.head.appendChild(style);
}

/**
 * Append a chrome-string template into `parent`, splitting on a `{placeholder}` token and inserting the
 * emphasised value in its place — as a **bold `<primer-ref>`** (our standard concept link, with its
 * confidence dot / course crest) when a concept `refId` is given, else a bold span.
 * @param template  the chrome string with the placeholder still literal (e.g. "{course}")
 * @param token  the placeholder to split on, e.g. "{course}"
 * @param emphasis  the value to insert (bold)
 * @param refId  when set, render the value as a `<primer-ref to="refId">`
 */
function appendEmphasised(parent: HTMLElement, template: string, token: string, emphasis: string, refId?: string) {
  const [before, after = ""] = template.split(token);
  let node;
  if (refId) {
    node = document.createElement("primer-ref");
    node.setAttribute("to", refId);
    node.className = "wb-em";
    node.textContent = emphasis; // primer-ref keeps this text and moves it into its <a class="concept-ref">
  } else {
    node = document.createElement("span");
    node.className = "wb-em";
    node.textContent = emphasis;
  }
  parent.append(document.createTextNode(before), node, document.createTextNode(after));
}

/**
 * Build the resume call-to-action and drop it into the landing page's `#welcome-back` placeholder. It
 * reuses the landing's `.tile` shape (full width, spanning both tile columns) with the golden course
 * border, and the whole tile is a link to the next concept (no buttons).
 */
function showBanner({ done, total, courseId, nextId, courseTitle, nextTitle }: { done: number; total: number; courseId: string; nextId: string; courseTitle: string; nextTitle: string }) {
  const slot = document.getElementById("welcome-back");
  if (!slot) return;
  injectStyles();

  const tile = document.createElement("div");
  tile.className = "tile wb-tile";

  // One description line: the progress sentence (course as a bold link) + the resume line (next concept
  // as a bold link) — both are our standard concept links (a.concept-ref).
  const desc = document.createElement("p");
  desc.className = "t-desc";
  appendEmphasised(desc, t("welcome.progress", { done, total }), "{course}", courseTitle, courseId);
  desc.appendChild(document.createTextNode(" "));
  appendEmphasised(desc, t("welcome.resume"), "{concept}", nextTitle, nextId);

  const bar = document.createElement("div");
  bar.className = "wb-bar";
  const fill = document.createElement("span");
  fill.style.width = `${Math.round((done / total) * 100)}%`;
  bar.appendChild(fill);

  // Two buttons: primary → the next concept, secondary → the progress dashboard.
  const actions = document.createElement("div");
  actions.className = "wb-actions";
  const nextBtn = document.createElement("a");
  nextBtn.className = "wb-btn wb-btn-primary";
  nextBtn.href = `/concepts/${nextId}`;
  nextBtn.textContent = t("welcome.next");
  const progBtn = document.createElement("a");
  progBtn.className = "wb-btn wb-btn-secondary";
  progBtn.href = "/progress";
  progBtn.textContent = t("welcome.seeProgress");
  actions.append(nextBtn, progBtn);

  // Rocket on the left; the progress sentence + bar + buttons on the right.
  const main = document.createElement("div");
  main.className = "wb-main";
  main.append(desc, bar, actions);

  const rocket = document.createElement("img");
  rocket.className = "wb-rocket";
  rocket.src = "/images/rocket.gif";
  rocket.alt = "";
  rocket.setAttribute("aria-hidden", "true");

  tile.append(rocket, main); // rocket on the left, text/progress on the right
  slot.replaceChildren(tile); // fill the placeholder above the search box
}
