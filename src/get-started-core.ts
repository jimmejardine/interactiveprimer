/**
 * Pure placement scheduler for /get-started: filter the school-age pool in one field, run each of
 * the field's PRIMARY branches through its own smattering → ascent → frontier cycle on a shared
 * sub-budget (so a 25-question session maps BOTH how far a learner has climbed AND how wide that
 * knowledge spreads, instead of one global target level for the whole subject), and summarise a
 * per-branch frontier plus matching school courses. DOM-free so node:test can drive it.
 *
 * Level 0 / ungrounded concepts are a "beyond the ceiling" pool — mixed beginner stubs and
 * ungated advanced pages — and are only sampled after every branch has cleared the leveled ramp.
 *
 * Repeat-session memory: {@link priorFrontier} folds the learner's LIFETIME confidence history
 * (from every past /get-started run and ordinary lesson quiz) into a per-branch "already known to
 * about level X" map. {@link startState} takes that as `prior` and seeds each branch's starting
 * target just above what history says the learner has already cleared, so a second run explores
 * new ground instead of re-asking the same questions from scratch.
 * @module
 */

export type Field = "mathematics" | "physics" | "computer-science";
/** 1 = never studied … 5 = very confident. */
export type Confidence = 1 | 2 | 3 | 4 | 5;

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

/** One branch's own mini placement run, ticking through the same shape the old global state did. */
export interface BranchState {
  targetLevel: number;
  /** Frozen miss-altitude once ascent ends; null until then. */
  frontier: number | null;
  consecutiveHits: number;
  consecutiveMisses: number;
  probesUsed: number;
  frontierCount: number;
  subPhase: "ascent" | "frontier" | "done";
  /** This branch's own ascent budget (on top of which it can still broaden up to MAX_FRONTIER more
   *  once it reaches "frontier") — smaller for branches with strong prior history, see {@link
   *  branchBudget}. */
  budget: number;
}

export interface PlacementState {
  field: Field;
  age: number;
  confidence: Confidence;
  probes: Probe[];
  /** Primary branches for this session, largest pool first — fixed at start. */
  branchOrder: string[];
  branches: Record<string, BranchState>;
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

/** A lifetime confidence-store entry, trimmed to what {@link priorFrontier} needs. */
export interface HistoryEntry {
  id: string;
  stars: number;
}

export const MAX_QUESTIONS = 25;
export const MAX_FRONTIER = 8;
export const SCHOOL_MIN = 5;
export const SCHOOL_MAX = 18;
/** Rolling window: this many misses (or a ≤50% pass rate over ≥3) opens a branch's frontier. */
export const MISS_THRESHOLD = 2;
/** At most this many branches get their own tracked sub-budget; the rest fold into the ceiling
 *  pool's broadening once every primary branch is done. */
export const PRIMARY_BRANCH_CAP = 8;
/** Even split across many branches still gets each one at least this many questions. */
export const MIN_PER_BRANCH_BUDGET = 3;
/** Stars at/above this count as "the learner already knows this" when seeding a repeat session. */
export const PRIOR_KNOWN_STARS = 5;

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

/** Ungated extra-hard pool — only after every branch's leveled ramp is cleared. */
export function ceilingPool(nodes: readonly ProbeNode[], field: Field): ProbeNode[] {
  return nodes.filter((n) => inField(n, field) && isCeilingNode(n));
}

/**
 * This field's branches ranked by how many school-pool concepts they hold, largest first — the
 * ones substantial enough to deserve their own tracked climb. Ties break alphabetically so the
 * order (and therefore test expectations) is deterministic.
 *
 * When there are more substantial branches than `cap`, a `prior` map (see {@link priorFrontier})
 * rotates coverage across repeat sessions: branches with no prior entry yet (never explored to
 * even partial confidence) take priority over ones that already do, so a subject with more
 * branches than the cap doesn't probe the same largest-N branches forever while smaller ones never
 * get adaptive coverage. A first-ever session (empty `prior`) is unaffected — every branch ties on
 * "unseen" so pool size alone decides, same as before.
 */
export function primaryBranches(
  pool: readonly ProbeNode[],
  cap = PRIMARY_BRANCH_CAP,
  prior: Record<string, number> = {},
): string[] {
  const counts = new Map<string, number>();
  for (const n of pool) {
    const b = branchOf(n.id);
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const bySize = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (bySize.length <= cap) return bySize.map(([b]) => b);
  const unseen = bySize.filter(([b]) => prior[b] == null);
  const seen = bySize.filter(([b]) => prior[b] != null);
  return [...unseen, ...seen].slice(0, cap).map(([b]) => b);
}

/**
 * Fold lifetime confidence history into a per-branch seed level, used to start a repeat session
 * past ground already covered instead of from an age-only cold guess. A branch with a concept at
 * or above `PRIOR_KNOWN_STARS` is seeded from the highest such level (the learner has shown real
 * mastery there). A branch with only WEAKER touches (some stars, but none crossing the threshold)
 * still nudges the seed — scaled by how convincing the strongest partial touch is
 * (`stars / PRIOR_KNOWN_STARS`) — continuous with the "known" case at the threshold: a touch near 0
 * stars seeds just below the touched level (re-probe close by), a touch near `PRIOR_KNOWN_STARS`
 * stars seeds almost like a fully "known" skip-ahead. Concepts with no known level (not in `pool`,
 * e.g. from a different field or since retired) are ignored.
 */
export function priorFrontier(
  entries: readonly HistoryEntry[],
  pool: readonly ProbeNode[],
): Record<string, number> {
  const levelOf = new Map(pool.map((n) => [n.id, n.level]));
  const byBranch = new Map<string, { level: number; stars: number }[]>();
  for (const e of entries) {
    if (e.stars <= 0) continue;
    const level = levelOf.get(e.id);
    if (level == null) continue;
    const b = branchOf(e.id);
    const list = byBranch.get(b) ?? [];
    list.push({ level, stars: e.stars });
    byBranch.set(b, list);
  }
  const out: Record<string, number> = {};
  for (const [b, items] of byBranch) {
    const known = items.filter((i) => i.stars >= PRIOR_KNOWN_STARS);
    if (known.length) {
      out[b] = Math.max(...known.map((i) => i.level));
      continue;
    }
    const best = items.reduce((a, c) => (c.stars > a.stars ? c : a));
    const frac = Math.min(1, best.stars / PRIOR_KNOWN_STARS);
    out[b] = best.level - 1 + frac;
  }
  return out;
}

/**
 * Where to begin a branch's climb: age as a first guess, nudged by self-rating, then a little
 * younger so the first cards still feel like a warm-up. A branch with prior history (see
 * {@link priorFrontier}) starts just above what it already covers instead, in {@link startState}.
 */
export function startingLevel(age: number, confidence: Confidence, field: Field): number {
  const a = clampAge(age);
  const [floor] = LOW_BAND[field];
  const nudge = ([-3, -2, -1, 0, 1] as const)[confidence - 1];
  return Math.max(floor, Math.min(16, a + nudge - 1));
}

/**
 * A branch's own ascent budget: the even per-branch share, scaled down toward
 * `MIN_PER_BRANCH_BUDGET` the closer its prior seed sits to the school ceiling — a branch already
 * proven near the top only needs a light check-in, freeing the rest of the session's MAX_QUESTIONS
 * cap for branches with less (or no) history. No explicit redistribution is needed: `pickNext`'s
 * round-robin already hands off to the next branch once one finishes, and MAX_QUESTIONS is what
 * actually ends the session — shrinking a known branch's budget just means it finishes sooner.
 */
function branchBudget(field: Field, evenShare: number, prior?: number): number {
  if (prior == null) return evenShare;
  const [floor] = LOW_BAND[field];
  const coverage = Math.min(1, Math.max(0, (prior - floor) / (SCHOOL_MAX - floor)));
  const reduced = evenShare * (1 - coverage) + MIN_PER_BRANCH_BUDGET * coverage;
  return Math.max(MIN_PER_BRANCH_BUDGET, Math.round(reduced));
}

export function startState(
  field: Field,
  age: number,
  confidence: Confidence,
  pool: readonly ProbeNode[],
  prior: Record<string, number> = {},
): PlacementState {
  const base = startingLevel(age, confidence, field);
  const branchOrder = primaryBranches(pool, PRIMARY_BRANCH_CAP, prior);
  const evenShare = Math.max(
    MIN_PER_BRANCH_BUDGET,
    Math.floor(MAX_QUESTIONS / Math.max(1, branchOrder.length)),
  );
  const branches: Record<string, BranchState> = {};
  for (const b of branchOrder) {
    // Branches have very different natural ranges (arithmetic tops out young; calculus starts
    // old) and can be sparse/bimodal (a small gap in the middle with nothing near the shared
    // age/confidence guess) — snap to the branch's OWN nearest real concept level, not just a
    // clamped range, so the very first probe is always guaranteed to land exactly on something.
    const branchLevels = pool.filter((n) => branchOf(n.id) === b).map((n) => n.level);
    const nearestLevel = branchLevels.reduce((closest, lvl) =>
      Math.abs(lvl - base) < Math.abs(closest - base) ? lvl : closest,
    );
    const seed = prior[b];
    branches[b] = {
      // A branch with established history starts just above its known ceiling, not from scratch.
      targetLevel: seed != null ? Math.min(SCHOOL_MAX, Math.round(seed) + 1) : nearestLevel,
      budget: branchBudget(field, evenShare, seed),
      frontier: null,
      consecutiveHits: 0,
      consecutiveMisses: 0,
      probesUsed: 0,
      frontierCount: 0,
      subPhase: "ascent",
    };
  }
  return { field, age: clampAge(age), confidence, probes: [], branchOrder, branches };
}

function pickOne<T>(items: T[], rng: Rng): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)] ?? null;
}

/**
 * Prefer a declared-level gate in-band, then anything in-band. `avoidBranches` still lets a
 * caller rotate away from a branch when it hands in a mixed-branch pool (e.g. the ceiling pool);
 * within one branch's own pool it's normally passed empty. `weightOf` biases the draw — used to
 * favour concepts with no confidence history over ones already well-established from a past
 * session, mirroring course-quiz's inverse-star sampler (default: every candidate weighs the same).
 */
export function pickInBand(
  pool: readonly ProbeNode[],
  exclude: Set<string>,
  target: number,
  avoidBranches: Set<string>,
  rng: Rng,
  width = 0.85,
  weightOf: (id: string) => number = () => 1,
): ProbeNode | null {
  const inBand = (w: number) =>
    pool.filter((n) => !exclude.has(n.id) && Math.abs(n.level - target) <= w);
  let band = inBand(width);
  if (band.length === 0) band = inBand(width + 0.7);
  if (band.length === 0) return null;
  const fresh = band.filter((n) => !avoidBranches.has(branchOf(n.id)));
  const pool2 = fresh.length ? fresh : band;
  const gates = pool2.filter((n) => n.declaredLevel != null);
  const candidates = gates.length ? gates : pool2;
  const weights = candidates.map((n) => Math.max(0.0001, weightOf(n.id)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1] ?? null;
}

function ascentStep(confidence: Confidence, consecutiveHits: number): number {
  const base = confidence <= 2 ? 1 : 2;
  return Math.min(3, base + (consecutiveHits >= 2 ? 1 : 0));
}

/** Every primary branch has cleared the top of the school ramp — time to reach for the ceiling pool. */
function useCeiling(state: PlacementState): boolean {
  return state.branchOrder.every((b) => {
    const bs = state.branches[b]!;
    const L = bs.frontier ?? bs.targetLevel;
    return L >= SCHOOL_MAX - 0.2;
  });
}

/** The first branch still in play, in `branchOrder`. Null once every branch is done. */
function currentBranch(state: PlacementState): string | null {
  for (const b of state.branchOrder) if (state.branches[b]!.subPhase !== "done") return b;
  return null;
}

export type PickResult = { done: true } | { id: string };

/** The first branch that hasn't been probed at all yet — breadth takes priority over depth. */
function unseededBranch(state: PlacementState): string | null {
  for (const b of state.branchOrder) {
    const bs = state.branches[b]!;
    if (bs.subPhase !== "done" && bs.probesUsed === 0) return b;
  }
  return null;
}

/**
 * Next concept to probe, or `{ done: true }`. BREADTH FIRST: every branch gets one probe before
 * any branch gets a second (the "smattering" the whole subject gets up front). Once every branch
 * has at least one probe, round-robins through `branchOrder` in order — each branch spends the
 * rest of its own sub-budget climbing (ascent) then broadening around a found frontier, before
 * handing off to the next branch once its budget runs out; only once every branch is done does the
 * ungated ceiling pool open up. `exclude` is probed ids plus harvest-failures the caller does not
 * want to retry.
 */
export function pickNext(
  state: PlacementState,
  pool: readonly ProbeNode[],
  exclude: Set<string>,
  rng: Rng = Math.random,
  ceiling: readonly ProbeNode[] = [],
  weightOf: (id: string) => number = () => 1,
): PickResult {
  if (state.probes.length >= MAX_QUESTIONS) return { done: true };

  const branch = unseededBranch(state) ?? currentBranch(state);
  if (!branch) {
    if (useCeiling(state) && ceiling.length) {
      const c = pickOne(ceiling.filter((n) => !exclude.has(n.id)), rng);
      if (c) return { id: c.id };
    }
    return { done: true };
  }

  const bs = state.branches[branch]!;
  const branchPool = pool.filter((n) => branchOf(n.id) === branch);
  const inFrontier = bs.subPhase === "frontier";
  const target = inFrontier ? bs.frontier ?? bs.targetLevel : bs.targetLevel;
  // Wide on the branch's very first probe (a fresh look), tight while climbing, wide again once
  // broadening around a found frontier.
  const width = inFrontier ? 4 : bs.probesUsed === 0 ? 2 : 0.85;
  const pick = pickInBand(branchPool, exclude, target, new Set(), rng, width, weightOf);
  if (pick) return { id: pick.id };

  // Nothing left to ask in this branch right now (band exhausted or excluded out) — retire it and
  // move on to the next branch in this same call, so a thin branch never stalls the session.
  const branches = { ...state.branches, [branch]: { ...bs, subPhase: "done" as const } };
  return pickNext({ ...state, branches }, pool, exclude, rng, ceiling, weightOf);
}

function bandStats(probes: Probe[], target: number, width = 1.5): { n: number; misses: number } {
  const band = probes.filter((p) => Math.abs(p.level - target) <= width);
  return { n: band.length, misses: band.filter((p) => !p.correct).length };
}

function estimateBranchFrontier(bs: BranchState, branchProbes: Probe[], state: PlacementState): number {
  if (bs.frontier != null) return bs.frontier;
  const hits = branchProbes.filter((p) => p.correct);
  if (hits.length === 0) return startingLevel(state.age, state.confidence, state.field);
  return Math.max(...hits.map((p) => p.level));
}

/** Fold one graded probe into the state (does not pick the next id). */
export function applyAnswer(state: PlacementState, id: string, level: number, correct: boolean): PlacementState {
  const probes: Probe[] = [...state.probes, { id, level, correct }];
  const branch = branchOf(id);
  const bsOld = state.branches[branch];
  // A probe outside any tracked branch (shouldn't normally happen — pickNext only hands out ids
  // from branchOrder's own pools plus the ceiling pool) still gets recorded, just with no branch
  // bookkeeping to update.
  if (!bsOld) return { ...state, probes };

  let bs: BranchState = { ...bsOld, probesUsed: bsOld.probesUsed + 1 };
  const branchProbes = probes.filter((p) => branchOf(p.id) === branch);

  if (bs.subPhase === "ascent") {
    if (correct) {
      bs.consecutiveHits += 1;
      bs.consecutiveMisses = 0;
      if (bs.consecutiveHits >= 2) {
        bs.targetLevel = Math.min(SCHOOL_MAX, bs.targetLevel + ascentStep(state.confidence, bs.consecutiveHits));
        bs.consecutiveHits = 0;
      }
    } else {
      bs.consecutiveHits = 0;
      bs.consecutiveMisses += 1;
      const { n, misses } = bandStats(branchProbes, bs.targetLevel);
      const drop = bs.consecutiveMisses >= MISS_THRESHOLD || (n >= 3 && misses / n >= 0.5);
      if (drop) {
        bs.subPhase = "frontier";
        bs.frontier = Math.min(...branchProbes.filter((p) => !p.correct).map((p) => p.level));
        bs.frontierCount = 0;
      }
    }
    if (bs.subPhase === "ascent" && bs.probesUsed >= bs.budget) {
      bs.subPhase = "done";
      bs.frontier = estimateBranchFrontier(bs, branchProbes, state);
    }
  } else if (bs.subPhase === "frontier") {
    bs.frontierCount += 1;
    if (bs.frontierCount >= MAX_FRONTIER || bs.probesUsed >= bs.budget + MAX_FRONTIER) {
      bs.subPhase = "done";
    }
  }

  return { ...state, probes, branches: { ...state.branches, [branch]: bs } };
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The session's overall altitude: the median across every tracked branch's own frontier (falls
 *  back to the age/confidence starting guess when nothing was probed at all). */
export function estimateFrontier(state: PlacementState): number {
  const vals: number[] = [];
  for (const b of state.branchOrder) {
    const bs = state.branches[b]!;
    const branchProbes = state.probes.filter((p) => branchOf(p.id) === b);
    if (branchProbes.length === 0 && bs.frontier == null) continue;
    vals.push(bs.frontier ?? estimateBranchFrontier(bs, branchProbes, state));
  }
  if (vals.length === 0) return startingLevel(state.age, state.confidence, state.field);
  return median(vals) ?? vals[0]!;
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
