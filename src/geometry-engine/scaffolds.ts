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

import { equal, sumTo, rel } from "./rules.ts";
import type { Relation } from "./rules.ts";
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
 * renderer can draw the "these are parallel" marks the chase relies on.
 */
export interface Figure {
  name: string;
  points: Record<string, Vec>;
  edges: Array<[string, string]>;
  parallels: number[][];
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
  return { name: "parallelTransversal", points, edges, parallels: [[0, 1]], angles, relations, boundingbox: [-5, 4.2, 5, -2] };
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
  return { name: "triangle", points, edges, parallels: [], angles, relations, boundingbox: [-4.5, cy + 1.2, 4.5, -1.5] };
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
    name: "triangleParallelApex", points, edges, parallels: [[0, 3]], angles, relations,
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
  return { name: "triangleExterior", points, edges, parallels: [], angles, relations, boundingbox: [-3.3, C[1] + 0.9, 4.4, -1.8] };
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
  ];
  return { name: "crossingLines", points, edges, parallels: [], angles, relations, boundingbox: [-5, 3.6, 5, -3.6] };
}

/** All scaffolds by name, for the generator to pick from. */
export const SCAFFOLDS = { parallelTransversal, triangle, triangleParallelApex, triangleExterior, crossingLines };

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
