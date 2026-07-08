// @ts-check
/**
 * Pure, DOM-free progress analytics for the "My Progress" dashboard. Given a course's ordered member
 * ids, the learner's stored confidence entries, and the concept graph, it derives every number the
 * dashboard shows — a five-state status per concept (locked / ready / learning / mastered /
 * review-due), course rollups (XP, counts, % mastered, streak), the knowledge-frontier list, the
 * spaced-review queue, and activity buckets for the calendar heatmap.
 *
 * Pedagogy (Math Academy-inspired), all computed from data we already store:
 * - **mastery learning + knowledge graph** → a concept is *ready* (frontier) only when every one of its
 *   prerequisites is mastered; otherwise an unrated concept is *locked*.
 * - **spaced repetition** → a started concept is *review-due* once `now − last` exceeds an interval that
 *   lengthens with mastery (Leitner-lite). A concept that is a perfect 10 AND has been revisited on a
 *   later day (a "graduated" concept — see {@link isGraduated}) drops out of review for good.
 * - **motivation** → XP = the learner's real stars; a day-streak from the activity dates.
 *
 * Imports nothing DOM-related so it is unit-testable and Worker-safe.
 * @module
 */

import { MAX_STARS } from "./progress-core.js";

/** Default mastery threshold (stars). 8–10 = mastered; 1–7 = learning; 0/none = not started. */
export const MASTERED_AT = 8;

const DAY_MS = 86_400_000;

/** @typedef {{ stars: number, first: string, last: string }} Entry */
/** @typedef {"locked" | "ready" | "learning" | "mastered" | "review-due"} Status */

/**
 * Spaced-review interval in **days** for a started concept: it lengthens with mastery (Leitner-lite),
 * so a shaky concept comes back within a day or two while a solid one rests for weeks.
 * @param {number} stars  the concept's current rating (1..MAX_STARS)
 * @param {number} [masteredAt]
 * @returns {number} whole days until the concept is due for review
 */
export function reviewInterval(stars, masteredAt = MASTERED_AT) {
  // Anchor 1 day at the "learning" floor, doubling per star; capped so mastered concepts still resurface.
  const days = 2 ** (stars - masteredAt + 4);
  return Math.min(240, Math.max(1, Math.round(days)));
}

/** The `YYYY-MM-DD` day of an ISO date/instant string (`""` if empty/invalid). @param {string} iso */
export function dayOf(iso) {
  return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : "";
}

/** Milliseconds for an ISO date/instant string, or `NaN` if empty/invalid. @param {string} iso */
function msOf(iso) {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * A concept "graduates" out of spaced review — permanently mastered, never resurfaced — once it is a
 * perfect 10/10 AND has been revisited on a later day than it was first rated (its `first` day differs
 * from its `last` day, i.e. the learner has redone it at least once). A fresh 10 rated once today does
 * NOT graduate (both days are today); a legacy undated score does not either (no dates to compare).
 * @param {Entry | undefined | null} entry
 * @returns {boolean}
 */
export function isGraduated(entry) {
  if (!entry || entry.stars < MAX_STARS) return false;
  const f = dayOf(entry.first);
  const l = dayOf(entry.last);
  return !!f && !!l && f !== l;
}

/**
 * Whole days from an ISO stamp to `nowMs` (0 if the stamp is missing/in the future).
 * @param {string} iso @param {number} nowMs
 */
export function daysAgo(iso, nowMs) {
  const t = msOf(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
}

/**
 * The five-state display status of one concept. Needs the learner's whole `entriesById` map so it can
 * check whether every prerequisite is mastered (the frontier "ready" vs "locked" decision).
 * @param {string} id  the concept id
 * @param {Map<string, Entry>} entriesById  learner confidence entries keyed by concept id
 * @param {Map<string, any>} byId  the graph index (nodes carry `prerequisites`)
 * @param {{ masteredAt?: number, nowMs?: number }} [opts]
 * @returns {Status}
 */
export function statusOf(id, entriesById, byId, opts = {}) {
  const masteredAt = opts.masteredAt ?? MASTERED_AT;
  const nowMs = opts.nowMs ?? Date.now();
  const entry = entriesById.get(id);
  const stars = entry?.stars ?? 0;

  if (stars <= 0) {
    // Unrated → knowledge frontier: "ready" iff every prerequisite is already mastered, else "locked".
    const prereqs = byId.get(id)?.prerequisites ?? [];
    const ready = prereqs.every((/** @type {string} */ p) => (entriesById.get(p)?.stars ?? 0) >= masteredAt);
    return ready ? "ready" : "locked";
  }
  const base = stars >= masteredAt ? "mastered" : "learning";
  const t = msOf(entry?.last ?? "");
  if (!isGraduated(entry) && Number.isFinite(t) && nowMs - t > reviewInterval(stars, masteredAt) * DAY_MS) return "review-due";
  return /** @type {Status} */ (base);
}

/**
 * Full progress rollup for one course.
 * @param {string[]} members  the course's member ids WITHOUT the hub (courseMembers.slice(1))
 * @param {Map<string, Entry>} entriesById  learner confidence entries keyed by concept id
 * @param {Map<string, any>} byId  the graph index (nodes carry `prerequisites`)
 * @param {{ masteredAt?: number, now?: number | Date }} [opts]
 */
export function courseProgress(members, entriesById, byId, opts = {}) {
  const masteredAt = opts.masteredAt ?? MASTERED_AT;
  const nowMs = opts.now == null ? Date.now() : opts.now instanceof Date ? opts.now.getTime() : Number(opts.now);

  const isMastered = (/** @type {string} */ id) => (entriesById.get(id)?.stars ?? 0) >= masteredAt;
  const prereqsMastered = (/** @type {string} */ id) => (byId.get(id)?.prerequisites ?? []).every(isMastered);

  /** @type {{ id: string, stars: number, first: string, last: string, status: Status, due: boolean, overdueDays: number }[]} */
  const perConcept = members.map((id) => {
    const e = entriesById.get(id);
    const stars = e?.stars ?? 0;
    let status = /** @type {Status} */ ("locked");
    let due = false;
    let overdueDays = 0;
    if (stars <= 0) {
      status = prereqsMastered(id) ? "ready" : "locked";
    } else {
      const base = stars >= masteredAt ? "mastered" : "learning";
      const t = msOf(e?.last ?? "");
      const interval = reviewInterval(stars, masteredAt) * DAY_MS;
      if (!isGraduated(e) && Number.isFinite(t) && nowMs - t > interval) {
        due = true;
        overdueDays = Math.floor((nowMs - t - interval) / DAY_MS);
        status = "review-due";
      } else {
        status = /** @type {Status} */ (base);
      }
    }
    return { id, stars: Math.min(MAX_STARS, Math.max(0, stars)), first: e?.first ?? "", last: e?.last ?? "", status, due, overdueDays };
  });

  const total = members.length;
  let started = 0;
  let mastered = 0;
  let learning = 0;
  let ready = 0;
  let locked = 0;
  let reviewDue = 0;
  let xp = 0;
  for (const c of perConcept) {
    xp += c.stars;
    if (c.stars >= 1) started++;
    if (c.stars >= masteredAt) mastered++;
    else if (c.stars >= 1) learning++;
    else if (c.status === "ready") ready++;
    else locked++;
    if (c.due) reviewDue++;
  }

  const memberEntries = perConcept.filter((c) => c.first || c.last);
  const lastActive = memberEntries.reduce((acc, c) => {
    const d = dayOf(c.last) || dayOf(c.first);
    return d > acc ? d : acc;
  }, "");

  return {
    total,
    started,
    notStarted: total - started,
    learning,
    mastered,
    ready,
    locked,
    reviewDue,
    xp,
    xpMax: total * MAX_STARS,
    fracMastered: total ? mastered / total : 0,
    lastActive,
    streakDays: currentStreak(memberEntries, nowMs),
    perConcept,
    /** Knowledge frontier — ready-to-learn, in course order. */
    frontier: perConcept.filter((c) => c.status === "ready"),
    /** Spaced-review queue — most overdue first. */
    reviews: perConcept.filter((c) => c.due).sort((a, b) => b.overdueDays - a.overdueDays),
    /** Calendar heatmap buckets. */
    buckets: activityBuckets(memberEntries),
  };
}

/**
 * Count concept-touch events per calendar day: each entry contributes on its `first` (started) day and,
 * if different, its `last` (updated) day.
 * @param {{ first: string, last: string }[]} entries
 * @returns {Map<string, number>} `YYYY-MM-DD` → count
 */
export function activityBuckets(entries) {
  /** @type {Map<string, number>} */
  const m = new Map();
  const bump = (/** @type {string} */ day) => {
    if (day) m.set(day, (m.get(day) ?? 0) + 1);
  };
  for (const e of entries) {
    const f = dayOf(e.first);
    const l = dayOf(e.last);
    bump(f);
    if (l && l !== f) bump(l);
  }
  return m;
}

/**
 * Consecutive days of activity ending today (0 if nothing was touched today). A day is "active" if any
 * entry's `first` or `last` falls on it.
 * @param {{ first: string, last: string }[]} entries
 * @param {number} nowMs
 * @returns {number}
 */
export function currentStreak(entries, nowMs) {
  /** @type {Set<string>} */
  const days = new Set();
  for (const e of entries) {
    const f = dayOf(e.first);
    const l = dayOf(e.last);
    if (f) days.add(f);
    if (l) days.add(l);
  }
  if (!days.size) return 0;
  let streak = 0;
  for (let t = nowMs; ; t -= DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    if (days.has(day)) streak++;
    else break;
  }
  return streak;
}
