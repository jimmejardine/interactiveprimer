/**
 * Parametric FIGURE constructors. Each scaffold takes a seeded `rng`, picks nice integer angle
 * parameters, and builds a concrete, consistent figure: named points with exact coordinates (for
 * rendering), the figure's angles each with its ground-truth integer value (for clean answers), and
 * the set of tagged linear relations (src/geometry-engine/rules.ts) that hold in it — the theorems an
 * angle-chase through this figure may use. Because the values come from integer parameters and the
 * coordinates realise them exactly, every figure is non-degenerate and self-consistent by
 * construction (a test asserts every emitted relation holds for the true values).
 *
 * v1 ships ANGLE scaffolds (the cleanest forward-chaining domain). Pure + DOM-free, unit-tested.
 * @module
 */

import { equal, sumTo, rel, ratioEq, pythagEq, RULES } from "./rules.ts";
import type { Relation, RuleId } from "./rules.ts";
import type { Rng } from "../rng.ts";

export type Vec = [number, number];

/** An angle at point `vertex`, between the rays toward points `from` and `to`, worth `value`°. */
export interface AngleSlot {
  key: string;
  vertex: string;
  from: string;
  to: string;
  value: number;
}

/**
 * `parallels` lists groups of mutually-parallel edges (by index into `edges`), so the
 * renderer can draw the "these are parallel" marks the chase relies on. `equals` is the
 * same shape for equal-length sides (tick marks: group 0 gets one hatch, group 1 two, …).
 */
export interface Figure {
  name: string;
  /** Theorem catalog keys this figure can exercise (used to auto-pick a scaffold). */
  uses: RuleId[];
  points: Record<string, Vec>;
  edges: Array<[string, string]>;
  parallels: number[][];
  /** Groups of equal-length edges (indices into `edges`). */
  equals?: number[][];
  /** Circles to draw (centre is a point name; radius from `through` or `r`). */
  circles?: Array<{ center: string; through?: string; r?: number }>;
  /** Named side lengths the chase can give / ask for. */
  lengths?: Array<{ key: string; from: string; to: string; value: number }>;
  /** Hidden constructions the learner may draw to unlock the figure. */
  aux?: Array<{ kind: "line"; through: [string, string]; hint: string }>;
  /** Right-angle squares to draw (not chaseable — the 90° is given by the mark). */
  rights?: Array<{ vertex: string; from: string; to: string }>;
  angles: AngleSlot[];
  relations: Relation[];
  boundingbox: [number, number, number, number];
}

const DEG = Math.PI / 180;

/**
 * Two parallel lines cut by a transversal — the canonical angle-chase figure. Eight angles (four at
 * each crossing), all equal to θ or 180−θ, related by vertical angles, angles on a line, corresponding,
 * alternate-interior and co-interior. θ is a nice non-right integer.
 */
export function parallelTransversal(rng: Rng): Figure {
  const theta = rng.pick([35, 40, 50, 55, 65, 70, 75]);
  const co = 180 - theta;
  const h = 2.6; // gap between the parallels
  const dx = h / Math.tan(theta * DEG); // horizontal run of the transversal across the gap
  const B: Vec = [-0.7, 0];
  const T: Vec = [B[0] + dx, h];
  const dir: Vec = [Math.cos(theta * DEG), Math.sin(theta * DEG)];
  const points: Record<string, Vec> = {
    BL: [-4.4, 0], BR: [4.4, 0],
    TL: [-4.4, h], TR: [4.4, h],
    B, T,
    Pbot: [B[0] - dir[0] * 1.7, B[1] - dir[1] * 1.7], // transversal stub below B
    Ptop: [T[0] + dir[0] * 1.7, T[1] + dir[1] * 1.7], // and above T
  };
  const edges: Array<[string, string]> = [["BL", "BR"], ["TL", "TR"], ["Pbot", "Ptop"]];

  // Angles by screen corner at each crossing. Rays: +x toward …R, −x toward …L, +transversal up,
  // −transversal down. ur/ll = θ; ul/lr = 180−θ.
  const angles: AngleSlot[] = [
    { key: "b_ur", vertex: "B", from: "BR", to: "T", value: theta },
    { key: "b_ul", vertex: "B", from: "T", to: "BL", value: co },
    { key: "b_ll", vertex: "B", from: "BL", to: "Pbot", value: theta },
    { key: "b_lr", vertex: "B", from: "Pbot", to: "BR", value: co },
    { key: "t_ur", vertex: "T", from: "TR", to: "Ptop", value: theta },
    { key: "t_ul", vertex: "T", from: "Ptop", to: "TL", value: co },
    { key: "t_ll", vertex: "T", from: "TL", to: "B", value: theta },
    { key: "t_lr", vertex: "T", from: "B", to: "TR", value: co },
  ];

  const relations = [
    // Vertical angles at each crossing.
    equal("b_ur", "b_ll", "vertical"),
    equal("b_ul", "b_lr", "vertical"),
    equal("t_ur", "t_ll", "vertical"),
    equal("t_ul", "t_lr", "vertical"),
    // Angles on a line (adjacent pairs sum to 180) at each crossing.
    sumTo(["b_ur", "b_ul"], 180, "linearPair"),
    sumTo(["b_ll", "b_lr"], 180, "linearPair"),
    sumTo(["t_ur", "t_ul"], 180, "linearPair"),
    sumTo(["t_ll", "t_lr"], 180, "linearPair"),
    // Corresponding angles (same corner at the two crossings) are equal.
    equal("b_ur", "t_ur", "corresponding"),
    equal("b_ul", "t_ul", "corresponding"),
    // Alternate interior angles (the "Z").
    equal("b_ur", "t_ll", "alternateInterior"),
    equal("b_ul", "t_lr", "alternateInterior"),
    // Co-interior (same-side interior) angles sum to 180.
    sumTo(["b_ur", "t_lr"], 180, "coInterior"),
    sumTo(["b_ul", "t_ll"], 180, "coInterior"),
  ];

  // The two horizontal lines (edges 0 and 1) are the parallel pair; the transversal (edge 2) is not.
  return {
    name: "parallelTransversal",
    uses: ["vertical", "linearPair", "corresponding", "alternateInterior", "coInterior"],
    points, edges, parallels: [[0, 1]], angles, relations, boundingbox: [-5, 4.2, 5, -2],
  };
}

/**
 * A plain triangle: two random base angles, the third by the angle sum. Coordinates realise the
 * angles exactly (apex = intersection of the two base rays). The only relation is the triangle sum.
 */
export function triangle(rng: Rng): Figure {
  let a, b, c;
  do {
    a = rng.int(40, 80);
    b = rng.int(40, 80);
    c = 180 - a - b;
  } while (c < 30 || c > 100);
  const L = 6;
  const ta = Math.tan(a * DEG);
  const tb = Math.tan(b * DEG);
  const cx = (L * tb) / (ta + tb);
  const cy = ta * cx;
  const points: Record<string, Vec> = { A: [-L / 2, 0], B: [L / 2, 0], C: [-L / 2 + cx, cy] };
  const edges: Array<[string, string]> = [["A", "B"], ["B", "C"], ["C", "A"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "B", to: "C", value: a },
    { key: "B", vertex: "B", from: "C", to: "A", value: b },
    { key: "C", vertex: "C", from: "A", to: "B", value: c },
  ];
  const relations = [sumTo(["A", "B", "C"], 180, "triangleSum")];
  return {
    name: "triangle",
    uses: ["triangleSum"],
    points, edges, parallels: [], angles, relations, boundingbox: [-4.5, cy + 1.2, 4.5, -1.5],
  };
}

/**
 * A triangle with a line through the apex PARALLEL to the base — the classic angle-sum proof figure.
 * The two base angles reappear at the apex as alternate interior angles, and the three angles along the
 * line through the apex sum to 180°, which is the triangle's angle sum. So a chase here mixes
 * alternate-interior angles, angles-on-a-line, AND the triangle sum.
 */
export function triangleParallelApex(rng: Rng): Figure {
  let alpha, beta, gamma;
  do {
    alpha = rng.int(40, 75);
    beta = rng.int(40, 75);
    gamma = 180 - alpha - beta;
  } while (gamma < 35 || gamma > 100);
  const Lbase = 6;
  const ta = Math.tan(alpha * DEG);
  const tb = Math.tan(beta * DEG);
  const cx = (Lbase * tb) / (ta + tb);
  const cy = ta * cx;
  const A: Vec = [-Lbase / 2, -1];
  const B: Vec = [Lbase / 2, -1];
  const C: Vec = [-Lbase / 2 + cx, -1 + cy];
  const points: Record<string, Vec> = {
    A, B, C,
    L: [C[0] - 2.6, C[1]], // the parallel line through the apex, drawn as a stub L—C—R
    R: [C[0] + 2.6, C[1]],
  };
  const edges: Array<[string, string]> = [["A", "B"], ["A", "C"], ["B", "C"], ["L", "R"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "B", to: "C", value: alpha }, // base angle at A
    { key: "B", vertex: "B", from: "C", to: "A", value: beta }, // base angle at B
    { key: "C", vertex: "C", from: "A", to: "B", value: gamma }, // apex angle
    { key: "LCA", vertex: "C", from: "L", to: "A", value: alpha }, // alternate interior to A
    { key: "RCB", vertex: "C", from: "B", to: "R", value: beta }, // alternate interior to B
  ];
  const relations = [
    equal("LCA", "A", "alternateInterior"),
    equal("RCB", "B", "alternateInterior"),
    sumTo(["LCA", "C", "RCB"], 180, "linearPair"), // the three angles on the line through C
    sumTo(["A", "B", "C"], 180, "triangleSum"),
  ];
  return {
    name: "triangleParallelApex",
    uses: ["alternateInterior", "linearPair", "triangleSum"],
    points, edges, parallels: [[0, 3]], angles, relations,
    boundingbox: [-5.4, C[1] + 0.9, 5.4, -1.9],
  };
}

/**
 * A triangle with one side EXTENDED, forming an exterior angle. The exterior angle equals the sum of
 * the two remote interior angles — and also makes a straight line with the adjacent interior angle —
 * so a chase here mixes the exterior-angle theorem, angles-on-a-line, and the triangle sum.
 */
export function triangleExterior(rng: Rng): Figure {
  let a, b, c;
  do {
    a = rng.int(40, 75);
    b = rng.int(40, 75);
    c = 180 - a - b;
  } while (c < 30 || c > 95);
  const Lbase = 4;
  const ta = Math.tan(a * DEG);
  const tb = Math.tan(b * DEG);
  const cx = (Lbase * tb) / (ta + tb);
  const cy = ta * cx;
  const A: Vec = [-2.4, -1];
  const B: Vec = [-2.4 + Lbase, -1];
  const C: Vec = [A[0] + cx, A[1] + cy];
  const D: Vec = [B[0] + 2, -1]; // base AB extended beyond B
  const points: Record<string, Vec> = { A, B, C, D };
  const edges: Array<[string, string]> = [["A", "B"], ["A", "C"], ["B", "C"], ["B", "D"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "B", to: "C", value: a },
    { key: "B", vertex: "B", from: "C", to: "A", value: b }, // interior angle at B
    { key: "C", vertex: "C", from: "A", to: "B", value: c },
    { key: "ext", vertex: "B", from: "D", to: "C", value: a + c }, // exterior angle at B
  ];
  const relations = [
    rel("exteriorAngle", [{ key: "ext", coef: 1 }, { key: "A", coef: -1 }, { key: "C", coef: -1 }], 0),
    sumTo(["B", "ext"], 180, "linearPair"), // exterior + adjacent interior on the straight line
    sumTo(["A", "B", "C"], 180, "triangleSum"),
  ];
  return {
    name: "triangleExterior",
    uses: ["exteriorAngle", "linearPair", "triangleSum"],
    points, edges, parallels: [], angles, relations, boundingbox: [-3.3, C[1] + 0.9, 4.4, -1.8],
  };
}

/**
 * Two straight lines crossing at a point — the canonical figure for vertically-opposite angles and
 * angles on a straight line. Four angles around the crossing: opposite pairs are equal (vertical
 * angles) and adjacent pairs sum to 180° (a straight line). θ is a nice non-right integer, so a chase
 * here mixes vertical angles and angles-on-a-line.
 */
export function crossingLines(rng: Rng): Figure {
  const theta = rng.pick([35, 40, 50, 55, 65, 70, 75, 80]);
  const co = 180 - theta;
  const r = 4;
  const c = Math.cos(theta * DEG), s = Math.sin(theta * DEG);
  const points: Record<string, Vec> = {
    O: [0, 0],
    Rp: [r, 0], Lp: [-r, 0], // the horizontal line
    Up: [r * c, r * s], Dn: [-r * c, -r * s], // the slanted line
  };
  const edges: Array<[string, string]> = [["Lp", "Rp"], ["Dn", "Up"]];
  // Angles around O, going anticlockwise from the +x ray. ur/ll = θ; ul/lr = 180−θ.
  const angles: AngleSlot[] = [
    { key: "ur", vertex: "O", from: "Rp", to: "Up", value: theta },
    { key: "ul", vertex: "O", from: "Up", to: "Lp", value: co },
    { key: "ll", vertex: "O", from: "Lp", to: "Dn", value: theta },
    { key: "lr", vertex: "O", from: "Dn", to: "Rp", value: co },
  ];
  const relations = [
    equal("ur", "ll", "vertical"),
    equal("ul", "lr", "vertical"),
    sumTo(["ur", "ul"], 180, "linearPair"),
    sumTo(["ul", "ll"], 180, "linearPair"),
    sumTo(["ll", "lr"], 180, "linearPair"),
    sumTo(["lr", "ur"], 180, "linearPair"),
    sumTo(["ur", "ul", "ll", "lr"], 360, "anglesAtPoint"),
  ];
  return {
    name: "crossingLines",
    uses: ["vertical", "linearPair", "anglesAtPoint"],
    points, edges, parallels: [], angles, relations, boundingbox: [-5, 3.6, 5, -3.6],
  };
}

/**
 * Isosceles triangle CAB = CB. Base angles at A and B are equal. Also emit `2·base + apex = 180`
 * so the chainer can solve "given the apex, find a base angle" (a lone triangle-sum would leave
 * two unknowns).
 */
export function isosceles(rng: Rng): Figure {
  const alpha = rng.int(40, 70);
  const apex = 180 - 2 * alpha;
  const half = 2.4;
  const h = half * Math.tan(alpha * DEG);
  const A: Vec = [-half, -1];
  const B: Vec = [half, -1];
  const C: Vec = [0, -1 + h];
  const points: Record<string, Vec> = { A, B, C };
  const edges: Array<[string, string]> = [["A", "B"], ["B", "C"], ["C", "A"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "B", to: "C", value: alpha },
    { key: "B", vertex: "B", from: "C", to: "A", value: alpha },
    { key: "C", vertex: "C", from: "A", to: "B", value: apex },
  ];
  const relations = [
    equal("A", "B", "isoscelesBase"),
    rel("isoscelesBase", [{ key: "A", coef: 2 }, { key: "C", coef: 1 }], 180),
    rel("isoscelesBase", [{ key: "B", coef: 2 }, { key: "C", coef: 1 }], 180),
    sumTo(["A", "B", "C"], 180, "triangleSum"),
  ];
  return {
    name: "isosceles",
    uses: ["isoscelesBase", "triangleSum"],
    points, edges, parallels: [],
    equals: [[1, 2]], // legs BC and CA
    angles, relations,
    boundingbox: [-3.6, C[1] + 0.9, 3.6, -1.9],
  };
}

/**
 * Equilateral triangle (all 60°) with side BC extended, so a chase can mix the equilateral fact
 * with a linear pair (the exterior is 120°).
 */
export function equilateral(rng: Rng): Figure {
  const side = 4;
  const h = side * Math.sqrt(3) / 2;
  const A: Vec = [-side / 2, -1];
  const B: Vec = [side / 2, -1];
  const C: Vec = [0, -1 + h];
  const D: Vec = [B[0] + 1.8, -1]; // BC is AB here — extend AB beyond B
  void rng; // figure is rigid; seed still varies via other scaffolds in a mixed pool
  const points: Record<string, Vec> = { A, B, C, D };
  const edges: Array<[string, string]> = [["A", "B"], ["B", "C"], ["C", "A"], ["B", "D"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "B", to: "C", value: 60 },
    { key: "B", vertex: "B", from: "C", to: "A", value: 60 },
    { key: "C", vertex: "C", from: "A", to: "B", value: 60 },
    { key: "ext", vertex: "B", from: "D", to: "C", value: 120 },
  ];
  const relations = [
    rel("equilateral", [{ key: "A", coef: 1 }], 60),
    rel("equilateral", [{ key: "B", coef: 1 }], 60),
    rel("equilateral", [{ key: "C", coef: 1 }], 60),
    sumTo(["A", "B", "C"], 180, "triangleSum"),
    sumTo(["B", "ext"], 180, "linearPair"),
  ];
  return {
    name: "equilateral",
    uses: ["equilateral", "triangleSum", "linearPair"],
    points, edges, parallels: [],
    equals: [[0, 1, 2]], // all three sides
    angles, relations,
    boundingbox: [-3.2, C[1] + 0.8, 4.6, -1.8],
  };
}

/** Third vertex of a triangle on the left of PQ, with the given integer angles at P and Q. */
function apexOn(P: Vec, Q: Vec, angP: number, angQ: number): Vec {
  const dx = Q[0] - P[0], dy = Q[1] - P[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const nx = -uy, ny = ux;
  const ta = Math.tan(angP * DEG);
  const tb = Math.tan(angQ * DEG);
  const along = (L * tb) / (ta + tb);
  const height = ta * along;
  return [P[0] + ux * along + nx * height, P[1] + uy * along + ny * height];
}

/**
 * A convex quadrilateral (two triangles on a diagonal) whose four interior angles sum to 360°.
 */
export function quadInterior(rng: Rng): Figure {
  // △ABD and △BCD share BD. Interiors at B and D are the sums of the two triangle angles there.
  let aA: number, aABD: number, aADB: number, aCBD: number, aC: number, aCDB: number;
  do {
    aA = rng.int(45, 80);
    aABD = rng.int(40, 70);
    aADB = 180 - aA - aABD;
    aC = rng.int(50, 90);
    aCBD = rng.int(35, 65);
    aCDB = 180 - aC - aCBD;
  } while (aADB < 35 || aCDB < 35 || aABD + aCBD > 150 || aADB + aCDB > 150);
  const Aang = aA;
  const Bang = aABD + aCBD;
  const Cang = aC;
  const Dang = aADB + aCDB;
  const A: Vec = [-2.6, -1.2];
  const B: Vec = [2.6, -1.2];
  const D = apexOn(A, B, aA, aABD);
  // C must sit on the OPPOSITE side of diagonal BD from A, or the quad folds and the
  // corners at B and D become tiny slivers (with a reflex wrap-around mark).
  const C = apexOn(D, B, aCDB, aCBD);
  const points: Record<string, Vec> = { A, B, C, D };
  const edges: Array<[string, string]> = [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "D", to: "B", value: Aang },
    { key: "B", vertex: "B", from: "A", to: "C", value: Bang },
    { key: "C", vertex: "C", from: "B", to: "D", value: Cang },
    { key: "D", vertex: "D", from: "C", to: "A", value: Dang },
  ];
  const relations = [sumTo(["A", "B", "C", "D"], 360, "polygonSum")];
  const xs = Object.values(points).map((p) => p[0]);
  const ys = Object.values(points).map((p) => p[1]);
  const pad = 1.2;
  return {
    name: "quadInterior",
    uses: ["polygonSum"],
    points, edges, parallels: [], angles, relations,
    boundingbox: [Math.min(...xs) - pad, Math.max(...ys) + pad, Math.max(...xs) + pad, Math.min(...ys) - pad],
  };
}

/**
 * A parallelogram: opposite angles equal, consecutive angles supplementary. One free parameter θ.
 */
export function parallelogram(rng: Rng): Figure {
  const theta = rng.pick([50, 55, 60, 65, 70, 75, 80]);
  const co = 180 - theta;
  const A: Vec = [-2.4, -1.3];
  const B: Vec = [1.8, -1.3];
  const L = 2.6;
  const D: Vec = [A[0] + L * Math.cos(theta * DEG), A[1] + L * Math.sin(theta * DEG)];
  const C: Vec = [B[0] + D[0] - A[0], B[1] + D[1] - A[1]];
  const points: Record<string, Vec> = { A, B, C, D };
  const edges: Array<[string, string]> = [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "B", to: "D", value: theta },
    { key: "B", vertex: "B", from: "C", to: "A", value: co },
    { key: "C", vertex: "C", from: "D", to: "B", value: theta },
    { key: "D", vertex: "D", from: "A", to: "C", value: co },
  ];
  const relations = [
    equal("A", "C", "parallelogramOpposite"),
    equal("B", "D", "parallelogramOpposite"),
    sumTo(["A", "B"], 180, "parallelogramConsecutive"),
    sumTo(["B", "C"], 180, "parallelogramConsecutive"),
    sumTo(["C", "D"], 180, "parallelogramConsecutive"),
    sumTo(["D", "A"], 180, "parallelogramConsecutive"),
  ];
  return {
    name: "parallelogram",
    uses: ["parallelogramOpposite", "parallelogramConsecutive"],
    points, edges, parallels: [[0, 2], [1, 3]], equals: [[0, 2], [1, 3]], angles, relations,
    boundingbox: [-3.4, C[1] + 0.9, C[0] + 1.1, -2.1],
  };
}

/**
 * Two adjacent centre-triangles of a regular pentagon. Central angles 72°, base angles 54°,
 * interior 108°. Mixes regular-polygon facts with isosceles / triangle sum.
 */
export function regularPentagon(rng: Rng): Figure {
  void rng;
  const R = 3;
  const ang = (k: number): Vec => {
    const t = (90 + 72 * k) * DEG;
    return [R * Math.cos(t), R * Math.sin(t)];
  };
  const O: Vec = [0, 0];
  const A = ang(0), B = ang(1), C = ang(2);
  const points: Record<string, Vec> = { O, A, B, C };
  const edges: Array<[string, string]> = [["O", "A"], ["O", "B"], ["O", "C"], ["A", "B"], ["B", "C"]];
  const angles: AngleSlot[] = [
    { key: "AOB", vertex: "O", from: "A", to: "B", value: 72 },
    { key: "BOC", vertex: "O", from: "B", to: "C", value: 72 },
    { key: "OAB", vertex: "A", from: "O", to: "B", value: 54 },
    { key: "OBA", vertex: "B", from: "O", to: "A", value: 54 },
    { key: "OBC", vertex: "B", from: "O", to: "C", value: 54 },
    { key: "OCB", vertex: "C", from: "O", to: "B", value: 54 },
    { key: "ABC", vertex: "B", from: "A", to: "C", value: 108 },
  ];
  const relations = [
    rel("regularCentre", [{ key: "AOB", coef: 1 }], 72),
    rel("regularCentre", [{ key: "BOC", coef: 1 }], 72),
    rel("regularInterior", [{ key: "ABC", coef: 1 }], 108),
    equal("OAB", "OBA", "isoscelesBase"),
    equal("OBC", "OCB", "isoscelesBase"),
    rel("isoscelesBase", [{ key: "OAB", coef: 2 }, { key: "AOB", coef: 1 }], 180),
    rel("isoscelesBase", [{ key: "OBC", coef: 2 }, { key: "BOC", coef: 1 }], 180),
    sumTo(["OAB", "OBA", "AOB"], 180, "triangleSum"),
    sumTo(["OBC", "OCB", "BOC"], 180, "triangleSum"),
    rel("regularInterior", [{ key: "ABC", coef: 1 }, { key: "OBA", coef: -1 }, { key: "OBC", coef: -1 }], 0),
  ];
  return {
    name: "regularPentagon",
    uses: ["regularCentre", "regularInterior", "isoscelesBase", "triangleSum"],
    points, edges, parallels: [],
    equals: [[0, 1, 2], [3, 4]], // radii; then the two pentagon sides
    angles, relations,
    boundingbox: [-3.6, 3.6, 3.6, -3.2],
  };
}

/**
 * A triangle with all three sides extended, forming three exterior angles. Those exteriors sum to
 * 360° (the polygon-exterior theorem) and each makes a linear pair with its interior.
 */
export function triangleExteriors(rng: Rng): Figure {
  let a: number, b: number, c: number;
  do {
    a = rng.int(40, 75);
    b = rng.int(40, 75);
    c = 180 - a - b;
  } while (c < 35 || c > 95);
  const Lbase = 4.2;
  const ta = Math.tan(a * DEG);
  const tb = Math.tan(b * DEG);
  const cx = (Lbase * tb) / (ta + tb);
  const cy = ta * cx;
  const A: Vec = [-2.2, -1];
  const B: Vec = [-2.2 + Lbase, -1];
  const C: Vec = [A[0] + cx, A[1] + cy];
  // Extend each side a little past the vertex.
  const ext = (P: Vec, Q: Vec, len: number): Vec => {
    const dx = Q[0] - P[0], dy = Q[1] - P[1];
    const m = Math.hypot(dx, dy) || 1;
    return [Q[0] + (dx / m) * len, Q[1] + (dy / m) * len];
  };
  const Ab = ext(C, A, 1.5); // beyond A along CA
  const Bc = ext(A, B, 1.5); // beyond B along AB
  const Ca = ext(B, C, 1.5); // beyond C along BC
  const points: Record<string, Vec> = { A, B, C, Ab, Bc, Ca };
  const edges: Array<[string, string]> = [["A", "B"], ["B", "C"], ["C", "A"], ["A", "Ab"], ["B", "Bc"], ["C", "Ca"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "B", to: "C", value: a },
    { key: "B", vertex: "B", from: "C", to: "A", value: b },
    { key: "C", vertex: "C", from: "A", to: "B", value: c },
    { key: "extA", vertex: "A", from: "Ab", to: "B", value: 180 - a },
    { key: "extB", vertex: "B", from: "Bc", to: "C", value: 180 - b },
    { key: "extC", vertex: "C", from: "Ca", to: "A", value: 180 - c },
  ];
  const relations = [
    sumTo(["A", "B", "C"], 180, "triangleSum"),
    sumTo(["A", "extA"], 180, "linearPair"),
    sumTo(["B", "extB"], 180, "linearPair"),
    sumTo(["C", "extC"], 180, "linearPair"),
    sumTo(["extA", "extB", "extC"], 360, "polygonExterior"),
  ];
  return {
    name: "triangleExteriors",
    uses: ["polygonExterior", "linearPair", "triangleSum"],
    points, edges, parallels: [], angles, relations,
    boundingbox: [-4.2, C[1] + 2.0, 4.6, -2.2],
  };
}

function onCircle(O: Vec, R: number, deg: number): Vec {
  return [O[0] + R * Math.cos(deg * DEG), O[1] + R * Math.sin(deg * DEG)];
}

/** Angle (degrees, 0–180) at V between points P and Q. */
function geomAngle(V: Vec, P: Vec, Q: Vec): number {
  const ax = P[0] - V[0], ay = P[1] - V[1];
  const bx = Q[0] - V[0], by = Q[1] - V[1];
  const cr = ax * by - ay * bx;
  const dt = ax * bx + ay * by;
  return Math.abs((Math.atan2(cr, dt) * 180) / Math.PI);
}

/**
 * Circle, centre O, chord AB seen from rim point P: ∠AOB = 2∠APB. Radii make △AOB isosceles.
 */
export function centreAndCircumference(rng: Rng): Figure {
  const theta = rng.pick([25, 30, 35, 40]);
  const R = 2.8;
  const O: Vec = [0, 0];
  const mid = 250;
  const A = onCircle(O, R, mid - theta);
  const B = onCircle(O, R, mid + theta);
  const P = onCircle(O, R, 90);
  const base = 90 - theta;
  const points: Record<string, Vec> = { O, A, B, P };
  const edges: Array<[string, string]> = [["O", "A"], ["O", "B"], ["A", "B"], ["P", "A"], ["P", "B"]];
  const angles: AngleSlot[] = [
    { key: "AOB", vertex: "O", from: "A", to: "B", value: 2 * theta },
    { key: "APB", vertex: "P", from: "A", to: "B", value: theta },
    { key: "OAB", vertex: "A", from: "O", to: "B", value: base },
    { key: "OBA", vertex: "B", from: "O", to: "A", value: base },
  ];
  const relations = [
    rel("angleAtCentre", [{ key: "AOB", coef: 1 }, { key: "APB", coef: -2 }], 0),
    equal("OAB", "OBA", "isoscelesBase"),
    rel("isoscelesBase", [{ key: "OAB", coef: 2 }, { key: "AOB", coef: 1 }], 180),
    sumTo(["OAB", "OBA", "AOB"], 180, "triangleSum"),
  ];
  return {
    name: "centreAndCircumference",
    uses: ["angleAtCentre", "isoscelesBase", "triangleSum"],
    points, edges, parallels: [], equals: [[0, 1]],
    circles: [{ center: "O", r: R }],
    angles, relations, boundingbox: [-3.6, 3.6, 3.6, -3.4],
  };
}

/** Diameter AB, P on the circle: ∠APB = 90°. */
export function semicircle(rng: Rng): Figure {
  const t = rng.pick([60, 70, 80, 100, 110, 120]);
  const R = 2.8;
  const O: Vec = [0, 0];
  const A: Vec = [-R, 0];
  const B: Vec = [R, 0];
  const P = onCircle(O, R, t);
  const angA = Math.round(t / 2);
  const angB = 90 - angA;
  const points: Record<string, Vec> = { O, A, B, P };
  const edges: Array<[string, string]> = [["A", "B"], ["A", "P"], ["B", "P"]];
  const angles: AngleSlot[] = [
    { key: "P", vertex: "P", from: "A", to: "B", value: 90 },
    { key: "A", vertex: "A", from: "P", to: "B", value: angA },
    { key: "B", vertex: "B", from: "P", to: "A", value: angB },
  ];
  const relations = [
    rel("angleInSemicircle", [{ key: "P", coef: 1 }], 90),
    sumTo(["A", "B", "P"], 180, "triangleSum"),
  ];
  return {
    name: "semicircle",
    uses: ["angleInSemicircle", "triangleSum"],
    points, edges, parallels: [],
    circles: [{ center: "O", r: R }],
    angles, relations, boundingbox: [-3.6, 3.4, 3.6, -1.4],
  };
}

/** Chord AB seen from two rim points P, Q on the same arc: ∠APB = ∠AQB. */
export function sameSegment(rng: Rng): Figure {
  const theta = rng.pick([25, 30, 35, 40]);
  const R = 2.8;
  const O: Vec = [0, 0];
  const A = onCircle(O, R, 210);
  const B = onCircle(O, R, 210 + 2 * theta);
  const P = onCircle(O, R, 80);
  const Q = onCircle(O, R, 130);
  const points: Record<string, Vec> = { O, A, B, P, Q };
  const edges: Array<[string, string]> = [["A", "B"], ["P", "A"], ["P", "B"], ["Q", "A"], ["Q", "B"]];
  const apb = Math.round(geomAngle(P, A, B));
  const aqb = Math.round(geomAngle(Q, A, B));
  // Force the theorem's equality (geometry is exact half-arc; rounding can drift 1°).
  const thetaUse = theta;
  const angles: AngleSlot[] = [
    { key: "APB", vertex: "P", from: "A", to: "B", value: thetaUse },
    { key: "AQB", vertex: "Q", from: "A", to: "B", value: thetaUse },
  ];
  void apb;
  void aqb;
  const relations = [equal("APB", "AQB", "sameSegment")];
  return {
    name: "sameSegment",
    uses: ["sameSegment"],
    points, edges, parallels: [],
    circles: [{ center: "O", r: R }],
    angles, relations, boundingbox: [-3.6, 3.6, 3.6, -3.4],
  };
}

/** Cyclic quadrilateral: opposite interiors sum to 180°. */
export function cyclicQuad(rng: Rng): Figure {
  const R = 2.8;
  const O: Vec = [0, 0];
  // Even arcs so opposite inscribed interiors (half the opposite arc) are integers.
  let w: number, x: number, y: number, z: number;
  do {
    w = rng.pick([60, 70, 80, 90]);
    x = rng.pick([70, 80, 90, 100]);
    y = rng.pick([80, 90, 100]);
    z = 360 - w - x - y;
  } while (z < 60 || z > 120);
  const degs = [0, w, w + x, w + x + y];
  const [A, B, C, D] = degs.map((d) => onCircle(O, R, d));
  const points: Record<string, Vec> = { O, A, B, C, D };
  const edges: Array<[string, string]> = [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"]];
  const a = (x + y) / 2;
  const b = (y + z) / 2;
  const c = (z + w) / 2;
  const d = (w + x) / 2;
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "D", to: "B", value: a },
    { key: "B", vertex: "B", from: "A", to: "C", value: b },
    { key: "C", vertex: "C", from: "B", to: "D", value: c },
    { key: "D", vertex: "D", from: "C", to: "A", value: d },
  ];
  const relations = [
    sumTo(["A", "C"], 180, "cyclicOpposite"),
    sumTo(["B", "D"], 180, "cyclicOpposite"),
    sumTo(["A", "B", "C", "D"], 360, "polygonSum"),
  ];
  return {
    name: "cyclicQuad",
    uses: ["cyclicOpposite", "polygonSum"],
    points, edges, parallels: [],
    circles: [{ center: "O", r: R }],
    angles, relations, boundingbox: [-3.6, 3.6, 3.6, -3.6],
  };
}

/**
 * Radius OT hidden as an auxiliary line; tangent through T. △OTA is right-angled at T.
 */
export function tangentRadius(rng: Rng): Figure {
  const beta = rng.pick([25, 30, 35, 40]); // angle at O
  const R = 2.6;
  const O: Vec = [0, 0];
  const T: Vec = [R, 0];
  const h = R * Math.tan(beta * DEG);
  const A: Vec = [R, h];
  const points: Record<string, Vec> = { O, T, A };
  const edges: Array<[string, string]> = [["T", "A"]]; // OT is aux — not drawn until constructed
  const angles: AngleSlot[] = [
    { key: "T", vertex: "T", from: "O", to: "A", value: 90 },
    { key: "O", vertex: "O", from: "T", to: "A", value: beta },
    { key: "A", vertex: "A", from: "T", to: "O", value: 90 - beta },
  ];
  const relations = [
    rel("tangentPerpRadius", [{ key: "T", coef: 1 }], 90),
    sumTo(["T", "O", "A"], 180, "triangleSum"),
  ];
  return {
    name: "tangentRadius",
    uses: ["tangentPerpRadius", "triangleSum"],
    points, edges, parallels: [],
    circles: [{ center: "O", r: R }],
    aux: [{ kind: "line", through: ["O", "T"], hint: "Try drawing the radius to the point of contact." }],
    angles, relations, boundingbox: [-3.2, Math.max(h, 1.2) + 1.2, 3.6, -3.2],
  };
}

/** Two tangents from an external point: right angles at the contacts, equal angles at E. */
export function twoTangents(rng: Rng): Figure {
  const beta = rng.pick([20, 25, 30]); // half-angle at E
  const R = 2.2;
  const OE = R / Math.sin(beta * DEG);
  const O: Vec = [0, 0];
  const E: Vec = [OE, 0];
  const S: Vec = [R * Math.sin(beta * DEG), R * Math.cos(beta * DEG)];
  const T: Vec = [R * Math.sin(beta * DEG), -R * Math.cos(beta * DEG)];
  const atO = 90 - beta;
  const points: Record<string, Vec> = { O, E, S, T };
  const edges: Array<[string, string]> = [["O", "S"], ["O", "T"], ["E", "S"], ["E", "T"], ["O", "E"]];
  const angles: AngleSlot[] = [
    { key: "S", vertex: "S", from: "O", to: "E", value: 90 },
    { key: "T", vertex: "T", from: "O", to: "E", value: 90 },
    { key: "OSE", vertex: "O", from: "S", to: "E", value: atO },
    { key: "OTE", vertex: "O", from: "T", to: "E", value: atO },
    { key: "SEO", vertex: "E", from: "S", to: "O", value: beta },
    { key: "TEO", vertex: "E", from: "T", to: "O", value: beta },
    { key: "SET", vertex: "E", from: "S", to: "T", value: 2 * beta },
  ];
  const se = Math.hypot(S[0] - E[0], S[1] - E[1]);
  const lengths = [
    { key: "ES", from: "E", to: "S", value: Math.round(se * 100) / 100 },
    { key: "ET", from: "E", to: "T", value: Math.round(se * 100) / 100 },
  ];
  const relations = [
    rel("tangentPerpRadius", [{ key: "S", coef: 1 }], 90),
    rel("tangentPerpRadius", [{ key: "T", coef: 1 }], 90),
    equal("SEO", "TEO", "twoTangents"),
    equal("ES", "ET", "twoTangents"),
    sumTo(["S", "OSE", "SEO"], 180, "triangleSum"),
    sumTo(["T", "OTE", "TEO"], 180, "triangleSum"),
    rel("twoTangents", [{ key: "SET", coef: 1 }, { key: "SEO", coef: -1 }, { key: "TEO", coef: -1 }], 0),
  ];
  return {
    name: "twoTangents",
    uses: ["tangentPerpRadius", "twoTangents", "triangleSum"],
    points, edges, parallels: [], equals: [[0, 1], [2, 3]],
    circles: [{ center: "O", r: R }],
    lengths, angles, relations,
    boundingbox: [-3.0, 3.4, OE + 1.0, -3.4],
  };
}

/** A 3-4-5 triangle and its 2× copy — AA plus corresponding-side ratios. */
export function similarPair(rng: Rng): Figure {
  const k = rng.pick([2, 3]);
  const a = 3, b = 4, c = 5;
  const scale = 0.45;
  const A: Vec = [-4.4, -1.4];
  const B: Vec = [A[0] + a * scale * k, A[1]];
  const C: Vec = [A[0], A[1] + b * scale * k];
  const D: Vec = [0.6, -1.4];
  const E: Vec = [D[0] + a * scale, D[1]];
  const F: Vec = [D[0], D[1] + b * scale];
  const points: Record<string, Vec> = { A, B, C, D, E, F };
  const edges: Array<[string, string]> = [["A", "B"], ["B", "C"], ["C", "A"], ["D", "E"], ["E", "F"], ["F", "D"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "B", to: "C", value: 90 },
    { key: "B", vertex: "B", from: "A", to: "C", value: Math.round((Math.atan(b / a) * 180) / Math.PI) },
    { key: "C", vertex: "C", from: "A", to: "B", value: Math.round((Math.atan(a / b) * 180) / Math.PI) },
    { key: "D", vertex: "D", from: "E", to: "F", value: 90 },
    { key: "E", vertex: "E", from: "D", to: "F", value: Math.round((Math.atan(b / a) * 180) / Math.PI) },
    { key: "F", vertex: "F", from: "D", to: "E", value: Math.round((Math.atan(a / b) * 180) / Math.PI) },
  ];
  // Snap C and F so A+B+C = 180 exactly after rounding.
  angles[2].value = 180 - angles[0].value - angles[1].value;
  angles[5].value = angles[2].value;
  const lengths = [
    { key: "AB", from: "A", to: "B", value: a * k },
    { key: "AC", from: "A", to: "C", value: b * k },
    { key: "BC", from: "B", to: "C", value: c * k },
    { key: "DE", from: "D", to: "E", value: a },
    { key: "DF", from: "D", to: "F", value: b },
    { key: "EF", from: "E", to: "F", value: c },
  ];
  const relations = [
    equal("A", "D", "similarAA"),
    equal("B", "E", "similarAA"),
    equal("C", "F", "similarAA"),
    ratioEq("AB", "DE", "AC", "DF", "similarSides"),
    ratioEq("AB", "DE", "BC", "EF", "similarSides"),
    ratioEq("AC", "DF", "BC", "EF", "similarSides"),
  ];
  return {
    name: "similarPair",
    uses: ["similarAA", "similarSides"],
    points, edges, parallels: [],
    lengths, angles, relations,
    boundingbox: [-5.2, C[1] + 0.8, E[0] + 1.2, -2.2],
  };
}

/** A right triangle with a Pythagorean-triple side chase. */
export function rightTriangle(rng: Rng): Figure {
  const [a, b, c] = rng.pick([[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [7, 24, 25], [9, 12, 15]]);
  const s = 4.2 / c;
  const Cpt: Vec = [-2.0, -1.3];
  const Apt: Vec = [Cpt[0] + a * s, Cpt[1]];
  const Bpt: Vec = [Cpt[0], Cpt[1] + b * s];
  const points: Record<string, Vec> = { C: Cpt, A: Apt, B: Bpt };
  const edges: Array<[string, string]> = [["C", "A"], ["C", "B"], ["A", "B"]];
  const angA = Math.round((Math.atan(b / a) * 180) / Math.PI);
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "C", to: "B", value: angA },
    { key: "B", vertex: "B", from: "C", to: "A", value: 90 - angA },
  ];
  const lengths = [
    { key: "a", from: "C", to: "A", value: a },
    { key: "b", from: "C", to: "B", value: b },
    { key: "c", from: "A", to: "B", value: c },
  ];
  const relations = [pythagEq("a", "b", "c", "pythagoras")];
  return {
    name: "rightTriangle",
    uses: ["pythagoras"],
    points, edges, parallels: [],
    rights: [{ vertex: "C", from: "A", to: "B" }],
    lengths, angles, relations,
    boundingbox: [-2.8, Bpt[1] + 0.9, Apt[0] + 0.9, -2.1],
  };
}

/**
 * Isosceles triangle standing on one of two parallels, apex on the other. Base angles reappear
 * at the apex as alternate interior angles, so a chase mixes isosceles, parallels, and the
 * triangle sum — not just one family.
 */
export function isoscelesOnParallels(rng: Rng): Figure {
  const alpha = rng.int(40, 70);
  const apex = 180 - 2 * alpha;
  const half = 2.6;
  const h = half * Math.tan(alpha * DEG);
  const A: Vec = [-half, -1];
  const B: Vec = [half, -1];
  const C: Vec = [0, -1 + h];
  const L: Vec = [C[0] - 3.0, C[1]];
  const R: Vec = [C[0] + 3.0, C[1]];
  const points: Record<string, Vec> = { A, B, C, L, R };
  const edges: Array<[string, string]> = [["A", "B"], ["A", "C"], ["B", "C"], ["L", "R"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "B", to: "C", value: alpha },
    { key: "B", vertex: "B", from: "C", to: "A", value: alpha },
    { key: "C", vertex: "C", from: "A", to: "B", value: apex },
    { key: "LCA", vertex: "C", from: "L", to: "A", value: alpha },
    { key: "RCB", vertex: "C", from: "B", to: "R", value: alpha },
    { key: "LCB", vertex: "C", from: "L", to: "B", value: 180 - alpha },
    { key: "RCA", vertex: "C", from: "R", to: "A", value: 180 - alpha },
  ];
  const relations = [
    // Produce the apex via the straight line at C (after the two alternate copies of
    // the base angles) so a chase has to use isosceles + parallels + a sum — not two
    // shortcuts that never mention the third family.
    equal("A", "B", "isoscelesBase"),
    equal("LCA", "A", "alternateInterior"),
    equal("RCB", "B", "alternateInterior"),
    sumTo(["A", "LCB"], 180, "coInterior"),
    sumTo(["B", "RCA"], 180, "coInterior"),
    sumTo(["LCA", "C", "RCB"], 180, "linearPair"),
    sumTo(["A", "B", "C"], 180, "triangleSum"),
    rel("isoscelesBase", [{ key: "A", coef: 2 }, { key: "C", coef: 1 }], 180),
    rel("isoscelesBase", [{ key: "B", coef: 2 }, { key: "C", coef: 1 }], 180),
  ];
  return {
    name: "isoscelesOnParallels",
    uses: ["isoscelesBase", "triangleSum", "alternateInterior", "coInterior", "linearPair"],
    points, edges, parallels: [[0, 3]],
    equals: [[1, 2]],
    angles, relations,
    boundingbox: [-5.2, C[1] + 0.9, 5.2, -1.9],
  };
}

/**
 * Two parallels cut by two transversals that cross between them. The lower and upper triangles
 * share a vertical angle at the crossing and matching corresponding angles — a chase has to
 * switch family (parallels ↔ triangle sum ↔ vertical).
 */
export function triangleBetweenParallels(rng: Rng): Figure {
  let alpha, beta, gamma;
  do {
    alpha = rng.int(40, 75);
    beta = rng.int(40, 75);
    gamma = 180 - alpha - beta;
  } while (gamma < 30 || gamma > 100);
  const h = 3.2;
  const xh = h / 2;
  const s = xh / Math.tan(alpha * DEG);
  const t = xh / Math.tan(beta * DEG);
  const B: Vec = [-s, 0];
  const C: Vec = [t, 0];
  const X: Vec = [0, xh];
  const T: Vec = [s, h];
  const U: Vec = [-t, h];
  const pad = Math.max(s, t) + 1.6;
  const points: Record<string, Vec> = {
    B, C, X, T, U,
    BL: [-pad, 0], BR: [pad, 0],
    TL: [-pad, h], TR: [pad, h],
  };
  const edges: Array<[string, string]> = [["BL", "BR"], ["TL", "TR"], ["B", "T"], ["C", "U"]];
  const angles: AngleSlot[] = [
    { key: "B", vertex: "B", from: "C", to: "X", value: alpha },
    { key: "C", vertex: "C", from: "X", to: "B", value: beta },
    { key: "Xbot", vertex: "X", from: "B", to: "C", value: gamma },
    { key: "T", vertex: "T", from: "U", to: "X", value: alpha },
    { key: "U", vertex: "U", from: "X", to: "T", value: beta },
    { key: "Xtop", vertex: "X", from: "T", to: "U", value: gamma },
  ];
  const relations = [
    equal("Xbot", "Xtop", "vertical"),
    equal("B", "T", "alternateInterior"),
    equal("C", "U", "alternateInterior"),
    sumTo(["B", "C", "Xbot"], 180, "triangleSum"),
    sumTo(["T", "U", "Xtop"], 180, "triangleSum"),
  ];
  return {
    name: "triangleBetweenParallels",
    uses: ["vertical", "alternateInterior", "triangleSum"],
    points, edges, parallels: [[0, 1]],
    angles, relations,
    boundingbox: [-pad - 0.4, h + 0.8, pad + 0.4, -0.8],
  };
}

/**
 * A right triangle with a line parallel to the hypotenuse, cutting the legs — nested similar
 * triangles (AA + side ratios) plus the triangle sum.
 */
export function nestedSimilar(rng: Rng): Figure {
  const k = rng.pick([2, 3]);
  const a = 3 * k, b = 4 * k, c = 5 * k;
  const s = 0.42;
  const A: Vec = [0, 0];
  const Bpt: Vec = [a * s, 0];
  const Cpt: Vec = [0, b * s];
  const D: Vec = [3 * s, 0];
  const E: Vec = [0, 4 * s];
  const points: Record<string, Vec> = { A, B: Bpt, C: Cpt, D, E };
  const edges: Array<[string, string]> = [["A", "B"], ["A", "C"], ["B", "C"], ["D", "E"]];
  const angB = Math.round((Math.atan(b / a) * 180) / Math.PI);
  const angC = 180 - 90 - angB;
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "B", to: "C", value: 90 },
    { key: "B", vertex: "B", from: "C", to: "A", value: angB },
    { key: "C", vertex: "C", from: "A", to: "B", value: angC },
    { key: "ADE", vertex: "D", from: "A", to: "E", value: angB },
    { key: "AED", vertex: "E", from: "D", to: "A", value: angC },
  ];
  const lengths = [
    { key: "AB", from: "A", to: "B", value: a },
    { key: "AC", from: "A", to: "C", value: b },
    { key: "BC", from: "B", to: "C", value: c },
    { key: "AD", from: "A", to: "D", value: 3 },
    { key: "AE", from: "A", to: "E", value: 4 },
    { key: "DE", from: "D", to: "E", value: 5 },
  ];
  const relations = [
    equal("B", "ADE", "similarAA"),
    equal("C", "AED", "similarAA"),
    equal("B", "ADE", "corresponding"),
    equal("C", "AED", "corresponding"),
    sumTo(["A", "B", "C"], 180, "triangleSum"),
    sumTo(["A", "ADE", "AED"], 180, "triangleSum"),
    ratioEq("AB", "AD", "AC", "AE", "similarSides"),
    ratioEq("AB", "AD", "BC", "DE", "similarSides"),
  ];
  return {
    name: "nestedSimilar",
    uses: ["similarAA", "similarSides", "corresponding", "triangleSum"],
    points, edges, parallels: [[2, 3]],
    lengths, angles, relations,
    boundingbox: [-1.2, Cpt[1] + 0.8, Bpt[0] + 0.9, -1.0],
  };
}

/**
 * Tangent at T, radius OT (hidden until drawn), external point A: right-angled at T, so
 * Pythagoras on the three sides. Mixes the tangent theorem with a length chase.
 */
export function tangentRightPythag(rng: Rng): Figure {
  const [a, b, c] = rng.pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]);
  const s = 3.4 / c;
  const O: Vec = [0, 0];
  const T: Vec = [b * s, 0];
  const Apt: Vec = [b * s, a * s];
  const points: Record<string, Vec> = { O, T, A: Apt };
  const edges: Array<[string, string]> = [["T", "A"], ["O", "A"]];
  const angO = Math.round((Math.atan(a / b) * 180) / Math.PI);
  const angles: AngleSlot[] = [
    { key: "T", vertex: "T", from: "O", to: "A", value: 90 },
    { key: "O", vertex: "O", from: "T", to: "A", value: angO },
    { key: "A", vertex: "A", from: "T", to: "O", value: 90 - angO },
  ];
  const lengths = [
    { key: "AT", from: "A", to: "T", value: a },
    { key: "OT", from: "O", to: "T", value: b },
    { key: "OA", from: "O", to: "A", value: c },
  ];
  const relations = [
    rel("tangentPerpRadius", [{ key: "T", coef: 1 }], 90),
    pythagEq("AT", "OT", "OA", "pythagoras"),
    sumTo(["T", "O", "A"], 180, "triangleSum"),
  ];
  return {
    name: "tangentRightPythag",
    uses: ["tangentPerpRadius", "pythagoras", "triangleSum"],
    points, edges, parallels: [],
    circles: [{ center: "O", r: b * s }],
    aux: [{ kind: "line", through: ["O", "T"], hint: "Try drawing the radius to the point of contact." }],
    rights: [{ vertex: "T", from: "O", to: "A" }],
    lengths, angles, relations,
    boundingbox: [-b * s - 0.8, a * s + 0.9, b * s + 1.2, -b * s - 0.8],
  };
}

/**
 * Chord AB seen from the centre and from two points on the same remaining arc. The centre
 * angle is twice each circumference angle, those two are equal (same segment), and the
 * radii make △AOB isosceles — a circle-theorem mix, not a lone inscribed-angle fact.
 */
export function chordTheorems(rng: Rng): Figure {
  const theta = rng.pick([25, 30, 35, 40]);
  const R = 2.8;
  const O: Vec = [0, 0];
  const mid = 250;
  const A = onCircle(O, R, mid - theta);
  const B = onCircle(O, R, mid + theta);
  const P = onCircle(O, R, 90);
  const Q = onCircle(O, R, 135);
  const base = 90 - theta;
  const points: Record<string, Vec> = { O, A, B, P, Q };
  const edges: Array<[string, string]> = [
    ["O", "A"], ["O", "B"], ["A", "B"], ["P", "A"], ["P", "B"], ["Q", "A"], ["Q", "B"],
  ];
  const angles: AngleSlot[] = [
    { key: "AOB", vertex: "O", from: "A", to: "B", value: 2 * theta },
    { key: "APB", vertex: "P", from: "A", to: "B", value: theta },
    { key: "AQB", vertex: "Q", from: "A", to: "B", value: theta },
    { key: "OAB", vertex: "A", from: "O", to: "B", value: base },
    { key: "OBA", vertex: "B", from: "O", to: "A", value: base },
  ];
  const relations = [
    rel("angleAtCentre", [{ key: "AOB", coef: 1 }, { key: "APB", coef: -2 }], 0),
    rel("angleAtCentre", [{ key: "AOB", coef: 1 }, { key: "AQB", coef: -2 }], 0),
    equal("APB", "AQB", "sameSegment"),
    equal("OAB", "OBA", "isoscelesBase"),
    rel("isoscelesBase", [{ key: "OAB", coef: 2 }, { key: "AOB", coef: 1 }], 180),
    sumTo(["OAB", "OBA", "AOB"], 180, "triangleSum"),
  ];
  return {
    name: "chordTheorems",
    uses: ["angleAtCentre", "sameSegment", "isoscelesBase", "triangleSum"],
    points, edges, parallels: [], equals: [[0, 1]],
    circles: [{ center: "O", r: R }],
    angles, relations, boundingbox: [-3.6, 3.6, 3.6, -3.4],
  };
}

/** Diameter AB + rim point P + radius OP: semicircle, isosceles radii, triangle sum. */
export function semicircleIso(rng: Rng): Figure {
  const t = rng.pick([60, 70, 80, 100, 110, 120]);
  const R = 2.8;
  const O: Vec = [0, 0];
  const A: Vec = [-R, 0];
  const B: Vec = [R, 0];
  const P = onCircle(O, R, t);
  const angA = Math.round(t / 2);
  const angB = 90 - angA;
  const points: Record<string, Vec> = { O, A, B, P };
  const edges: Array<[string, string]> = [["A", "B"], ["A", "P"], ["B", "P"], ["O", "P"], ["O", "A"], ["O", "B"]];
  const angles: AngleSlot[] = [
    { key: "P", vertex: "P", from: "A", to: "B", value: 90 },
    { key: "A", vertex: "A", from: "P", to: "B", value: angA },
    { key: "B", vertex: "B", from: "P", to: "A", value: angB },
    { key: "OPA", vertex: "P", from: "O", to: "A", value: angA },
    { key: "OPB", vertex: "P", from: "O", to: "B", value: angB },
    { key: "AOP", vertex: "O", from: "A", to: "P", value: 180 - 2 * angA },
  ];
  const relations = [
    rel("angleInSemicircle", [{ key: "P", coef: 1 }], 90),
    equal("A", "OPA", "isoscelesBase"),
    equal("B", "OPB", "isoscelesBase"),
    sumTo(["A", "B", "P"], 180, "triangleSum"),
    sumTo(["A", "OPA", "AOP"], 180, "triangleSum"),
    rel("isoscelesBase", [{ key: "A", coef: 2 }, { key: "AOP", coef: 1 }], 180),
  ];
  return {
    name: "semicircleIso",
    uses: ["angleInSemicircle", "isoscelesBase", "triangleSum"],
    points, edges, parallels: [],
    equals: [[3, 4, 5]],
    circles: [{ center: "O", r: R }],
    rights: [{ vertex: "P", from: "A", to: "B" }],
    angles, relations, boundingbox: [-3.6, 3.4, 3.6, -1.6],
  };
}

/** Cyclic quad plus triangle ABC on a diagonal — opposite angles and a triangle sum. */
export function cyclicWithTriangle(rng: Rng): Figure {
  const R = 2.8;
  const O: Vec = [0, 0];
  let w: number, x: number, y: number, z: number;
  do {
    w = rng.pick([60, 70, 80, 90]);
    x = rng.pick([70, 80, 90, 100]);
    y = rng.pick([80, 90, 100]);
    z = 360 - w - x - y;
  } while (z < 60 || z > 120);
  const degs = [0, w, w + x, w + x + y];
  const [A, B, C, D] = degs.map((d) => onCircle(O, R, d));
  const points: Record<string, Vec> = { O, A, B, C, D };
  const a = (x + y) / 2;
  const b = (y + z) / 2;
  const c = (z + w) / 2;
  const d = (w + x) / 2;
  const bac = Math.round(geomAngle(A, B, C));
  const bca = 180 - b - bac;
  const edges: Array<[string, string]> = [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"], ["A", "C"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "D", to: "B", value: a },
    { key: "B", vertex: "B", from: "A", to: "C", value: b },
    { key: "C", vertex: "C", from: "B", to: "D", value: c },
    { key: "D", vertex: "D", from: "C", to: "A", value: d },
    { key: "BAC", vertex: "A", from: "B", to: "C", value: bac },
    { key: "BCA", vertex: "C", from: "B", to: "A", value: bca },
  ];
  const relations = [
    sumTo(["A", "C"], 180, "cyclicOpposite"),
    sumTo(["B", "D"], 180, "cyclicOpposite"),
    sumTo(["BAC", "B", "BCA"], 180, "triangleSum"),
    sumTo(["A", "B", "C", "D"], 360, "polygonSum"),
  ];
  return {
    name: "cyclicWithTriangle",
    uses: ["cyclicOpposite", "triangleSum", "polygonSum"],
    points, edges, parallels: [],
    circles: [{ center: "O", r: R }],
    angles, relations, boundingbox: [-3.6, 3.6, 3.6, -3.6],
  };
}

/** Parallelogram with a diagonal: opposite/consecutive facts plus a triangle sum. */
export function parallelogramDiagonal(rng: Rng): Figure {
  const theta = rng.pick([50, 55, 60, 65, 70, 75, 80]);
  const co = 180 - theta;
  const A: Vec = [-2.4, -1.3];
  const B: Vec = [1.8, -1.3];
  const L = 2.6;
  const D: Vec = [A[0] + L * Math.cos(theta * DEG), A[1] + L * Math.sin(theta * DEG)];
  const C: Vec = [B[0] + D[0] - A[0], B[1] + D[1] - A[1]];
  const bac = Math.round(geomAngle(A, B, C));
  const bca = 180 - co - bac;
  const points: Record<string, Vec> = { A, B, C, D };
  const edges: Array<[string, string]> = [["A", "B"], ["B", "C"], ["C", "D"], ["D", "A"], ["A", "C"]];
  const angles: AngleSlot[] = [
    { key: "A", vertex: "A", from: "B", to: "D", value: theta },
    { key: "B", vertex: "B", from: "C", to: "A", value: co },
    { key: "C", vertex: "C", from: "D", to: "B", value: theta },
    { key: "D", vertex: "D", from: "A", to: "C", value: co },
    { key: "BAC", vertex: "A", from: "B", to: "C", value: bac },
    { key: "BCA", vertex: "C", from: "B", to: "A", value: bca },
  ];
  const relations = [
    equal("A", "C", "parallelogramOpposite"),
    equal("B", "D", "parallelogramOpposite"),
    sumTo(["A", "B"], 180, "parallelogramConsecutive"),
    sumTo(["B", "C"], 180, "parallelogramConsecutive"),
    sumTo(["BAC", "B", "BCA"], 180, "triangleSum"),
  ];
  return {
    name: "parallelogramDiagonal",
    uses: ["parallelogramOpposite", "parallelogramConsecutive", "triangleSum"],
    points, edges, parallels: [[0, 2], [1, 3]], equals: [[0, 2], [1, 3]],
    angles, relations,
    boundingbox: [-3.4, C[1] + 0.9, C[0] + 1.1, -2.1],
  };
}

/** A scaffold constructor plus the theorem keys it can exercise. */
export interface ScaffoldSpec {
  name: string;
  uses: RuleId[];
  make: (rng: Rng) => Figure;
}

/** All scaffolds, in a stable order. The generator auto-picks from this list. */
export const SCAFFOLD_LIST: ScaffoldSpec[] = [
  { name: "parallelTransversal", uses: ["vertical", "linearPair", "corresponding", "alternateInterior", "coInterior"], make: parallelTransversal },
  { name: "triangle", uses: ["triangleSum"], make: triangle },
  { name: "triangleParallelApex", uses: ["alternateInterior", "linearPair", "triangleSum"], make: triangleParallelApex },
  { name: "triangleExterior", uses: ["exteriorAngle", "linearPair", "triangleSum"], make: triangleExterior },
  { name: "crossingLines", uses: ["vertical", "linearPair", "anglesAtPoint"], make: crossingLines },
  { name: "isosceles", uses: ["isoscelesBase", "triangleSum"], make: isosceles },
  { name: "equilateral", uses: ["equilateral", "triangleSum", "linearPair"], make: equilateral },
  { name: "quadInterior", uses: ["polygonSum"], make: quadInterior },
  { name: "parallelogram", uses: ["parallelogramOpposite", "parallelogramConsecutive"], make: parallelogram },
  { name: "regularPentagon", uses: ["regularCentre", "regularInterior", "isoscelesBase", "triangleSum"], make: regularPentagon },
  { name: "triangleExteriors", uses: ["polygonExterior", "linearPair", "triangleSum"], make: triangleExteriors },
  { name: "centreAndCircumference", uses: ["angleAtCentre", "isoscelesBase", "triangleSum"], make: centreAndCircumference },
  { name: "semicircle", uses: ["angleInSemicircle", "triangleSum"], make: semicircle },
  { name: "sameSegment", uses: ["sameSegment"], make: sameSegment },
  { name: "cyclicQuad", uses: ["cyclicOpposite", "polygonSum"], make: cyclicQuad },
  { name: "tangentRadius", uses: ["tangentPerpRadius", "triangleSum"], make: tangentRadius },
  { name: "twoTangents", uses: ["tangentPerpRadius", "twoTangents", "triangleSum"], make: twoTangents },
  { name: "similarPair", uses: ["similarAA", "similarSides"], make: similarPair },
  { name: "rightTriangle", uses: ["pythagoras"], make: rightTriangle },
  { name: "isoscelesOnParallels", uses: ["isoscelesBase", "triangleSum", "alternateInterior", "coInterior", "linearPair"], make: isoscelesOnParallels },
  { name: "triangleBetweenParallels", uses: ["vertical", "alternateInterior", "triangleSum"], make: triangleBetweenParallels },
  { name: "nestedSimilar", uses: ["similarAA", "similarSides", "corresponding", "triangleSum"], make: nestedSimilar },
  { name: "tangentRightPythag", uses: ["tangentPerpRadius", "pythagoras", "triangleSum"], make: tangentRightPythag },
  { name: "chordTheorems", uses: ["angleAtCentre", "sameSegment", "isoscelesBase", "triangleSum"], make: chordTheorems },
  { name: "semicircleIso", uses: ["angleInSemicircle", "isoscelesBase", "triangleSum"], make: semicircleIso },
  { name: "cyclicWithTriangle", uses: ["cyclicOpposite", "triangleSum", "polygonSum"], make: cyclicWithTriangle },
  { name: "parallelogramDiagonal", uses: ["parallelogramOpposite", "parallelogramConsecutive", "triangleSum"], make: parallelogramDiagonal },
];

/** All scaffolds by name, for the generator to pick from. */
export const SCAFFOLDS: Record<string, (rng: Rng) => Figure> = Object.fromEntries(
  SCAFFOLD_LIST.map((s) => [s.name, s.make]),
);

/**
 * Scaffolds whose every `uses` rule is in `allowedConceptIds`, and that can fire every `require`
 * rule (when given). An empty allow-set matches nothing.
 */
export function selectScaffolds(
  allowedConceptIds: Set<string>,
  require: Iterable<string> = [],
): ScaffoldSpec[] {
  const need = [...require];
  return SCAFFOLD_LIST.filter((s) => {
    if (!s.uses.every((r) => allowedConceptIds.has(RULES[r].conceptId))) return false;
    return need.every((r) => s.uses.includes(r as RuleId));
  });
}

/** Vertices of a triangle (or right-angle mark) that has `from`–`to` as a side. */
function thirdVertices(fig: Figure, from: string, to: string): string[] {
  const found = new Set<string>();
  const consider = (a: string, b: string, c: string) => {
    const s = new Set([a, b, c]);
    if (s.has(from) && s.has(to) && s.size === 3) {
      for (const n of s) if (n !== from && n !== to) found.add(n);
    }
  };
  for (const ang of fig.angles) consider(ang.vertex, ang.from, ang.to);
  for (const rt of fig.rights ?? []) consider(rt.vertex, rt.from, rt.to);
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const [a, b] of fig.edges) { link(a, b); link(b, a); }
  for (const name of adj.get(from) ?? []) {
    if (name !== to && adj.get(to)?.has(name)) found.add(name);
  }
  return [...found];
}

/**
 * Midpoint of a named side, nudged perpendicularly *outwards* so a length label or fill-in box
 * sits off the stroke and off any tick / parallel marks. "Outwards" is away from the third
 * vertex of the triangle that owns the side — not "away from the nearest point on the board",
 * which on a two-figure page (similar pair, two tangents) can point *into* the triangle.
 */
export function lengthPos(fig: Figure, len: { from: string; to: string }, r = 0.42): Vec {
  const P = fig.points[len.from];
  const Q = fig.points[len.to];
  const mx = (P[0] + Q[0]) / 2;
  const my = (P[1] + Q[1]) / 2;
  const dx = Q[0] - P[0], dy = Q[1] - P[1];
  const m = Math.hypot(dx, dy) || 1;
  let nx = -dy / m, ny = dx / m;
  const sideOf = (R: Vec) => Math.sign(nx * (R[0] - mx) + ny * (R[1] - my));
  let vote = 0;
  for (const name of thirdVertices(fig, len.from, len.to)) {
    const R = fig.points[name];
    if (R) vote += sideOf(R);
  }
  if (vote === 0) {
    for (const [name, R] of Object.entries(fig.points)) {
      if (name === len.from || name === len.to) continue;
      vote += sideOf(R);
    }
  }
  if (vote > 0) { nx = -nx; ny = -ny; }
  return [mx + nx * r, my + ny * r];
}

/**
 * The point on an angle's bisector at distance `r` from its vertex — where a label/blank for that
 * angle should sit. Pure geometry over the figure's coordinates.
 */
export function anglePos(fig: Figure, ang: AngleSlot, r = 0.95): Vec {
  const V = fig.points[ang.vertex];
  const P1 = fig.points[ang.from];
  const P2 = fig.points[ang.to];
  const u = (P: Vec): Vec => {
    const dx = P[0] - V[0];
    const dy = P[1] - V[1];
    const m = Math.hypot(dx, dy) || 1;
    return [dx / m, dy / m];
  };
  const a = u(P1);
  const b = u(P2);
  let bx = a[0] + b[0];
  let by = a[1] + b[1];
  const m = Math.hypot(bx, by);
  if (m < 1e-9) {
    bx = -a[1];
    by = a[0];
  } else {
    bx /= m;
    by /= m;
  }
  return [V[0] + bx * r, V[1] + by * r];
}
