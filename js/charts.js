// @ts-check
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
 * theme rebuild), never hardcoded. The low-level `registerChart` path (js/scenes.js) still works for
 * one-off boards.
 * @module
 */

import { registerChart } from "./scenes.js";
import { themeColors } from "./theme.js";

/**
 * @typedef {object} SliderDef
 * @property {string} name
 * @property {string | (() => string)} [label]  A literal, or a thunk resolved when the panel
 *   renders — pass `() => strings("amplitude")` (see js/scene-strings.js `makeStrings`) to localize.
 * @property {number} min
 * @property {number} max
 * @property {number} [step]
 * @property {number} [value]
 * @property {number[]} [anchors]
 */

/**
 * @typedef {object} ThemeColors
 * @property {string} bg
 * @property {string} ink
 * @property {string} line
 * @property {string[]} cat
 */

/**
 * A curve's stroke style: one JSXGraph options object applied to every curve, an array indexed per
 * curve, or a function `(colors, i) => options`. The function form is the THEME-SAFE way to colour
 * curves — it receives fresh `themeColors` and the curve index, so colours follow the theme.
 * @typedef {Record<string, any> | Record<string, any>[] | ((colors: ThemeColors, i: number) => Record<string, any>)} LineStyle
 */

/**
 * @typedef {(x: number, sliders: Record<string, number>) => number} CurveFn
 */

/**
 * @typedef {object} ChartDef
 * @property {string} name  Chart id referenced by `<primer-chart scene="name">`.
 * @property {CurveFn | CurveFn[]} f  One lambda `(x, sliders) => y`, or an array (one curve each).
 * @property {LineStyle} [line]  Stroke style for the curve(s).
 */

/**
 * @typedef {object} ChartOptions
 * @property {string} [id]          Series id (defaults to the joined chart names).
 * @property {string | (() => string)} [title]  Heading rendered above each chart's board. A
 *   literal, or a thunk resolved at render — pass `() => strings("title")` to localize.
 * @property {number} [xmin]        Default -1.
 * @property {number} [xmax]        Default 1.
 * @property {number|null} [ymin]   null → autocomputed from the data.
 * @property {number|null} [ymax]   null → autocomputed from the data.
 * @property {number|null} [xticks] Major x-tick spacing; null → JSXGraph auto-spacing.
 * @property {number|null} [yticks] Major y-tick spacing; null → JSXGraph auto-spacing.
 * @property {string} [xaxisname]   Default "x".
 * @property {string} [yaxisname]   Default "y".
 */

/* ------------------------------------------------------------------ */
/* Shared-slider broker                                                */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} SliderGroup
 * @property {string} name
 * @property {SliderDef[]} defs
 * @property {Record<string, number>} values  Live, shared values (the single source of truth).
 * @property {Set<(values: Record<string, number>) => void>} subscribers
 * @property {boolean} inline  True when the panel renders inside the group's single chart.
 */

/**
 * Create a shared-slider broker: named groups of slider state that any number of charts subscribe
 * to. Factored out so it can be unit-tested in isolation; the app uses the singleton below.
 */
export function createSliderBroker() {
  /** @type {Map<string, SliderGroup>} */
  const groups = new Map();
  /** @type {Map<string, string>} chart name → group name */
  const chartToGroup = new Map();

  /**
   * Create the group if absent (seeding values from `value ?? min`), else refresh its defs/inline
   * flag while KEEPING live values for defs that still exist.
   * @param {string} name
   * @param {SliderDef[]} defs
   * @param {{ inline?: boolean }} [opts]
   * @returns {SliderGroup}
   */
  function ensureGroup(name, defs, opts = {}) {
    let g = groups.get(name);
    if (!g) {
      /** @type {Record<string, number>} */
      const values = {};
      for (const d of defs) values[d.name] = d.value ?? d.min;
      g = { name, defs, values, subscribers: new Set(), inline: !!opts.inline };
      groups.set(name, g);
    } else {
      g.defs = defs;
      g.inline = !!opts.inline;
      for (const d of defs) if (!(d.name in g.values)) g.values[d.name] = d.value ?? d.min;
    }
    return g;
  }

  /** @param {string} name @returns {SliderGroup | undefined} */
  const getGroup = (name) => groups.get(name);

  /**
   * Subscribe to a group's value changes. Immediately invokes `fn` once with current values so a
   * freshly mounted (or theme-rebuilt) chart draws current state. Returns an unsubscribe fn.
   * @param {string} name
   * @param {(values: Record<string, number>) => void} fn
   * @returns {() => void}
   */
  function subscribe(name, fn) {
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
   * @param {string} name
   * @param {Record<string, number>} partial
   */
  function setValues(name, partial) {
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

  /** @param {string} chartName @param {string} groupName */
  const linkChart = (chartName, groupName) => chartToGroup.set(chartName, groupName);
  /** @param {string} chartName @returns {string | undefined} */
  const groupForChart = (chartName) => chartToGroup.get(chartName);

  return { ensureGroup, getGroup, subscribe, setValues, linkChart, groupForChart };
}

/** The app-wide broker singleton (ES modules are singletons, so every importer shares it). */
const broker = createSliderBroker();

/** @type {Map<string, { title?: string | (() => string) }>} chart name → display metadata (e.g. title heading). */
const chartMeta = new Map();

/* ------------------------------------------------------------------ */
/* Component-facing accessors (used by primer-chart / primer-chart-sliders) */
/* ------------------------------------------------------------------ */

/** @param {string} name @returns {SliderGroup | undefined} */
export const getSliderGroup = (name) => broker.getGroup(name);
/** @param {string} name @returns {string | undefined} */
export const groupForChart = (name) => broker.groupForChart(name);
/** @param {string} name @param {(values: Record<string, number>) => void} fn @returns {() => void} */
export const subscribeSliders = (name, fn) => broker.subscribe(name, fn);
/** @param {string} name @param {Record<string, number>} partial */
export const setSliderValues = (name, partial) => broker.setValues(name, partial);
/** @param {string} name @returns {{ title?: string | (() => string) } | undefined} */
export const getChartMeta = (name) => chartMeta.get(name);

/* ------------------------------------------------------------------ */
/* Pure helpers (exported for tests)                                   */
/* ------------------------------------------------------------------ */

/**
 * Auto-derive a padded, symmetric y-range by SAMPLING the functions across [xmin,xmax]. Passing ALL
 * of a series' functions yields one SHARED range so the charts compare fairly. Non-finite or
 * throwing samples are ignored; `floor` guarantees a non-zero range when the data is flat/empty.
 * @param {((x: number) => number)[]} fns
 * @param {{ xmin?: number, xmax?: number, pad?: number, floor?: number }} [opts]
 * @returns {{ ymin: number, ymax: number }}
 */
export function computeRange(fns, { xmin = -360, xmax = 360, pad = 1.2, floor = 1 } = {}) {
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
 * @param {LineStyle | undefined} line
 * @param {ThemeColors} colors
 * @param {number} i
 * @returns {Record<string, any>}
 */
export function resolveLineStyle(line, colors, i) {
  let style;
  if (typeof line === "function") style = line(colors, i) ?? {};
  else if (Array.isArray(line)) style = line[i] ?? {};
  else style = line ?? {};
  return { strokeColor: colors.cat[i], ...style };
}

/* ------------------------------------------------------------------ */
/* Lifted board styling (kept identical to the original trig-page helper) */
/* ------------------------------------------------------------------ */

/**
 * Build the shared board + themed axes for one chart. `JXG` is the component's WRAPPED namespace, so
 * `initBoard` injects the teaching defaults (no chrome, faint grid, resize, board capture).
 * @param {HTMLElement} host
 * @param {Record<string, any>} JXG
 * @param {{ xmin: number, xmax: number, ymin: number, ymax: number, xticks: number|null, yticks: number|null, xName: string, yName: string }} opts
 * @returns {{ board: any, colors: ThemeColors, domain: [number, number] }}
 */
function makeChartBoard(host, JXG, opts) {
  const { xmin, xmax, ymin, ymax, xticks, yticks, xName, yName } = opts;
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
  // Axis lines thin + faint so the full-ink number labels read clearly. An axis's MAJOR ticks
  // default to majorHeight -1 (full board height) → they render as faint grid lines; we keep that at
  // low opacity. `ticksDistance` null → JSXGraph auto-spacing (insertTicks), so any window shows
  // ticks; a number pins a fixed spacing. Labels: x centred below the axis, y right-aligned to its
  // left (set per axis via the `label` override).
  /** @param {number|null} ticksDistance @param {number} minorTicks @param {Record<string, any>} label */
  const axisOpts = (ticksDistance, minorTicks, label) => ({
    strokeColor: colors.line,
    strokeOpacity: 0.45,
    strokeWidth: 1,
    highlight: false,
    ticks: {
      ...(ticksDistance == null ? { insertTicks: true } : { ticksDistance, insertTicks: false }),
      minorTicks,
      minorHeight: 4,
      drawZero: false,
      strokeColor: colors.line,
      strokeOpacity: 0.12,
      strokeWidth: 1,
      label: { strokeColor: colors.ink, strokeOpacity: 1, fontSize: 13, anchorX: "middle", offset: [0, -2], ...label },
    },
  });
  // Name the axis itself (distinct from the tick numbers): "x" tucked inside the right end, "y" just
  // right of the top. `position: "rt"` is JSXGraph's "far positive end" for an axis.
  /** @param {string} name @param {Record<string, any>} label */
  const nameLabel = (name, label) =>
    name ? { name, withLabel: true, label: { strokeColor: colors.ink, strokeOpacity: 1, fontSize: 14, ...label } } : {};
  board.create("axis", [[0, 0], [1, 0]], {
    ...axisOpts(xticks, 1, { anchorX: "middle", anchorY: "top", offset: [0, -8] }),
    ...nameLabel(xName, { position: "rt", anchorX: "right", offset: [8, 12] }),
  });
  board.create("axis", [[0, 0], [0, 1]], {
    ...axisOpts(yticks, 0, { anchorX: "right", anchorY: "middle", offset: [-8, 0] }),
    ...nameLabel(yName, { position: "rt", anchorX: "left", offset: [8, 6] }),
  });
  return { board, colors, domain: [xmin, xmax] };
}

/**
 * Plot a function over the chart's x-domain. functiongraph re-evaluates on `board.update()`, so a
 * function that closes over live slider values re-plots without being recreated.
 * @param {any} board
 * @param {[number, number]} domain
 * @param {(x: number) => number} fn
 * @param {Record<string, any>} style
 */
function plotFn(board, domain, fn, style) {
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
 * @param {string} name
 * @param {SliderDef[]} defs
 * @param {{ inline?: boolean }} [opts]
 */
export function registerChartSliders(name, defs, opts = {}) {
  broker.ensureGroup(name, defs, opts);
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("primer:chart-sliders-registered", { detail: { name } }));
  }
}

/**
 * Register a family of charts sharing one domain + range. See the module docs for the full contract.
 * @param {ChartDef[]} charts
 * @param {ChartOptions} [chartOptions]
 * @param {string | SliderDef[]} [sliders]  Registered group name, or inline defs (single chart only).
 */
export function registerCharts(charts, chartOptions = {}, sliders) {
  const {
    id,
    title,
    xmin = -1,
    xmax = 1,
    ymin = null,
    ymax = null,
    xticks = null,
    yticks = null,
    xaxisname = "x",
    yaxisname = "y",
  } = chartOptions;
  const seriesId = id ?? charts.map((c) => c.name).join("|");

  // Resolve the slider group: a string names a shared group; an array is inline defs (single chart
  // only) which we register under a namespaced id and flag `inline` so the chart renders the panel.
  /** @type {string | undefined} */
  let groupName;
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
    /** @type {((x: number) => number)[]} */
    const allFns = [];
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
    chartMeta.set(c.name, { title });
    registerChart(c.name, (host, JXG) => {
      const { board, colors, domain } = makeChartBoard(host, JXG, {
        xmin,
        xmax,
        ymin: /** @type {number} */ (lo),
        ymax: /** @type {number} */ (hi),
        xticks,
        yticks,
        xName: xaxisname,
        yName: yaxisname,
      });
      fns.forEach((fn, i) => {
        const wrapped = groupName
          ? /** @param {number} x */ (x) => fn(x, broker.getGroup(/** @type {string} */ (groupName))?.values ?? {})
          : /** @param {number} x */ (x) => fn(x, {});
        plotFn(board, domain, wrapped, resolveLineStyle(line, colors, i));
      });
      return () => board.update();
    });
  }
}
