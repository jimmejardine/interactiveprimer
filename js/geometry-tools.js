// @ts-check
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

import { chevronSegments, quadrantWedges } from "./geometry.js";

/**
 * @typedef {[number, number]} Vec
 * @typedef {import("./geometry.js").Vec} _V
 */

/**
 * Build the tools bound to `board` + the resolved theme `colors`.
 * @param {any} board  A JSXGraph board.
 * @param {{ bg: string, ink: string, line: string, cat: string[] }} colors
 */
export function makeGeometryTools(board, colors) {
  /** @param {Array<number | (() => number)>} p  Coordinates, each a value or a live getter. */
  const ipt = (p) => board.create("point", p, { visible: false, withLabel: false, name: "" });

  /**
   * Draw `count` small parallel-mark arrowheads centred on `(x, y)`, in the line's colour. `dir` is
   * "h"/"v" (horizontal/vertical line); pass `along: [ux, uy]` for a slanted line. Use `count: 2` for a
   * second, distinct pair of parallels in the same figure.
   * @param {number} x @param {number} y
   * @param {{ dir?: "h"|"v", along?: Vec, count?: number, color?: string }} [opts]
   * @returns {any[]}
   */
  const parallelMark = (x, y, { dir = "h", along, count = 1, color } = {}) => {
    const a = along ?? (dir === "v" ? [0, 1] : [1, 0]);
    const stroke = color ?? colors.line;
    return chevronSegments(x, y, /** @type {Vec} */ (a), count).map(([p, q]) =>
      board.create("arrow", [p, q], { strokeColor: stroke, strokeWidth: 2, lastArrow: { type: 2, size: 7 } }),
    );
  };

  /**
   * The four angles around the crossing of two lines (directions `dirA`, `dirB`) through `vertex`.
   * Returns helpers that address an angle by the screen corner its bisector points into. Each of
   * `vertex`/`dirA`/`dirB` may be a value OR a function returning one — pass functions for a
   * slider-driven figure (a moving crossing point / rotating line) and the wedge + label re-plot
   * live on `board.update()`. The corner key is assumed stable across the figure's live range.
   * @param {Vec | (() => Vec)} vertex @param {Vec | (() => Vec)} dirA @param {Vec | (() => Vec)} dirB
   */
  const crossing = (vertex, dirA, dirB) => {
    /** @param {any} v @returns {() => Vec} */
    const get = (v) => (typeof v === "function" ? v : () => v);
    const getV = get(vertex);
    const getA = get(dirA);
    const getB = get(dirB);
    /** Recompute the wedge for `corner` from the current directions. @param {string} corner */
    const wedgeAt = (corner) => quadrantWedges(getA(), getB()).find((w) => w.corner === corner) ?? null;
    return {
      /**
       * Place `text` (a number/label) just inside the angle at `corner`, along its bisector.
       * @param {"ur"|"ul"|"ll"|"lr"} corner @param {string|number} text
       * @param {{ color?: string, radius?: number, fontSize?: number }} [opts]
       */
      number(corner, text, { color, radius = 0.42, fontSize = 15 } = {}) {
        /** @param {number} i */
        const coord = (i) => {
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
       * @param {"ur"|"ul"|"ll"|"lr"} corner
       * @param {{ color?: string, fillOpacity?: number, radius?: number, arm?: number }} [opts]
       */
      wedge(corner, { color, fillOpacity = 0.45, radius = 0.5, arm = 1.1 } = {}) {
        const c = color ?? colors.cat[0];
        /** @param {0|1} r @param {number} i */
        const ray = (r, i) => {
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

  return { parallelMark, crossing };
}
