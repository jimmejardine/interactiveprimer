/**
 * Board-bound drawing TOOLS handed to a geometry builder in its toolkit (see
 * js/components/primer-geometry.js). They bake away two patterns that recur across geometry figures:
 *
 *   - `parallelMark(x, y, opts)` — the "these lines are parallel" arrowhead/chevron marks.
 *   - `crossing(vertex, dirA, dirB)` — the four angles where two lines cross: number them and/or fill
 *     (highlight) any of them, addressed by screen corner ("ul"/"ur"/"ll"/"lr").
 *
 * The geometry MATH lives in js/geometry.js (pure, unit-tested); this module just binds it to a board
 * and `themeColors()` so a builder calls `parallelMark(…)` / `crossing(…)` without threading `board`.
 * @module
 */

import { chevronArrowheads, quadrantWedges, tickSegments, angleArcSpec } from "./geometry.ts";
import { drawAxes } from "./graph-axes.ts";
import type { AxesOptions } from "./graph-axes.ts";

export type Vec = [number, number];

/**
 * Build the tools bound to `board` + the resolved theme `colors`.
 * @param board  A JSXGraph board.
 */
export function makeGeometryTools(board: any, colors: { bg: string; ink: string; line: string; cat: string[] }) {
  /** @param p  Coordinates, each a value or a live getter. */
  const ipt = (p: Array<number | (() => number)>) =>
    board.create("point", p, { visible: false, withLabel: false, name: "" });

  /**
   * Draw `count` small parallel-mark arrowheads centred on `(x, y)`, in the line's colour. `dir` is
   * "h"/"v" (horizontal/vertical line); pass `along: [ux, uy]` for a slanted line. Use `count: 2` for a
   * second, distinct pair of parallels in the same figure.
   */
  const parallelMark = (
    x: number,
    y: number,
    { dir = "h", along, count = 1, color }: { dir?: "h" | "v"; along?: Vec; count?: number; color?: string } = {},
  ): any[] => {
    const a = along ?? (dir === "v" ? [0, 1] : [1, 0]);
    const stroke = color ?? colors.line;
    // Arrowhead chevrons only (no shaft): two short strokes per chevron meeting at a tip.
    return chevronArrowheads(x, y, a as Vec, count).map(([p, q]) =>
      board.create("segment", [p, q], { strokeColor: stroke, strokeWidth: 2, fixed: true, highlight: false }),
    );
  };

  /**
   * The four angles around the crossing of two lines (directions `dirA`, `dirB`) through `vertex`.
   * Returns helpers that address an angle by the screen corner its bisector points into. Each of
   * `vertex`/`dirA`/`dirB` may be a value OR a function returning one — pass functions for a
   * slider-driven figure (a moving crossing point / rotating line) and the wedge + label re-plot
   * live on `board.update()`. The corner key is assumed stable across the figure's live range.
   */
  const crossing = (vertex: Vec | (() => Vec), dirA: Vec | (() => Vec), dirB: Vec | (() => Vec)) => {
    const get = (v: any): (() => Vec) => (typeof v === "function" ? v : () => v);
    const getV = get(vertex);
    const getA = get(dirA);
    const getB = get(dirB);
    /** Recompute the wedge for `corner` from the current directions. */
    const wedgeAt = (corner: string) => quadrantWedges(getA(), getB()).find((w) => w.corner === corner) ?? null;
    return {
      /**
       * Place `text` (a number/label) just inside the angle at `corner`, along its bisector.
       */
      number(
        corner: "ur" | "ul" | "ll" | "lr",
        text: string | number,
        { color, radius = 0.42, fontSize = 15 }: { color?: string; radius?: number; fontSize?: number } = {},
      ) {
        const coord = (i: number) => {
          const w = wedgeAt(corner);
          return w ? getV()[i] + w.bisector[i] * radius : getV()[i];
        };
        return board.create("text", [() => coord(0), () => coord(1), String(text)], {
          strokeColor: color ?? colors.ink,
          fontSize,
          anchorX: "middle",
          anchorY: "middle",
        });
      },
      /**
       * Fill/highlight the angle at `corner` (a JSXGraph `angle` between its two bounding rays). Returns
       * the element so a step captures it for the timeline.
       */
      wedge(
        corner: "ur" | "ul" | "ll" | "lr",
        { color, fillOpacity = 0.45, radius = 0.5, arm = 1.1 }: { color?: string; fillOpacity?: number; radius?: number; arm?: number } = {},
      ) {
        const c = color ?? colors.cat[0];
        const ray = (r: 0 | 1, i: number) => {
          const w = wedgeAt(corner);
          return w ? getV()[i] + w.rays[r][i] * arm : getV()[i];
        };
        const V = ipt([() => getV()[0], () => getV()[1]]);
        const P = ipt([() => ray(0, 0), () => ray(0, 1)]);
        const Q = ipt([() => ray(1, 0), () => ray(1, 1)]);
        return board.create("angle", [P, V, Q], {
          radius,
          fillColor: c,
          fillOpacity,
          strokeColor: c,
          strokeWidth: 1.5,
          name: "",
          withLabel: false,
        });
      },
    };
  };

  /**
   * Draw standardized Cartesian axes on the board — themed lines, arrowheads at the positive ends,
   * tick numbers, and "x"/"y" axis-name labels — so a graph diagram doesn't hand-roll its axes and
   * matches every `registerCharts` chart. The axes auto-span the board's bounding box, so no
   * endpoints are needed; just set the board's `boundingbox` (and usually `keepAspect: false`) in
   * the `registerGeometryScene` options. See {@link drawAxes} for the options + defaults
   * (e.g. `makeGraph({ yName: "f(x)" })`, `makeGraph({ ticks: false })`).
   */
  const makeGraph = (opts: AxesOptions = {}): { x: any; y: any } => drawAxes(board, colors, opts);

  /**
   * Equal-length "tick" hatches across the middle of the side `p`→`q` (each a coordinate pair). Use
   * `count: 2`/`3` for a second/third distinct congruent-side group. Returns the hatch elements.
   */
  const tickMark = (p: Vec, q: Vec, { count = 1, color }: { count?: number; color?: string } = {}): any[] => {
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    const along = [q[0] - p[0], q[1] - p[1]] as Vec;
    const stroke = color ?? colors.line;
    return tickSegments(mx, my, along, count).map(([a, b]) =>
      board.create("segment", [a, b], { strokeColor: stroke, strokeWidth: 2, fixed: true, highlight: false }),
    );
  };

  /**
   * Equal-angle arc mark(s) at `vertex` between the rays to `p1` and `p2` (each a coordinate pair),
   * with an optional `label` sitting on the bisector. `count` draws concentric arcs (distinct equal
   * groups). Returns `{ arcs, label }`.
   */
  const angleMark = (
    vertex: Vec,
    p1: Vec,
    p2: Vec,
    { count = 1, label: text, color, radius = 0.5, fontSize = 13 }: { count?: number; label?: string; color?: string; radius?: number; fontSize?: number } = {},
  ) => {
    const stroke = color ?? colors.line;
    const spec = angleArcSpec(vertex, p1, p2, count, { r: radius });
    const V = ipt(vertex);
    const A = ipt(p1);
    const B = ipt(p2);
    const arcs = spec.radii.map((r) =>
      board.create("angle", [A, V, B], {
        radius: r,
        fillColor: stroke,
        fillOpacity: 0,
        strokeColor: stroke,
        strokeWidth: 1.5,
        name: "",
        withLabel: false,
        fixed: true,
        highlight: false,
      }),
    );
    const lbl = text
      ? board.create("text", [spec.labelAt[0], spec.labelAt[1], String(text)], {
          strokeColor: color ?? colors.ink,
          fontSize,
          anchorX: "middle",
          anchorY: "middle",
          fixed: true,
          highlight: false,
        })
      : null;
    return { arcs, label: lbl };
  };

  /**
   * The right-angle square at `vertex` between the rays to `p1` and `p2` (coordinate pairs).
   */
  const rightAngle = (vertex: Vec, p1: Vec, p2: Vec, { color }: { color?: string } = {}) => {
    const stroke = color ?? colors.line;
    return board.create("angle", [ipt(p1), ipt(vertex), ipt(p2)], {
      orthoType: "square",
      radius: 0.4,
      fillColor: stroke,
      fillOpacity: 0.001,
      strokeColor: stroke,
      strokeWidth: 1.5,
      name: "",
      withLabel: false,
      fixed: true,
      highlight: false,
    });
  };

  /**
   * An auxiliary line through `p`→`q` extended past `q` (and past `p` if `both`), themed dashed by
   * default — the "extend this side / draw this line" construction mark.
   */
  const extend = (p: Vec, q: Vec, { both = false, dash = true, color }: { both?: boolean; dash?: boolean; color?: string } = {}) =>
    board.create("line", [ipt(p), ipt(q)], {
      straightFirst: both,
      straightLast: true,
      strokeColor: color ?? colors.line,
      strokeWidth: 1.5,
      dash: dash ? 2 : 0,
      fixed: true,
      highlight: false,
    });

  /**
   * A themed text label at `at` (a coordinate pair). `style:"unknown"` renders it in the accent
   * colour (the "fill this in" look); otherwise the ink colour (a given). Greek/° are plain Unicode.
   */
  const label = (
    at: Vec,
    text: string | number,
    { color, style = "given", fontSize = 16 }: { color?: string; style?: "given" | "unknown"; fontSize?: number } = {},
  ) =>
    board.create("text", [at[0], at[1], String(text)], {
      strokeColor: color ?? (style === "unknown" ? colors.cat[0] : colors.ink),
      fontSize,
      anchorX: "middle",
      anchorY: "middle",
      fixed: true,
      highlight: false,
    });

  return { parallelMark, crossing, makeGraph, tickMark, angleMark, rightAngle, extend, label };
}
