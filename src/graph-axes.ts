/**
 * The ONE place graph axes are styled — shared by the high-level charts (src/charts.ts
 * `makeChartBoard`) and by the `makeGraph` toolkit helper handed to geometry builders
 * (src/geometry-tools.ts) — so every plotted graph in the Primer has identical axes.
 *
 * It draws two themed JSXGraph `axis` elements through the origin. A JSXGraph axis auto-spans the
 * board's bounding box and re-fits on resize, so the caller passes NO endpoints or label
 * coordinates — just the style. The look: faint axis lines, a small arrowhead at each positive end
 * (the "little arrows"), tick marks + numbers, and an "x"/"y" axis-name label tucked at the far
 * positive end. Colours come from the passed `themeColors()` palette, so axes re-theme on rebuild.
 * @module
 */

export type ThemeColors = { bg: string, ink: string, line: string, cat: string[] };

export interface AxesOptions {
  /** x-axis name label (default "x"; "" or null hides it). */
  xName?: string;
  /** y-axis name label (default "y"; "" or null hides it). */
  yName?: string;
  /** Major x-tick spacing; null → JSXGraph auto-spacing, a number pins it. */
  xticks?: number | null;
  /** Major y-tick spacing; null → auto-spacing. */
  yticks?: number | null;
  /** Draw tick marks + numbers (default true; false → clean, unticked axes). */
  ticks?: boolean;
  /** Arrowhead at each axis's positive end (default true). */
  arrows?: boolean;
  /** Label x ticks as multiples of π / e ("π/2", "π", "3π/2") instead of decimals. */
  xUnit?: "pi" | "e";
  /** Label y ticks as multiples of π / e instead of decimals. */
  yUnit?: "pi" | "e";
}

const UNITS = {
  pi: { base: Math.PI, symbol: "π" },
  e: { base: Math.E, symbol: "e" },
} as Record<string, { base: number, symbol: string }>;

/** Greatest common divisor of two non-negative integers. */
function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/**
 * Format an axis value as a lowest-terms fraction of `base` labelled with `symbol` — with base π:
 * 0 → "0", π/2 → "π/2", π → "π", 3π/2 → "3π/2", 2π → "2π", −π/4 → "−π/4". Unit-neutral (works for e).
 */
export function unitLabel(value: number, base: number, symbol: string): string {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-9) return "0";
  const k = value / base;
  let bestP = 0;
  let bestQ = 1;
  let bestErr = Infinity;
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(k * q);
    const err = Math.abs(k - p / q);
    if (err < bestErr - 1e-12) {
      bestErr = err;
      bestP = p;
      bestQ = q;
    }
  }
  const g = gcd(Math.abs(bestP), bestQ) || 1;
  const p = bestP / g;
  const q = bestQ / g;
  if (p === 0) return "0";
  const sign = p < 0 ? "−" : "";
  const a = Math.abs(p);
  const head = a === 1 ? symbol : `${a}${symbol}`;
  return q === 1 ? `${sign}${head}` : `${sign}${head}/${q}`;
}

/**
 * Draw the standardized x/y axes on `board` and return the two axis elements.
 * @param board  A JSXGraph board (created with `axis: false`, so these are the only axes).
 * @param colors  Resolved theme palette from `themeColors()`.
 * @param opts
 */
export function drawAxes(board: any, colors: ThemeColors, opts: AxesOptions = {}): { x: any, y: any } {
  const { xName = "x", yName = "y", xticks = null, yticks = null, ticks = true, arrows = true, xUnit, yUnit } = opts;
  const xu = xUnit ? UNITS[xUnit] : undefined;
  const yu = yUnit ? UNITS[yUnit] : undefined;

  // Arrowhead at the positive end (type 2 matches the geometry tools' parallel-mark arrows).
  const arrowOpt = arrows ? { lastArrow: { type: 2, size: 6 } } : { lastArrow: false };

  // Axis lines thin + faint so the full-ink tick numbers read clearly. `ticksDistance` null →
  // JSXGraph auto-spacing (insertTicks); a number pins a fixed spacing. `ticks: false` → no ticks.
  /**
   * @param unit  π/e scaling for this axis's tick labels.
   * @param coordIndex  usrCoords index that varies along this axis (1 = x, 2 = y).
   */
  const axisOpts = (ticksDistance: number | null, minorTicks: number, label: Record<string, any>, unit?: { base: number, symbol: string }, coordIndex?: number) => {
    // With a π/e unit, pin ticks to a multiple of the base (default base/2 when the caller left it null)
    // and format each label as a proper fraction (π/2, π, 3π/2) via generateLabelText.
    const dist = unit ? (ticksDistance == null ? unit.base / 2 : ticksDistance) : ticksDistance;
    const unitLabelOpt = unit
      ? {
          generateLabelText: (tick: any, zero: any, value: any) => {
            const i = coordIndex ?? 1;
            const v = typeof value === "number" ? value : tick.usrCoords[i] - zero.usrCoords[i];
            return unitLabel(v, unit.base, unit.symbol);
          },
        }
      : {};
    return {
      strokeColor: colors.line,
      strokeOpacity: 0.45,
      strokeWidth: 1,
      highlight: false,
      ...arrowOpt,
      ticks: ticks
        ? {
            ...(dist == null ? { insertTicks: true } : { ticksDistance: dist, insertTicks: false }),
            minorTicks,
            minorHeight: 4,
            drawZero: false,
            strokeColor: colors.line,
            strokeOpacity: 0.12,
            strokeWidth: 1,
            label: { strokeColor: colors.ink, strokeOpacity: 1, fontSize: 13, anchorX: "middle", offset: [0, -2], ...label },
            ...unitLabelOpt,
          }
        : { visible: false },
    };
  };

  // Name the axis itself (distinct from the tick numbers): "x" tucked inside the right end, "y" just
  // right of the top. `position: "rt"` is JSXGraph's "far positive end" for an axis.
  const nameLabel = (name: string, label: Record<string, any>) =>
    name ? { name, withLabel: true, label: { strokeColor: colors.ink, strokeOpacity: 1, fontSize: 14, ...label } } : {};

  const x = board.create("axis", [[0, 0], [1, 0]], {
    ...axisOpts(xticks, 1, { anchorX: "middle", anchorY: "top", offset: [0, -8] }, xu, 1),
    ...nameLabel(xName, { position: "rt", anchorX: "right", offset: [8, 12] }),
  });
  const y = board.create("axis", [[0, 0], [0, 1]], {
    ...axisOpts(yticks, 0, { anchorX: "right", anchorY: "middle", offset: [-8, 0] }, yu, 2),
    ...nameLabel(yName, { position: "rt", anchorX: "left", offset: [8, 6] }),
  });
  return { x, y };
}
