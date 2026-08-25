/**
 * Pure placement scheduler for /get-started: filter the school-age pool in one field, then
 * pick the next concept to probe (smattering → climb → probe) and summarise a per-branch
 * frontier. DOM-free so node:test can drive it.
 *
 * Level 0 / ungrounded concepts are a "beyond the ceiling" pool — mixed beginner stubs and
 * ungated advanced pages — and are only sampled after the learner has cleared the leveled ramp.
 * @module
 */

export type Field = "mathematics" | "physics" | "computer-science";
/** 1 = never studied … 5 = very confident. */
export type Confidence = 1 | 2 | 3 | 4 | 5;
export type Phase = "smattering" | "ascent" | "frontier" | "done";

export interface ProbeNode {
  id: string;
  level: number;
  declaredLevel?: number;
  course?: boolean;
  hasQuiz?: boolean;
  /** False when no gate exists in the ancestry (level fell back to 0). */
  levelGrounded?: boolean;
  title: string;
  prerequisites: string[];
  /** Ordered members, present on `course: true` pages (hub id first). */
  courseMembers?: string[];
}

export interface Probe {
  id: string;
  level: number;
  correct: boolean;
}

export interface PlacementState {
  field: Field;
  age: number;
  confidence: Confidence;
  phase: Phase;
  probes: Probe[];
  /** Frozen miss-altitude once climb ends; null until then. */
  frontier: number | null;
  consecutiveHits: number;
  consecutiveMisses: number;
  targetLevel: number;
  frontierCount: number;
}

export interface BranchReport {
  branch: string;
  status: "solid" | "shaky" | "untested";
  /** Highest altitude this branch looked comfortable at; null if untested. */
  strongTo: number | null;
}

export interface CourseMatch {
  id: string;
  /** Curriculum code: uk / us / au / ca / za / ib. */
  region: string;
  /** Nominal altitude (path-encoded year/grade, or member-median for topic courses). */
  typicalLevel: number;
}

export interface PlacementSummary {
  frontier: number;
  branches: BranchReport[];
  startHere: string[];
  /** School courses from every curriculum at this altitude — not a single country's year. */
  courses: CourseMatch[];
}

export const SMATTERING = 4;
export const MAX_QUESTIONS = 25;
export const MAX_FRONTIER = 8;
export const SCHOOL_MIN = 5;
export const SCHOOL_MAX = 18;
/** Rolling window: this many misses (or a ≤50% pass rate over ≥3) opens the frontier. */
export const MISS_THRESHOLD = 2;

export const LOW_BAND: Record<Field, [number, number]> = {
  mathematics: [5, 7],
  physics: [6, 8],
  "computer-science": [8, 10],
};

export type Rng = () => number;

/** Second path segment — the branch (algebra, geometry, electricity, …). */
export function branchOf(id: string): string {
  const parts = id.split("/");
  return parts[1] ?? parts[0] ?? id;
}

export function clampAge(age: number): number {
  if (!Number.isFinite(age)) return 14;
  return Math.min(18, Math.max(5, Math.round(age)));
}

/** Ungated (level 0 / not grounded) — extra-hard pool, never shown to a beginner. */
export function isCeilingNode(n: ProbeNode): boolean {
  return n.level === 0 || n.levelGrounded === false;
}

function inField(n: ProbeNode, field: Field): boolean {
  return n.id.startsWith(`${field}/`) && !n.course && !!n.hasQuiz;
}

/** Quiz-bearing school lessons with a real altitude (excludes ungated level-0). */
export function schoolPool(nodes: readonly ProbeNode[], field: Field): ProbeNode[] {
  return nodes.filter(
    (n) => inField(n, field) && !isCeilingNode(n) && n.level >= SCHOOL_MIN && n.level <= SCHOOL_MAX,
  );
}

/** Ungated extra-hard pool — only after the leveled ramp is cleared. */
export function ceilingPool(nodes: readonly ProbeNode[], field: Field): ProbeNode[] {
  return nodes.filter((n) => inField(n, field) && isCeilingNode(n));
}

/**
 * Where to begin the smattering: age as a first guess, nudged by self-rating, then a little
 * younger so the first cards still feel like a warm-up.
 */
export function startingLevel(age: number, confidence: Confidence, field: Field): number {
  const a = clampAge(age);
  const [floor] = LOW_BAND[field];
  const nudge = ([-3, -2, -1, 0, 1] as const)[confidence - 1];
  return Math.max(floor, Math.min(16, a + nudge - 1));
}

export function startState(field: Field, age: number, confidence: Confidence): PlacementState {
  const target = startingLevel(age, confidence, field);
  return {
    field,
    age: clampAge(age),
    confidence,
    phase: "smattering",
    probes: [],
    frontier: null,
    consecutiveHits: 0,
    consecutiveMisses: 0,
    targetLevel: target,
    frontierCount: 0,
  };
}

function recentBranches(state: PlacementState, n = 2): Set<string> {
  const out = new Set<string>();
  for (const p of state.probes.slice(-n)) out.add(branchOf(p.id));
  return out;
}

function pickOne<T>(items: T[], rng: Rng): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)] ?? null;
}

/**
 * Prefer a declared-level gate in-band, then anything in-band, rotating off recently used
 * branches when possible.
 */
export function pickInBand(
  pool: readonly ProbeNode[],
  exclude: Set<string>,
  target: number,
  avoidBranches: Set<string>,
  rng: Rng,
  width = 0.85,
): ProbeNode | null {
  const inBand = (w: number) =>
    pool.filter((n) => !exclude.has(n.id) && Math.abs(n.level - target) <= w);
  let band = inBand(width);
  if (band.length === 0) band = inBand(width + 0.7);
  if (band.length === 0) return null;
  const fresh = band.filter((n) => !avoidBranches.has(branchOf(n.id)));
  const pool2 = fresh.length ? fresh : band;
  const gates = pool2.filter((n) => n.declaredLevel != null);
  return pickOne(gates.length ? gates : pool2, rng);
}

function ascentStep(confidence: Confidence, consecutiveHits: number): number {
  const base = confidence <= 2 ? 1 : 2;
  return Math.min(3, base + (consecutiveHits >= 2 ? 1 : 0));
}

function useCeiling(state: PlacementState): boolean {
  const L = state.frontier ?? state.targetLevel;
  return L >= SCHOOL_MAX - 0.2;
}

export type PickResult = { done: true } | { id: string };

/**
 * Next concept to probe, or `{ done: true }`. `exclude` is probed ids plus harvest-failures
 * the page does not want to retry. `ceiling` is the ungated extra-hard pool.
 */
export function pickNext(
  state: PlacementState,
  pool: readonly ProbeNode[],
  exclude: Set<string>,
  rng: Rng = Math.random,
  ceiling: readonly ProbeNode[] = [],
): PickResult {
  if (state.phase === "done" || state.probes.length >= MAX_QUESTIONS) return { done: true };

  if (state.phase === "smattering") {
    const lo = Math.max(LOW_BAND[state.field][0], state.targetLevel - 2);
    const hi = state.targetLevel + 1.5;
    const used = new Set(state.probes.map((p) => branchOf(p.id)));
    const fresh = pool.filter(
      (n) => n.level >= lo && n.level <= hi && !exclude.has(n.id) && !used.has(branchOf(n.id)),
    );
    const fallback = pool.filter((n) => n.level >= lo && n.level <= hi + 1 && !exclude.has(n.id));
    const pick = pickInBand(fresh.length ? fresh : fallback, exclude, state.targetLevel, used, rng, 2);
    if (pick) return { id: pick.id };
    return pickNext({ ...state, phase: "ascent" }, pool, exclude, rng, ceiling);
  }

  if (state.phase === "ascent") {
    const pick = pickInBand(pool, exclude, state.targetLevel, recentBranches(state), rng);
    if (pick) return { id: pick.id };
    if (useCeiling(state) && ceiling.length) {
      const c = pickOne(ceiling.filter((n) => !exclude.has(n.id)), rng);
      if (c) return { id: c.id };
    }
    return pickNext(
      { ...state, phase: "frontier", frontier: state.targetLevel, frontierCount: 0 },
      pool,
      exclude,
      rng,
      ceiling,
    );
  }

  // frontier — broaden around L, and allow the ungated pool once the ramp is cleared.
  if (state.frontierCount >= MAX_FRONTIER) return { done: true };
  const L = state.frontier ?? state.targetLevel;
  const used = new Set(state.probes.map((p) => branchOf(p.id)));
  const band = pool.filter(
    (n) => !exclude.has(n.id) && n.level >= L - 3 && n.level <= L + 4 && !used.has(branchOf(n.id)),
  );
  const pick = pickInBand(
    band.length ? band : pool.filter((n) => !exclude.has(n.id) && Math.abs(n.level - L) <= 4),
    exclude,
    L,
    used,
    rng,
    4,
  );
  if (pick) return { id: pick.id };
  if (useCeiling(state)) {
    const c = pickOne(
      ceiling.filter((n) => !exclude.has(n.id) && !used.has(branchOf(n.id))),
      rng,
    );
    if (c) return { id: c.id };
  }
  return { done: true };
}

function bandStats(probes: Probe[], target: number, width = 1.5): { n: number; misses: number } {
  const band = probes.filter((p) => Math.abs(p.level - target) <= width);
  return { n: band.length, misses: band.filter((p) => !p.correct).length };
}

/** Fold one graded probe into the state (does not pick the next id). */
export function applyAnswer(state: PlacementState, id: string, level: number, correct: boolean): PlacementState {
  const next: PlacementState = {
    ...state,
    probes: [...state.probes, { id, level, correct }],
  };
  if (next.probes.length >= MAX_QUESTIONS) {
    next.phase = "done";
    if (next.frontier == null) next.frontier = estimateFrontier(next);
    return next;
  }

  if (state.phase === "smattering") {
    if (next.probes.length >= SMATTERING) {
      next.phase = "ascent";
      next.consecutiveHits = 0;
      next.consecutiveMisses = 0;
    }
    return next;
  }

  if (state.phase === "ascent") {
    if (correct) {
      next.consecutiveHits = state.consecutiveHits + 1;
      next.consecutiveMisses = 0;
      if (next.consecutiveHits >= 2) {
        next.targetLevel = Math.min(SCHOOL_MAX, state.targetLevel + ascentStep(state.confidence, next.consecutiveHits));
        next.consecutiveHits = 0;
      }
    } else {
      next.consecutiveHits = 0;
      next.consecutiveMisses = state.consecutiveMisses + 1;
      const { n, misses } = bandStats(next.probes, state.targetLevel);
      const drop = next.consecutiveMisses >= MISS_THRESHOLD || (n >= 3 && misses / n >= 0.5);
      if (drop) {
        next.phase = "frontier";
        next.frontier = Math.min(...next.probes.filter((p) => !p.correct).map((p) => p.level));
        next.frontierCount = 0;
      }
    }
    return next;
  }

  if (state.phase === "frontier") {
    next.frontierCount = state.frontierCount + 1;
    if (next.frontierCount >= MAX_FRONTIER) {
      next.phase = "done";
      next.frontier = estimateFrontier(next);
    }
    return next;
  }
  return next;
}

export function estimateFrontier(state: PlacementState): number {
  if (state.frontier != null) return state.frontier;
  const hits = state.probes.filter((p) => p.correct);
  if (hits.length === 0) return startingLevel(state.age, state.confidence, state.field);
  return Math.max(...hits.map((p) => p.level));
}

export function branchReport(probes: Probe[]): { status: BranchReport["status"]; strongTo: number | null } {
  if (probes.length === 0) return { status: "untested", strongTo: null };
  const hits = probes.filter((p) => p.correct);
  const misses = probes.filter((p) => !p.correct);
  const strongTo = hits.length
    ? Math.max(...hits.map((p) => p.level))
    : Math.max(SCHOOL_MIN, Math.min(...misses.map((p) => p.level)) - 1);
  if (misses.length === 0) return { status: "solid", strongTo };
  return { status: "shaky", strongTo };
}

/**
 * School-leaf course path: `{field}/courses/{primary|secondary}-school/{region}/{leaf}`.
 * Country hubs (`…/uk/uk`) return null.
 */
export function parseSchoolCourse(id: string): { field: string; stage: string; region: string; leaf: string } | null {
  const parts = id.split("/");
  if (parts.length !== 5) return null;
  const [field, courses, stage, region, leaf] = parts;
  if (courses !== "courses") return null;
  if (stage !== "primary-school" && stage !== "secondary-school") return null;
  if (!field || !region || !leaf || region === leaf) return null;
  return { field, stage, region, leaf };
}

/** Nominal first-encounter age encoded in a year/grade/phase leaf. Topic courses (`hs-*`, `ap-*`) return null. */
export function pathAltitude(leaf: string): number | null {
  if (leaf === "reception" || leaf === "kindergarten" || leaf === "foundation" || leaf === "grade-r") {
    return 5;
  }
  const year = /^year-(\d+)$/.exec(leaf);
  if (year) return Number(year[1]) + 5;
  const grade = /^grade-(\d+)$/.exec(leaf);
  if (grade) return Number(grade[1]) + 5;
  const gcse = /^gcse-year-(\d+)$/.exec(leaf);
  if (gcse) return Number(gcse[1]) + 5;
  const alevel = /^a-level-year-(\d+)$/.exec(leaf);
  if (alevel) return Number(alevel[1]) + 5;
  const myp = /^myp-year-(\d+)$/.exec(leaf);
  if (myp) return Number(myp[1]) + 10;
  const dp = /^dp-year-(\d+)$/.exec(leaf);
  if (dp) return Number(dp[1]) + 15;
  const phase = /^phase-(\d+)$/.exec(leaf);
  if (phase) {
    const p = Number(phase[1]);
    return p === 1 ? 5 : p === 2 ? 7 : p === 3 ? 9 : p === 4 ? 11 : null;
  }
  return null;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median altitude of a course's lesson members (skips nested courses and ungated nodes). */
export function typicalCourseLevel(course: ProbeNode, byId: Map<string, ProbeNode>): number | null {
  const members = (course.courseMembers ?? []).filter((id) => id !== course.id);
  const levels: number[] = [];
  for (const id of members) {
    const n = byId.get(id);
    if (!n || n.course) continue;
    if (n.level === 0 || n.levelGrounded === false) continue;
    levels.push(n.level);
  }
  return median(levels);
}

/** Half a year either side — typically one year/grade per curriculum, two when L sits between them. */
export const COURSE_MATCH_WIDTH = 0.6;
/** Topic courses (`hs-*`, `ap-*`) have noisier member-medians; keep a slightly wider band. */
export const TOPIC_MATCH_WIDTH = 0.75;
/** If a curriculum has nothing in-band, still offer its closest course within this gap. */
export const COURSE_FALLBACK_WIDTH = 2;

export const REGION_ORDER = ["uk", "us", "au", "ca", "za", "ib"] as const;

/**
 * Every school course (all countries / IB) whose nominal altitude sits at `L`.
 * Year/grade leaves use the path; topic courses (`hs-geometry`, `ap-physics-1`, …) use member median.
 * A curriculum with nothing in-band still contributes its closest year course.
 */
export function matchingCourses(
  field: Field,
  L: number,
  byId: Map<string, ProbeNode>,
  width = COURSE_MATCH_WIDTH,
): CourseMatch[] {
  type Cand = { id: string; region: string; altitude: number; kind: "year" | "topic" };
  const cands: Cand[] = [];
  for (const n of byId.values()) {
    if (!n.course) continue;
    const loc = parseSchoolCourse(n.id);
    if (!loc || loc.field !== field) continue;
    const fromPath = pathAltitude(loc.leaf);
    const altitude = fromPath ?? typicalCourseLevel(n, byId);
    if (altitude == null) continue;
    cands.push({
      id: n.id,
      region: loc.region,
      altitude,
      kind: fromPath != null ? "year" : "topic",
    });
  }
  const bandOf = (c: Cand) => (c.kind === "topic" ? Math.max(width, TOPIC_MATCH_WIDTH) : width);
  let inBand = cands.filter((c) => Math.abs(c.altitude - L) <= bandOf(c));
  // Below high-school age the US (and similar) still have a year/grade course; don't also
  // surface hs-* topic courses whose member-medians happen to sit nearby.
  if (L < 14) {
    const yearRegions = new Set(inBand.filter((c) => c.kind === "year").map((c) => c.region));
    inBand = inBand.filter((c) => c.kind !== "topic" || !yearRegions.has(c.region));
  }
  const have = new Set(inBand.map((c) => c.region));
  for (const region of new Set(cands.map((c) => c.region))) {
    if (have.has(region)) continue;
    const pool = cands.filter((c) => c.region === region);
    pool.sort(
      (a, b) => Math.abs(a.altitude - L) - Math.abs(b.altitude - L) || a.id.localeCompare(b.id),
    );
    const closest = pool[0];
    if (closest && Math.abs(closest.altitude - L) <= COURSE_FALLBACK_WIDTH) inBand.push(closest);
  }
  const regionRank = (r: string) => {
    const i = (REGION_ORDER as readonly string[]).indexOf(r);
    return i === -1 ? 99 : i;
  };
  inBand.sort(
    (a, b) =>
      regionRank(a.region) - regionRank(b.region) ||
      Math.abs(a.altitude - L) - Math.abs(b.altitude - L) ||
      a.id.localeCompare(b.id),
  );
  return inBand.map((c) => ({ id: c.id, region: c.region, typicalLevel: c.altitude }));
}

export function summarise(
  state: PlacementState,
  pool: readonly ProbeNode[],
  byId: Map<string, ProbeNode>,
  starsOf: (id: string) => number,
): PlacementSummary {
  const L = estimateFrontier(state);
  const probedByBranch = new Map<string, Probe[]>();
  for (const p of state.probes) {
    const b = branchOf(p.id);
    const list = probedByBranch.get(b) ?? [];
    list.push(p);
    probedByBranch.set(b, list);
  }
  const nearby = pool.filter((n) => n.level >= L - 3 && n.level <= L + 4);
  const nearbyBranches = [...new Set([...probedByBranch.keys(), ...nearby.map((n) => branchOf(n.id))])];
  const branches: BranchReport[] = nearbyBranches.map((branch) => {
    const { status, strongTo } = branchReport(probedByBranch.get(branch) ?? []);
    return { branch, status, strongTo };
  });
  branches.sort((a, b) => (a.strongTo ?? 99) - (b.strongTo ?? 99) || a.branch.localeCompare(b.branch));

  const probed = new Set(state.probes.map((p) => p.id));
  const weakest = branches.find((b) => b.status === "shaky") ?? branches.find((b) => b.status === "untested");
  const prereqsOk = (id: string) =>
    (byId.get(id)?.prerequisites ?? []).every((pre) => {
      const node = byId.get(pre);
      if (!node) return true;
      if (starsOf(pre) > 0) return true;
      return node.level < L - 0.5;
    });
  const missInWeakest = state.probes.filter((p) => !p.correct && (!weakest || branchOf(p.id) === weakest.branch)).map((p) => p.id);
  const nearbyWeak = nearby.filter(
    (n) => !probed.has(n.id) && starsOf(n.id) === 0 && prereqsOk(n.id) && (!weakest || branchOf(n.id) === weakest.branch),
  );
  const startHere: string[] = [];
  for (const id of [...missInWeakest, ...nearbyWeak.map((n) => n.id)]) {
    if (startHere.includes(id)) continue;
    startHere.push(id);
    if (startHere.length >= 3) break;
  }
  if (startHere.length < 3) {
    for (const n of nearby) {
      if (probed.has(n.id) || starsOf(n.id) > 0 || !prereqsOk(n.id) || startHere.includes(n.id)) continue;
      startHere.push(n.id);
      if (startHere.length >= 3) break;
    }
  }

  const courses = matchingCourses(state.field, L, byId);
  return { frontier: Math.round(L * 10) / 10, branches, startHere, courses };
}
