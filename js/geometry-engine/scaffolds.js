// @ts-check
/**
 * Parametric FIGURE constructors. Each scaffold takes a seeded `rng`, picks nice integer angle
 * parameters, and builds a concrete, consistent figure: named points with exact coordinates (for
 * rendering), the figure's angles each with its ground-truth integer value (for clean answers), and
 * the set of tagged linear relations (js/geometry-engine/rules.js) that hold in it — the theorems an
 * angle-chase through this figure may use. Because the values come from integer parameters and the
 * coordinates realise them exactly, every figure is non-degenerate and self-consistent by
 * construction (a test asserts every emitted relation holds for the true values).
 *
 * v1 ships ANGLE scaffolds (the cleanest forward-chaining domain). Pure + DOM-free, unit-tested.
 * @module
 */

import { equal, sumTo } from "./rules.js";

/**
 * @typedef {[number, number]} Vec
 * @typedef {{ key: string, vertex: string, from: string, to: string, value: number }} AngleSlot
 *   An angle at point `vertex`, between the rays toward points `from` and `to`, worth `value`°.
 * @typedef {{
 *   name: string,
 *   points: Record<string, Vec>,
 *   edges: Array<[string, string]>,
 *   angles: AngleSlot[],
 *   relations: import("./rules.js").Relation[],
 *   boundingbox: [number, number, number, number],
 * }} Figure
 */

const DEG = Math.PI / 180;

/**
 * Two parallel lines cut by a transversal — the canonical angle-chase figure. Eight angles (four at
 * each crossing), all equal to θ or 180−θ, related by vertical angles, angles on a line, corresponding,
 * alternate-interior and co-interior. θ is a nice non-right integer.
 * @param {import("../rng.js").Rng} rng
 * @returns {Figure}
 */
export function parallelTransversal(rng) {
  const theta = rng.pick([35, 40, 50, 55, 65, 70, 75]);
  const co = 180 - theta;
  const h = 2.6; // gap between the parallels
  const dx = h / Math.tan(theta * DEG); // horizontal run of the transversal across the gap
  const B = /** @type {Vec} */ ([-0.7, 0]);
  const T = /** @type {Vec} */ ([B[0] + dx, h]);
  const dir = /** @type {Vec} */ ([Math.cos(theta * DEG), Math.sin(theta * DEG)]);
  /** @type {Record<string, Vec>} */
  const points = {
    BL: [-4.4, 0], BR: [4.4, 0],
    TL: [-4.4, h], TR: [4.4, h],
    B, T,
    Pbot: [B[0] - dir[0] * 1.7, B[1] - dir[1] * 1.7], // transversal stub below B
    Ptop: [T[0] + dir[0] * 1.7, T[1] + dir[1] * 1.7], // and above T
  };
  /** @type {Array<[string, string]>} */
  const edges = [["BL", "BR"], ["TL", "TR"], ["Pbot", "Ptop"]];

  // Angles by screen corner at each crossing. Rays: +x toward …R, −x toward …L, +transversal up,
  // −transversal down. ur/ll = θ; ul/lr = 180−θ.
  /** @type {AngleSlot[]} */
  const angles = [
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

  return { name: "parallelTransversal", points, edges, angles, relations, boundingbox: [-5, 4.2, 5, -2] };
}

/**
 * A plain triangle: two random base angles, the third by the angle sum. Coordinates realise the
 * angles exactly (apex = intersection of the two base rays). The only relation is the triangle sum.
 * @param {import("../rng.js").Rng} rng
 * @returns {Figure}
 */
export function triangle(rng) {
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
  /** @type {Record<string, Vec>} */
  const points = { A: [-L / 2, 0], B: [L / 2, 0], C: [-L / 2 + cx, cy] };
  /** @type {Array<[string, string]>} */
  const edges = [["A", "B"], ["B", "C"], ["C", "A"]];
  /** @type {AngleSlot[]} */
  const angles = [
    { key: "A", vertex: "A", from: "B", to: "C", value: a },
    { key: "B", vertex: "B", from: "C", to: "A", value: b },
    { key: "C", vertex: "C", from: "A", to: "B", value: c },
  ];
  const relations = [sumTo(["A", "B", "C"], 180, "triangleSum")];
  return { name: "triangle", points, edges, angles, relations, boundingbox: [-4.5, cy + 1.2, 4.5, -1.5] };
}

/** All scaffolds by name, for the generator to pick from. */
export const SCAFFOLDS = { parallelTransversal, triangle };

/**
 * The point on an angle's bisector at distance `r` from its vertex — where a label/blank for that
 * angle should sit. Pure geometry over the figure's coordinates.
 * @param {Figure} fig @param {AngleSlot} ang @param {number} [r]
 * @returns {Vec}
 */
export function anglePos(fig, ang, r = 0.95) {
  const V = fig.points[ang.vertex];
  const P1 = fig.points[ang.from];
  const P2 = fig.points[ang.to];
  /** @param {Vec} P @returns {Vec} */
  const u = (P) => {
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
