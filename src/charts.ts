/**
 * High-level chart authoring — the easy way to put JSXGraph charts on a page.
 *
 *   - `registerCharts(charts, chartOptions, sliders)` registers a whole FAMILY of charts that share
 *     one identical domain + range (the range is auto-computed from the data when `ymin`/`ymax` are
 *     null). A teacher declares the series in one call instead of hand-rolling a board/axes/plot
 *     builder per chart.
 *   - `registerChartSliders(name, defs)` registers a named, SHARED slider group. A
 *     `<primer-chart-sliders name="…">` element renders its panel, and every chart that names the
 *     group re-plots together as the sliders move. A single-chart series may instead pass its slider
 *     defs INLINE (the 3rd arg as an array); those render inside that one chart.
 *
 * Slider values are passed as the 2nd argument to every `f(x, sliders)` lambda.
 *
 * The board/axes/curve STYLING here is lifted from the original per-page helper (the trig page) so
 * migrated charts look identical. Every colour comes from `themeColors()` at build time (re-read on a
 * theme rebuild), never hardcoded. The low-level `registerChart` path (src/scenes.ts) still works for
 * one-off boards.
 * @module
 */

import { registerChart } from "./scenes.ts";
import { themeColors } from "./theme.ts";
import { drawAxes } from "./graph-axes.ts";

/**
 * A control in a slider group. Default `type` is `"slider"` — a range input + linked number box,
 * with optional `anchors`. `type: "choice"` instead renders a segmented button group; its value is
 * the **index** of the selected option (so a chart/diagram reads it like any other numeric value),
 * and `min`/`max`/`step`/`anchors` don't apply.
 */
export interface SliderDef {
  name: string;
  /**
   * A literal, or a thunk resolved when the panel
   * renders — pass `() => strings("amplitude")` (see src/scene-strings.ts `makeStrings`) to localize.
   */
  label?: string | (() => string);
  /** Slider only. */
  min?: number;
  /** Slider only. */
  max?: number;
  /** Slider only (default 0.1). */
  step?: number;
  /** Initial value — a slider value, or the selected option index for a choice. */
  value?: number;
  /** Slider only: snap points (also drawn as labelled ticks). */
  anchors?: number[];
  /** Control kind (default `"slider"`). */
  type?: "slider" | "choice";
  /** Choice only: the button labels (value = the chosen index). */
  options?: string[];
}

export interface ThemeColors {
  bg: string;
  ink: string;
  line: string;
  cat: string[];
}

/**
 * A curve's stroke style: one JSXGraph options object applied to every curve, an array indexed per
 * curve, or a function `(colors, i) => options`. The function form is the THEME-SAFE way to colour
 * curves — it receives fresh `themeColors` and the curve index, so colours follow the theme.
 */
export type LineStyle =
  | Record<string, any>
  | Record<string, any>[]
  | ((colors: ThemeColors, i: number) => Record<string, any>);

export type CurveFn = (x: number, sliders: Record<string, number>) => number;

export interface ChartDef {
  /** Chart id referenced by `<primer-chart scene="name">`. */
  name: string;
  /** One lambda `(x, sliders) => y`, or an array (one curve each). */
  f: CurveFn | CurveFn[];
  /** Stroke style for the curve(s). */
  line?: LineStyle;
  /**
   * Per-curve labels (parallel to `f`). When
   * present, the component renders a legend at the bottom of the chart — a colour/dash swatch
   * (matching each curve) beside its label. Each label is a plain string or a thunk (for i18n).
   */
  legend?: Array<string | (() => string)>;
  /**
   * Optional hook to draw extra JSXGraph elements after the curves (a live value readout, a point
   * marker, a shaded band…). `sliders()` returns the chart's live values; give an element a function
   * content/coordinate so it re-plots on `board.update()` as the sliders move. Colours from `colors`.
   */
  decorate?: (board: any, colors: ThemeColors, sliders: () => Record<string, number>) => void;
}

export interface ChartOptions {
  /** Series id (defaults to the joined chart names). */
  id?: string;
  /**
   * Heading rendered above each chart's board. A
   * literal, or a thunk resolved at render — pass `() => strings("title")` to localize.
   */
  title?: string | (() => string);
  /** Default -1. */
  xmin?: number;
  /** Default 1. */
  xmax?: number;
  /** null → autocomputed from the data. */
  ymin?: number | null;
  /** null → autocomputed from the data. */
  ymax?: number | null;
  /** Major x-tick spacing; null → JSXGraph auto-spacing. */
  xticks?: number | null;
  /** Major y-tick spacing; null → JSXGraph auto-spacing. */
  yticks?: number | null;
  /** Label x ticks as multiples of π / e ("π/2","π","3π/2") instead of decimals. */
  xUnit?: "pi" | "e";
  /** Label y ticks as multiples of π / e instead of decimals. */
  yUnit?: "pi" | "e";
  /** Default "x". */
  xaxisname?: string;
  /** Default "y". */
  yaxisname?: string;
}

/* ------------------------------------------------------------------ */
/* Shared-slider broker                                                */
/* ------------------------------------------------------------------ */

export interface SliderGroup {
  name: string;
  defs: SliderDef[];
  /** Live, shared values (the single source of truth). */
  values: Record<string, number>;
  subscribers: Set<(values: Record<string, number>) => void>;
  /** True when the panel renders inside the group's single chart. */
  inline: boolean;
}

/**
 * Create a shared-slider broker: named groups of slider state that any number of charts subscribe
 * to. Factored out so it can be unit-tested in isolation; the app uses the singleton below.
 */
export function createSliderBroker() {
  const groups: Map<string, SliderGroup> = new Map();
  /** chart name → group name */
  const chartToGroup: Map<string, string> = new Map();

  /**
   * Create the group if absent (seeding values from `value ?? min`), else refresh its defs/inline
   * flag while KEEPING live values for defs that still exist.
   */
  function ensureGroup(name: string, defs: SliderDef[], opts: { inline?: boolean } = {}): SliderGroup {
    let g = groups.get(name);
    if (!g) {
      const values: Record<string, number> = {};
      for (const d of defs) values[d.name] = d.value ?? d.min ?? 0;
      g = { name, defs, values, subscribers: new Set(), inline: !!opts.inline };
      groups.set(name, g);
    } else {
      g.defs = defs;
      g.inline = !!opts.inline;
      for (const d of defs) if (!(d.name in g.values)) g.values[d.name] = d.value ?? d.min ?? 0;
    }
    return g;
  }

  const getGroup = (name: string): SliderGroup | undefined => groups.get(name);

  /**
   * Subscribe to a group's value changes. Immediately invokes `fn` once with current values so a
   * freshly mounted (or theme-rebuilt) chart draws current state. Returns an unsubscribe fn.
   */
  function subscribe(name: string, fn: (values: Record<string, number>) => void): () => void {
    const g = groups.get(name);
    if (!g) return () => {};
    g.subscribers.add(fn);
    fn({ ...g.values });
    return () => {
      g.subscribers.delete(fn);
    };
  }

  /**
   * Merge `partial` into a group's values and notify every subscriber. The single mutation point,
   * so the live `values` object the charts read stays authoritative.
   */
  function setValues(name: string, partial: Record<string, number>) {
    const g = groups.get(name);
    if (!g) return;
    Object.assign(g.values, partial);
    for (const fn of g.subscribers) {
      try {
        fn({ ...g.values });
      } catch {
        /* a bad subscriber shouldn't break the rest */
      }
    }
  }

  const linkChart = (chartName: string, groupName: string) => chartToGroup.set(chartName, groupName);
  const groupForChart = (chartName: string): string | undefined => chartToGroup.get(chartName);

  return { ensureGroup, getGroup, subscribe, setValues, linkChart, groupForChart };
}

/** The app-wide broker singleton (ES modules are singletons, so every importer shares it). */
const broker = createSliderBroker();

export interface ChartMeta {
  /** Title heading shown above the chart. */
  title?: string | (() => string);
  /**
   * Per-curve legend labels (parallel
   * to the chart's `f`), each a plain string or a thunk (resolved at render, for i18n).
   */
  legend?: Array<string | (() => string)> | null;
  /**
   * The chart's `line` styling — so the component can resolve each legend
   * swatch's colour/dash via `resolveLineStyle` (keeping the swatches in step with the curves).
   */
  line?: any;
}

/** chart name → display metadata (title + legend). */
const chartMeta: Map<string, ChartMeta> = new Map();

/* ------------------------------------------------------------------ */
/* Component-facing accessors (used by primer-chart / primer-chart-sliders) */
/* ------------------------------------------------------------------ */

export const getSliderGroup = (name: string): SliderGroup | undefined => broker.getGroup(name);
export const groupForChart = (name: string): string | undefined => broker.groupForChart(name);
export const subscribeSliders = (name: string, fn: (values: Record<string, number>) => void): (() => void) =>
  broker.subscribe(name, fn);
export const setSliderValues = (name: string, partial: Record<string, number>) => broker.setValues(name, partial);
export const getChartMeta = (name: string): ChartMeta | undefined => chartMeta.get(name);

/* ------------------------------------------------------------------ */
/* Pure helpers (exported for tests)                                   */
/* ------------------------------------------------------------------ */

/**
 * Auto-derive a padded, symmetric y-range by SAMPLING the functions across [xmin,xmax]. Passing ALL
 * of a series' functions yields one SHARED range so the charts compare fairly. Non-finite or
 * throwing samples are ignored; `floor` guarantees a non-zero range when the data is flat/empty.
 */
export function computeRange(
  fns: ((x: number) => number)[],
  { xmin = -360, xmax = 360, pad = 1.2, floor = 1 }: { xmin?: number; xmax?: number; pad?: number; floor?: number } = {},
): { ymin: number; ymax: number } {
  let peak = floor;
  const step = (xmax - xmin) / 360 || 1; // guard a zero-width window (would loop forever)
  for (let x = xmin; x <= xmax; x += step) {
    for (const f of fns) {
      let y = NaN;
      try {
        y = Math.abs(f(x));
      } catch {
        y = NaN;
      }
      if (Number.isFinite(y)) peak = Math.max(peak, y);
    }
  }
  const ymax = peak * pad;
  return { ymax, ymin: -ymax };
}

/**
 * Resolve a {@link LineStyle} for curve index `i` against live theme colours. Always yields a
 * `strokeColor` (defaulting to `colors.cat[i]`) so a curve is never the invisible JSXGraph default.
 */
export function resolveLineStyle(line: LineStyle | undefined, colors: ThemeColors, i: number): Record<string, any> {
  let style;
  if (typeof line === "function") style = line(colors, i) ?? {};
  else if (Array.isArray(line)) style = line[i] ?? {};
  else style = line ?? {};
  return { strokeColor: colors.cat[i], ...style };
}

/**
 * Resolve a chart's legend into render-ready entries — one per label, in order. Each swatch's
 * colour and dashed-ness are pulled from the SAME {@link resolveLineStyle} the curves use, so a
 * legend can never drift from the plot (and both re-theme together on a rebuild). Label thunks are
 * invoked here (at render) so a localized label reflects the active locale. A non-array `legend`
 * (the common "no legend" case) yields `[]`, which the component renders as nothing.
 */
export function resolveLegend(
  legend: Array<string | (() => string)> | null | undefined,
  line: LineStyle | undefined,
  colors: ThemeColors,
): { label: string; color: string; dashed: boolean }[] {
  if (!Array.isArray(legend)) return [];
  return legend.map((lab, i) => {
    const style = resolveLineStyle(line, colors, i);
    return {
      label: typeof lab === "function" ? lab() : lab,
      color: style.strokeColor,
      dashed: Boolean(style.dash),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Lifted board styling (kept identical to the original trig-page helper) */
/* ------------------------------------------------------------------ */

/**
 * Build the shared board + themed axes for one chart. `JXG` is the component's WRAPPED namespace, so
 * `initBoard` injects the teaching defaults (no chrome, faint grid, resize, board capture).
 */
function makeChartBoard(
  host: HTMLElement,
  JXG: Record<string, any>,
  opts: {
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
    xticks: number | null;
    yticks: number | null;
    xName: string;
    yName: string;
    xUnit?: "pi" | "e";
    yUnit?: "pi" | "e";
  },
): { board: any; colors: ThemeColors; domain: [number, number] } {
  const { xmin, xmax, ymin, ymax, xticks, yticks, xName, yName, xUnit, yUnit } = opts;
  const colors = themeColors();
  // A small horizontal margin (6% of the span each side) so the curve doesn't touch the frame —
  // proportional, so it works at any scale (≈40 units on a ±360° window, ≈0.12 on a ±1 window).
  const xPad = (xmax - xmin) * 0.06;
  const board = JXG.JSXGraph.initBoard(host, {
    boundingbox: [xmin - xPad, ymax, xmax + xPad, ymin],
    keepaspectratio: false,
    axis: false,
    grid: false,
  });
  // Axes via the shared helper so charts and geometry graph diagrams look identical (see
  // src/graph-axes.ts). `ticksDistance` null → JSXGraph auto-spacing; a number pins a fixed spacing.
  drawAxes(board, colors, { xName, yName, xticks, yticks, xUnit, yUnit });
  return { board, colors, domain: [xmin, xmax] };
}

/**
 * Plot a function over the chart's x-domain. functiongraph re-evaluates on `board.update()`, so a
 * function that closes over live slider values re-plots without being recreated.
 */
function plotFn(board: any, domain: [number, number], fn: (x: number) => number, style: Record<string, any>) {
  return board.create("functiongraph", [fn, domain[0], domain[1]], {
    strokeWidth: 2,
    highlight: false,
    ...style,
  });
}

/* ------------------------------------------------------------------ */
/* Public authoring API                                                */
/* ------------------------------------------------------------------ */

/**
 * Register (or update) a named shared slider group. Rendered by `<primer-chart-sliders name>`;
 * charts attach to it via `registerCharts(..., name)`.
 */
export function registerChartSliders(name: string, defs: SliderDef[], opts: { inline?: boolean } = {}) {
  broker.ensureGroup(name, defs, opts);
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("primer:chart-sliders-registered", { detail: { name } }));
  }
}

/**
 * Register a family of charts sharing one domain + range. See the module docs for the full contract.
 * @param sliders  Registered group name, or inline defs (single chart only).
 */
export function registerCharts(charts: ChartDef[], chartOptions: ChartOptions = {}, sliders?: string | SliderDef[]) {
  const {
    id,
    title,
    xmin = -1,
    xmax = 1,
    ymin = null,
    ymax = null,
    xticks = null,
    yticks = null,
    xUnit,
    yUnit,
    xaxisname = "x",
    yaxisname = "y",
  } = chartOptions;
  const seriesId = id ?? charts.map((c) => c.name).join("|");

  // Resolve the slider group: a string names a shared group; an array is inline defs (single chart
  // only) which we register under a namespaced id and flag `inline` so the chart renders the panel.
  let groupName: string | undefined;
  if (typeof sliders === "string") {
    groupName = sliders;
  } else if (Array.isArray(sliders)) {
    if (charts.length !== 1) {
      throw new Error(
        "registerCharts: inline sliders are only allowed for a single chart. Register a shared " +
          "slider group with registerChartSliders and pass its name as the 3rd argument instead.",
      );
    }
    groupName = `inline:${seriesId}`;
    registerChartSliders(groupName, sliders, { inline: true });
  }

  // Seed slider values (for autorange sampling) from the group's current/initial state.
  const seedGroup = groupName ? broker.getGroup(groupName) : undefined;
  const seed = seedGroup ? { ...seedGroup.values } : {};

  // Shared range: autocompute the null side(s) by sampling every curve of every chart at the seed.
  let lo = ymin;
  let hi = ymax;
  if (lo == null || hi == null) {
    const allFns: ((x: number) => number)[] = [];
    for (const c of charts) {
      const fns = Array.isArray(c.f) ? c.f : [c.f];
      for (const fn of fns) allFns.push((x) => fn(x, seed));
    }
    const r = computeRange(allFns, { xmin, xmax });
    if (hi == null) hi = r.ymax;
    if (lo == null) lo = r.ymin;
  }

  for (const c of charts) {
    const fns = Array.isArray(c.f) ? c.f : [c.f];
    const line = c.line;
    if (groupName) broker.linkChart(c.name, groupName);
    // Title is series-level; legend + line are per-chart so the component can resolve each
    // swatch's colour/dash from the same styling the curves use (see resolveLegend).
    chartMeta.set(c.name, { title, legend: c.legend ?? null, line });
    registerChart(c.name, (host, JXG) => {
      const { board, colors, domain } = makeChartBoard(host, JXG, {
        xmin,
        xmax,
        ymin: lo as number,
        ymax: hi as number,
        xticks,
        yticks,
        xUnit,
        yUnit,
        xName: xaxisname,
        yName: yaxisname,
      });
      fns.forEach((fn, i) => {
        const wrapped = groupName
          ? (x: number) => fn(x, broker.getGroup(groupName as string)?.values ?? {})
          : (x: number) => fn(x, {});
        plotFn(board, domain, wrapped, resolveLineStyle(line, colors, i));
      });
      // Optional decoration: extra JSXGraph elements (a live readout, a marker, a shaded region…)
      // drawn once after the curves. It gets the board, the theme palette, and a `sliders()` getter
      // for the chart's live values — so a JSXGraph element with a function content/coordinate
      // re-evaluates on `board.update()` (which the returned updater calls on every slider change).
      if (typeof c.decorate === "function") {
        c.decorate(board, colors, () =>
          groupName ? broker.getGroup(groupName as string)?.values ?? {} : {},
        );
      }
      return () => board.update();
    });
  }
}
