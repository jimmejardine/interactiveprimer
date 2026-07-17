/**
 * The "My Progress" dashboard renderer. Fuses the learner's confidence entries (js/confidence-store)
 * with the active course's ordered members (js/course + the graph) into a live, visually rich
 * dashboard: a course switcher, the "living constellation" (the confidence-coloured concept graph),
 * XP + mastery stat tiles, a spaced-review / knowledge-frontier pair of panels, an activity heatmap,
 * and a per-concept list. All numbers come from the pure core src/progress-stats.ts.
 *
 * Reacts live to `course-change` (rebuild + remount the graph) and `confidence-change` (recompute the
 * data panels; the graph repaints itself). DOM-only; no new persistence.
 * @module
 */

import { getLocale, t } from "./i18n.ts";
import { getCurrentCourse, setCurrentCourse, clearCourse } from "./course.ts";
import { allEntries } from "./confidence-store.ts";
import { confidenceColor } from "./confidence-color.ts";
import { mountCourseSearch, SEARCH_BOX_CSS } from "./concept-search-box.ts";
import { mountConceptGraph } from "./concept-graph.ts";
import { glitter, glitterIntensity } from "./glitter.ts";
import { escapeHtml } from "./html-entities.ts";
import { courseProgress, daysAgo, pickNextConcept, MASTERED_AT } from "./progress-stats.ts";

/** Chrome-string key per mastery status (localized via `t()` at render time). */
const MASTERY_LABEL_KEY = {
  locked: "dash.status.locked",
  ready: "dash.status.ready",
  learning: "dash.status.learning",
  mastered: "dash.status.mastered",
  "review-due": "dash.status.reviewDue",
};
const masteryLabel = (status: keyof typeof MASTERY_LABEL_KEY) => t(MASTERY_LABEL_KEY[status]);

/**
 * Mount the dashboard into `root`.
 */
export function mountProgressDashboard(root: HTMLElement, { byId }: { byId: Map<string, any> }): { destroy: () => void } {
  const locale = getLocale();
  const titleOf = (id: string) => byId.get(id)?.titles?.[locale] ?? byId.get(id)?.title ?? (id.split("/").pop() ?? id);

  // ---- static shell (built once; dynamic regions are refilled by paint()) -----------------------
  root.innerHTML = "";
  // The search box's styles live in the shared SEARCH_BOX_CSS (normally injected by the concept graph);
  // inject once here so the box is styled even in the empty state, before any constellation mounts.
  if (!document.getElementById("primer-search-css")) {
    const s = document.createElement("style");
    s.id = "primer-search-css";
    s.textContent = SEARCH_BOX_CSS;
    document.head.appendChild(s);
  }
  const head = el("header", "dash-head", `<h1 class="dash-title">${escapeHtml(t("menu.myProgress"))}<span class="dash-course"></span></h1>`);
  const courseCap = head.querySelector(".dash-course") as HTMLElement;
  const exitBtn = document.createElement("button");
  exitBtn.type = "button";
  exitBtn.className = "exit-course-btn";
  exitBtn.textContent = t("course.exit");
  exitBtn.addEventListener("click", () => clearCourse()); // → course-change → rebuild to the empty state
  courseCap.after(exitBtn); // in the header, in flow immediately after the course name
  // One horizontal row: a fixed search box, then the course chips in their own sideways-scrolling strip.
  // The search box must sit OUTSIDE the overflow strip, or its results popup gets clipped.
  const switcher = el("section", "switcher");
  const switcherRow = el("div", "switcher-row");
  const searchHost = el("div", "search-host");
  const chipsRow = el("div", "course-chips-row");
  switcherRow.append(searchHost, chipsRow);
  switcher.append(switcherRow);

  const constellationWrap = el("section", "constellation-wrap");
  const graphHost = el("div", "constellation");
  graphHost.id = "constellation";
  constellationWrap.append(graphHost);

  const tiles = el("section", "tiles");
  const heat = el("section", "card heatmap");
  const panels = el("section", "panels");
  const list = el("section", "card concept-list");
  const empty = el("section", "card empty-state");

  // The constellation (explorer graph) sits at the very bottom, after the concept list.
  root.append(head, switcher, empty, tiles, heat, panels, list, constellationWrap);

  // course picker (mounted once — course-independent)
  const searchHandle = mountCourseSearch(searchHost, {
    byId,
    locale,
    placement: "inline",
    onSelect: (id: string) => setCurrentCourse(id), // → course-change → rebuild()
  });

  let graphHandle: { destroy: () => void } | null = null;
  let glittered = false;

  const mountGraph = () => {
    graphHandle?.destroy();
    graphHandle = null;
    const course = activeCourse();
    if (!course) return;
    graphHandle = mountConceptGraph(graphHost, { byId, locale });
  };

  const activeCourse = () => {
    const id = getCurrentCourse();
    const node = id ? byId.get(id) : null;
    return node?.course ? node : null;
  };

  // ---- paint: recompute stats and fill every dynamic region (NOT the graph) ---------------------
  const paint = () => {
    const entriesById = new Map(allEntries().map((e) => [e.id, e]));
    renderChips(chipsRow, byId, entriesById, titleOf);

    const course = activeCourse();
    const hasCourse = !!course;
    const show = (n: HTMLElement, on: boolean) => (n.style.display = on ? "" : "none");
    [constellationWrap, tiles, heat, panels, list, exitBtn].forEach((n) => show(n, hasCourse));
    show(empty, !hasCourse);

    if (!hasCourse) {
      courseCap.innerHTML = "";
      empty.innerHTML = `<h2>${escapeHtml(t("dash.empty.title"))}</h2>
        <p>${escapeHtml(t("dash.empty.body"))}</p>`;
      return;
    }

    const members = (course.courseMembers ?? []).slice(1); // drop the hub at [0]
    const p = courseProgress(members, entriesById, byId, { masteredAt: MASTERED_AT });
    const starsOf = (id: string) => entriesById.get(id)?.stars ?? 0;
    const nextId = pickNextConcept(members, byId, starsOf); // shared with the "/" resume banner

    courseCap.innerHTML = `: ${escapeHtml(titleOf(course.id))}`;
    renderTiles(tiles, p);
    renderHeatmap(heat, p.buckets, p.streakDays);
    renderPanels(panels, p, titleOf, nextId, starsOf);
    renderList(list, p, titleOf, byId, locale);

    // one-shot celebration when the course is mostly mastered
    if (!glittered && p.total > 0 && p.fracMastered >= 0.999) {
      glittered = true;
      glitter(constellationWrap, glitterIntensity(1));
    }
  };

  const rebuild = () => {
    glittered = false;
    mountGraph();
    paint();
  };

  const onCourse = () => rebuild();
  const onConfidence = () => paint(); // the graph self-repaints on confidence-change
  document.addEventListener("course-change", onCourse);
  document.addEventListener("confidence-change", onConfidence);

  rebuild();

  return {
    destroy() {
      document.removeEventListener("course-change", onCourse);
      document.removeEventListener("confidence-change", onConfidence);
      graphHandle?.destroy();
      searchHandle.destroy();
      root.innerHTML = "";
    },
  };
}

// ---- section renderers ---------------------------------------------------------------------------

function renderChips(host: HTMLElement, byId: Map<string, any>, entriesById: Map<string, any>, titleOf: (id: string) => string) {
  const active = getCurrentCourse();
  const courses = [...byId.values()].filter((c) => c.course);
  const withProgress = courses
    .map((c) => {
      const members = ((c.courseMembers ?? []).slice(1)) as string[];
      let mastered = 0;
      let touched = 0;
      let lastMs = 0;
      for (const m of members) {
        const e = entriesById.get(m);
        const stars = e?.stars ?? 0;
        if (stars >= 1) touched++;
        if (stars >= MASTERED_AT) mastered++;
        const t = e?.last ? Date.parse(e.last) : NaN;
        if (Number.isFinite(t) && t > lastMs) lastMs = t;
      }
      return { id: c.id, frac: members.length ? mastered / members.length : 0, touched, lastMs };
    })
    // Show a course if it's the active one, or if you've studied some of it but NOT yet finished it —
    // a 100%-mastered course drops off the list (unless it's the one you're currently viewing).
    .filter((c) => c.id === active || (c.touched > 0 && c.frac < 1))
    // Rank by what you're actually working on — active course first, then most-recently-studied, then
    // the course that owns the most of your starred concepts. (Sorting by % mastered buried big courses
    // like Calculus beneath smaller ones that merely share a concept.) No cap — the row scrolls sideways.
    .sort(
      (a, b) =>
        (b.id === active ? 1 : 0) - (a.id === active ? 1 : 0) || b.lastMs - a.lastMs || b.touched - a.touched,
    );

  host.innerHTML = "";
  for (const c of withProgress) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (c.id === active ? " is-active" : "");
    btn.innerHTML = `${ringSvg(c.frac, 18)}<span>${escapeHtml(titleOf(c.id))}</span>`;
    btn.addEventListener("click", () => setCurrentCourse(c.id));
    host.append(btn);
  }
}

function renderTiles(host: HTMLElement, p: ReturnType<typeof courseProgress>) {
  const pct = Math.round(p.fracMastered * 100);
  const last = p.lastActive ? t("dash.daysAgo", { d: daysAgo(p.lastActive + "T12:00:00Z", Date.now()) }) : "—";
  host.innerHTML = `
    <div class="tile tile-ring">
      ${ringSvg(p.fracMastered, 120, `${pct}%`)}
      <div class="tile-label">${escapeHtml(t("dash.tile.mastered"))}</div>
    </div>
    <div class="tile">
      <div class="tile-num">${p.xp}<span class="tile-of"> / ${p.xpMax}</span></div>
      <div class="tile-label">${escapeHtml(t("dash.tile.xp"))}</div>
      <div class="meter"><span style="width:${p.xpMax ? (p.xp / p.xpMax) * 100 : 0}%"></span></div>
    </div>
    <div class="tile tile-counts">
      ${countPill("ready", p.ready)}${countPill("learning", p.learning)}${countPill("mastered", p.mastered)}${countPill("locked", p.locked)}
      <div class="tile-label">${escapeHtml(t("dash.tile.started", { started: p.started, total: p.total }))}</div>
    </div>
    <div class="tile">
      <div class="tile-num">🔥 ${p.streakDays}</div>
      <div class="tile-label">${escapeHtml(t("dash.tile.streak"))}</div>
      <div class="tile-sub">${escapeHtml(t("dash.tile.lastActive", { last }))}${p.reviewDue ? ` · ${t("dash.tile.due", { n: `<strong>${p.reviewDue}</strong>` })}` : ""}</div>
    </div>`;
}

function renderHeatmap(host: HTMLElement, buckets: Map<string, number>, streak: number) {
  const WEEKS = 53; // a full year, so the grid fills desktop width with sensibly-sized cells
  const today = new Date();
  const todayMid = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  // start on the Sunday WEEKS-1 weeks before this week's Sunday
  const dow = new Date(todayMid).getUTCDay(); // 0 = Sunday
  const startWeekSunday = todayMid - (dow + (WEEKS - 1) * 7) * 86_400_000;
  let max = 1;
  for (const v of buckets.values()) if (v > max) max = v;

  let cells = "";
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < 7; d++) {
      const ms = startWeekSunday + (w * 7 + d) * 86_400_000;
      if (ms > todayMid) continue;
      const day = new Date(ms).toISOString().slice(0, 10);
      const n = buckets.get(day) ?? 0;
      const level = n === 0 ? 0 : Math.min(4, 1 + Math.floor(((n - 1) / max) * 3));
      cells += `<div class="hm-cell" data-level="${level}" title="${escapeHtml(t(n === 1 ? "dash.heatOne" : "dash.heatMany", { day, n }))}"></div>`;
    }
  }
  host.innerHTML = `
    <div class="card-head"><h2>${escapeHtml(t("dash.activity"))}</h2><span class="muted">${escapeHtml(t("dash.streakLong", { n: streak }))}</span></div>
    <div class="hm-grid" style="grid-template-columns: repeat(${WEEKS}, minmax(0, 1fr))">${cells}</div>
    <div class="hm-legend"><span class="muted">${escapeHtml(t("dash.less"))}</span>
      ${[0, 1, 2, 3, 4].map((l) => `<span class="hm-cell" data-level="${l}"></span>`).join("")}
      <span class="muted">${escapeHtml(t("dash.more"))}</span></div>`;
}

function renderPanels(host: HTMLElement, p: ReturnType<typeof courseProgress>, titleOf: (id: string) => string,
  nextId: string | null, starsOf: (id: string) => number) {
  const frontier = p.frontier.slice(0, 6);
  const reviews = p.reviews.slice(0, 6);
  const linkRow = (c: any, badge: string) =>
    `<a class="p-item" href="/concepts/${c.id}.html"><span>${escapeHtml(titleOf(c.id))}</span><span class="p-badge">${badge}</span></a>`;

  host.innerHTML = `
    <div class="card panel">
      <div class="card-head"><h2>${escapeHtml(t("dash.readyHead"))}</h2><span class="muted">${p.ready}</span></div>
      <p class="muted small">${escapeHtml(t("dash.readyDesc"))}</p>
      ${frontier.length ? frontier.map((c) => linkRow(c, escapeHtml(t("dash.prereqsOk")))).join("") : `<p class="muted">${escapeHtml(t("dash.readyEmpty"))}</p>`}
    </div>
    <div class="card panel">
      <div class="card-head"><h2>${escapeHtml(t("dash.reviewsHead"))}</h2><span class="muted">${p.reviewDue}</span></div>
      <p class="muted small">${escapeHtml(t("dash.reviewsDesc"))}</p>
      ${reviews.length ? reviews.map((c) => linkRow(c, escapeHtml(t("dash.daysAgo", { d: daysAgo(c.last, Date.now()) })))).join("") : `<p class="muted">${escapeHtml(t("dash.reviewsEmpty"))}</p>`}
    </div>
    <div class="card panel panel-next">
      <div class="card-head"><h2>${escapeHtml(t("dash.nextHead"))}</h2></div>
      ${nextNudge(nextId, starsOf, titleOf)}
    </div>`;
}

/** The single clearest next action — the shared `pickNextConcept` choice (ready-to-learn, else finish a
 * learning concept). */
function nextNudge(nextId: string | null, starsOf: (id: string) => number, titleOf: (id: string) => string) {
  if (!nextId) return `<p class="muted">${escapeHtml(t("dash.allDone"))}</p>`;
  const kind = starsOf(nextId) === 0 ? t("dash.nudgeNew") : t("dash.nudgeContinue");
  return `<p class="muted small">${escapeHtml(kind)}</p><a class="p-next-cta" href="/concepts/${nextId}.html">${escapeHtml(titleOf(nextId))} →</a>`;
}

function renderList(host: HTMLElement, p: ReturnType<typeof courseProgress>, titleOf: (id: string) => string, byId: Map<string, any>, locale: string) {
  const rows = p.perConcept
    .map((c) => {
      const tint = confidenceColor(c.id) || "var(--primer-star)";
      const stars = starRow(c.stars, tint);
      const started = c.first ? c.first.slice(0, 10) : "—";
      const updated = c.last ? c.last.slice(0, 10) : "—";
      return `<div class="row">
        <a class="row-title" href="/concepts/${c.id}.html">${escapeHtml(titleOf(c.id))}</a>
        <div class="row-stars">${stars}</div>
        <div class="row-status"><span class="status" data-status="${c.status}">${escapeHtml(masteryLabel(c.status))}</span></div>
        <div class="row-date" title="${escapeHtml(t("dash.col.started"))}">${started}</div>
        <div class="row-date" title="${escapeHtml(t("dash.col.updated"))}">${updated}</div>
      </div>`;
    })
    .join("");
  host.innerHTML = `<div class="card-head"><h2>${escapeHtml(t("dash.allConcepts"))}</h2><span class="muted">${p.total}</span></div>
    <div class="row row-head"><span>${escapeHtml(t("dash.col.concept"))}</span><span>${escapeHtml(t("dash.col.confidence"))}</span><span>${escapeHtml(t("dash.col.status"))}</span><span>${escapeHtml(t("dash.col.started"))}</span><span>${escapeHtml(t("dash.col.updated"))}</span></div>
    ${rows}`;
}

// ---- small html helpers --------------------------------------------------------------------------

function ringSvg(frac: number, size: number, centre?: string) {
  const r = size / 2 - size * 0.09;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, frac)));
  const cx = size / 2;
  const sw = size * 0.11;
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--primer-control-bg, #0001)" stroke-width="${sw}"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--primer-course, #e3b15c)" stroke-width="${sw}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${cx} ${cx})"/>
    ${centre ? `<text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" class="ring-text">${centre}</text>` : ""}
  </svg>`;
}

function starRow(stars: number, tint: string) {
  let out = "";
  for (let i = 1; i <= 10; i++) {
    out += `<span class="s${i <= stars ? " on" : ""}"${i <= stars ? ` style="color:${tint}"` : ""}>★</span>`;
  }
  return out;
}

function countPill(status: keyof typeof MASTERY_LABEL_KEY, n: number) {
  return `<span class="count-pill" data-status="${status}"><b>${n}</b> ${escapeHtml(masteryLabel(status))}</span>`;
}

function el(tag: string, cls: string, html?: string) {
  const n = document.createElement(tag);
  n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
