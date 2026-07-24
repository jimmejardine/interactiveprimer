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

import { MAX_STARS } from "./progress-core.ts";

/** Default mastery threshold (stars). 8–10 = mastered; 1–7 = learning; 0/none = not started. */
export const MASTERED_AT = 8;

const DAY_MS = 86_400_000;

export interface Entry {
  stars: number;
  first: string;
  last: string;
}
export type Status = "locked" | "ready" | "learning" | "mastered" | "review-due";

/**
 * Spaced-review interval in **days** for a started concept: it lengthens with mastery (Leitner-lite),
 * so a shaky concept comes back within a day or two while a solid one rests for weeks.
 * @param stars  the concept's current rating (1..MAX_STARS)
 * @returns whole days until the concept is due for review
 */
export function reviewInterval(stars: number, masteredAt: number = MASTERED_AT): number {
  // Anchor 1 day at the "learning" floor, doubling per star; capped so mastered concepts still resurface.
  const days = 2 ** (stars - masteredAt + 4);
  return Math.min(240, Math.max(1, Math.round(days)));
}

/**
 * The single "next concept to work on" in a course — shared by the `/` resume banner and the `/progress`
 * "Start here now" CTA so they always agree. **Ready → Finish (no reviews):** the first *ready* concept
 * (unstarted, with every *in-course* prerequisite mastered — prereqs outside the course don't lock it) in
 * course order; else the first *learning* concept (1..masteredAt-1 stars) in course order; else `null`.
 * @param members  the course's ordered member ids WITHOUT the hub (courseMembers.slice(1))
 * @param byId  the graph index (nodes carry `prerequisites`)
 * @param starsOf  a concept's star rating (0 = unrated)
 */
export function pickNextConcept(
  members: string[],
  byId: Map<string, any>,
  starsOf: (id: string) => number,
  opts: { masteredAt?: number } = {},
): string | null {
  const masteredAt = opts.masteredAt ?? MASTERED_AT;
  const mastered = (id: string) => starsOf(id) >= masteredAt;
  // Gate only on prerequisites that are members of THIS course; external prereqs don't lock a concept.
  const memberSet = new Set(members);
  const prereqsMastered = (id: string) =>
    (byId.get(id)?.prerequisites ?? []).every((p: string) => !memberSet.has(p) || mastered(p));
  for (const id of members) if (starsOf(id) === 0 && prereqsMastered(id)) return id; // first ready-to-learn
  for (const id of members) {
    const s = starsOf(id);
    if (s >= 1 && s < masteredAt) return id; // else first mid-learning concept to finish
  }
  return null;
}

/** The `YYYY-MM-DD` day of an ISO date/instant string (`""` if empty/invalid). */
export function dayOf(iso: string) {
  return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : "";
}

/** Milliseconds for an ISO date/instant string, or `NaN` if empty/invalid. */
function msOf(iso: string) {
  if (!iso) return NaN;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * A concept "graduates" out of spaced review — permanently mastered, never resurfaced — once it is a
 * perfect 10/10 AND has been revisited on a later day than it was first rated (its `first` day differs
 * from its `last` day, i.e. the learner has redone it at least once). A fresh 10 rated once today does
 * NOT graduate (both days are today); a legacy undated score does not either (no dates to compare).
 */
export function isGraduated(entry: Entry | undefined | null): boolean {
  if (!entry || entry.stars < MAX_STARS) return false;
  const f = dayOf(entry.first);
  const l = dayOf(entry.last);
  return !!f && !!l && f !== l;
}

/**
 * Whole days from an ISO stamp to `nowMs` (0 if the stamp is missing/in the future).
 */
export function daysAgo(iso: string, nowMs: number) {
  const t = msOf(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
}

/**
 * The five-state display status of one concept. Needs the learner's whole `entriesById` map so it can
 * check whether every prerequisite is mastered (the frontier "ready" vs "locked" decision).
 * @param id  the concept id
 * @param entriesById  learner confidence entries keyed by concept id
 * @param byId  the graph index (nodes carry `prerequisites`)
 */
export function statusOf(
  id: string,
  entriesById: Map<string, Entry>,
  byId: Map<string, any>,
  opts: { masteredAt?: number; nowMs?: number } = {},
): Status {
  const masteredAt = opts.masteredAt ?? MASTERED_AT;
  const nowMs = opts.nowMs ?? Date.now();
  const entry = entriesById.get(id);
  const stars = entry?.stars ?? 0;

  if (stars <= 0) {
    // Unrated → knowledge frontier: "ready" iff every prerequisite is already mastered, else "locked".
    const prereqs = byId.get(id)?.prerequisites ?? [];
    const ready = prereqs.every((p: string) => (entriesById.get(p)?.stars ?? 0) >= masteredAt);
    return ready ? "ready" : "locked";
  }
  const base = stars >= masteredAt ? "mastered" : "learning";
  const t = msOf(entry?.last ?? "");
  if (!isGraduated(entry) && Number.isFinite(t) && nowMs - t > reviewInterval(stars, masteredAt) * DAY_MS) return "review-due";
  return base as Status;
}

/**
 * Full progress rollup for one course.
 * @param members  the course's member ids WITHOUT the hub (courseMembers.slice(1))
 * @param entriesById  learner confidence entries keyed by concept id
 * @param byId  the graph index (nodes carry `prerequisites`)
 */
export function courseProgress(
  members: string[],
  entriesById: Map<string, Entry>,
  byId: Map<string, any>,
  opts: { masteredAt?: number; now?: number | Date } = {},
) {
  const masteredAt = opts.masteredAt ?? MASTERED_AT;
  const nowMs = opts.now == null ? Date.now() : opts.now instanceof Date ? opts.now.getTime() : Number(opts.now);

  const isMastered = (id: string) => (entriesById.get(id)?.stars ?? 0) >= masteredAt;
  // A concept is gated only by prerequisites that are ALSO in this course — external prereqs (from other
  // branches) are assumed satisfied, so a course you've just started isn't entirely "locked".
  const memberSet = new Set(members);
  const prereqsMastered = (id: string) =>
    (byId.get(id)?.prerequisites ?? []).every((p: string) => !memberSet.has(p) || isMastered(p));

  const perConcept: { id: string; stars: number; first: string; last: string; status: Status; due: boolean; overdueDays: number }[] = members.map((id) => {
    const e = entriesById.get(id);
    const stars = e?.stars ?? 0;
    let status: Status = "locked";
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
        status = base as Status;
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
    xp: Math.round(xp), // stars may be fractional (quiz-derived) — keep the XP figure whole
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
 * @returns `YYYY-MM-DD` → count
 */
export function activityBuckets(entries: { first: string; last: string }[]): Map<string, number> {
  const m: Map<string, number> = new Map();
  const bump = (day: string) => {
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
 */
export function currentStreak(entries: { first: string; last: string }[], nowMs: number): number {
  const days: Set<string> = new Set();
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
