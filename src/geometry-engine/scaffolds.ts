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

import { equal, sumTo, rel, RULES } from "./rules.ts";
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
