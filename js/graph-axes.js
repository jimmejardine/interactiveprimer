// @ts-check
/**
 * The ONE place graph axes are styled — shared by the high-level charts (js/charts.js
 * `makeChartBoard`) and by the `makeGraph` toolkit helper handed to geometry builders
 * (js/geometry-tools.js) — so every plotted graph in the Primer has identical axes.
 *
 * It draws two themed JSXGraph `axis` elements through the origin. A JSXGraph axis auto-spans the
 * board's bounding box and re-fits on resize, so the caller passes NO endpoints or label
 * coordinates — just the style. The look: faint axis lines, a small arrowhead at each positive end
 * (the "little arrows"), tick marks + numbers, and an "x"/"y" axis-name label tucked at the far
 * positive end. Colours come from the passed `themeColors()` palette, so axes re-theme on rebuild.
 * @module
 */

/** @typedef {{ bg: string, ink: string, line: string, cat: string[] }} ThemeColors */

/**
 * @typedef {object} AxesOptions
 * @property {string} [xName]   x-axis name label (default "x"; "" or null hides it).
 * @property {string} [yName]   y-axis name label (default "y"; "" or null hides it).
 * @property {number|null} [xticks]  Major x-tick spacing; null → JSXGraph auto-spacing, a number pins it.
 * @property {number|null} [yticks]  Major y-tick spacing; null → auto-spacing.
 * @property {boolean} [ticks]  Draw tick marks + numbers (default true; false → clean, unticked axes).
 * @property {boolean} [arrows] Arrowhead at each axis's positive end (default true).
 */

/**
 * Draw the standardized x/y axes on `board` and return the two axis elements.
 * @param {any} board  A JSXGraph board (created with `axis: false`, so these are the only axes).
 * @param {ThemeColors} colors  Resolved theme palette from `themeColors()`.
 * @param {AxesOptions} [opts]
 * @returns {{ x: any, y: any }}
 */
export function drawAxes(board, colors, opts = {}) {
  const { xName = "x", yName = "y", xticks = null, yticks = null, ticks = true, arrows = true } = opts;

  // Arrowhead at the positive end (type 2 matches the geometry tools' parallel-mark arrows).
  const arrowOpt = arrows ? { lastArrow: { type: 2, size: 6 } } : { lastArrow: false };

  // Axis lines thin + faint so the full-ink tick numbers read clearly. `ticksDistance` null →
  // JSXGraph auto-spacing (insertTicks); a number pins a fixed spacing. `ticks: false` → no ticks.
  /** @param {number|null} ticksDistance @param {number} minorTicks @param {Record<string, any>} label */
  const axisOpts = (ticksDistance, minorTicks, label) => ({
    strokeColor: colors.line,
    strokeOpacity: 0.45,
    strokeWidth: 1,
    highlight: false,
    ...arrowOpt,
    ticks: ticks
      ? {
          ...(ticksDistance == null ? { insertTicks: true } : { ticksDistance, insertTicks: false }),
          minorTicks,
          minorHeight: 4,
          drawZero: false,
          strokeColor: colors.line,
          strokeOpacity: 0.12,
          strokeWidth: 1,
          label: { strokeColor: colors.ink, strokeOpacity: 1, fontSize: 13, anchorX: "middle", offset: [0, -2], ...label },
        }
      : { visible: false },
  });

  // Name the axis itself (distinct from the tick numbers): "x" tucked inside the right end, "y" just
  // right of the top. `position: "rt"` is JSXGraph's "far positive end" for an axis.
  /** @param {string} name @param {Record<string, any>} label */
  const nameLabel = (name, label) =>
    name ? { name, withLabel: true, label: { strokeColor: colors.ink, strokeOpacity: 1, fontSize: 14, ...label } } : {};

  const x = board.create("axis", [[0, 0], [1, 0]], {
    ...axisOpts(xticks, 1, { anchorX: "middle", anchorY: "top", offset: [0, -8] }),
    ...nameLabel(xName, { position: "rt", anchorX: "right", offset: [8, 12] }),
  });
  const y = board.create("axis", [[0, 0], [0, 1]], {
    ...axisOpts(yticks, 0, { anchorX: "right", anchorY: "middle", offset: [-8, 0] }),
    ...nameLabel(yName, { position: "rt", anchorX: "left", offset: [8, 6] }),
  });
  return { x, y };
}
