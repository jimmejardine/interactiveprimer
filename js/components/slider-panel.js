// @ts-check
/**
 * A reusable slider panel: labelled slider + linked number box per control, with anchor ticks and
 * magnet snapping. Shared by `<primer-chart>` (inline single-chart sliders) and
 * `<primer-chart-sliders>` (a standalone panel that drives a whole chart series), so the control
 * UX is defined once.
 *
 * `mountSliderPanel(host, defs, initialValues, onChange)` renders into `host` and calls
 * `onChange(values)` — coalesced to once per animation frame, after snapping — whenever a control
 * changes. `SLIDER_PANEL_CSS` is the matching stylesheet each host component includes in its shadow
 * root.
 * @module
 */

import { snapToAnchor } from "../chart-snap.js";

/** @typedef {import("../charts.js").SliderDef} SliderDef */

/** Styles for the controls markup. Each shadow root that renders a panel includes this. */
export const SLIDER_PANEL_CSS = `
  /* One row per param — label, slider, number box. Hidden when empty so it adds no margin. */
  .controls { display: grid; gap: 0.5rem 0.75rem; margin-top: 0.6rem; }
  .controls:empty { display: none; }
  .control { display: grid; grid-template-columns: minmax(6rem, auto) 1fr minmax(3.5rem, auto); gap: 0.6rem; align-items: center; }
  .control > label { font-family: var(--primer-font-ui, sans-serif); font-size: 0.9rem; color: var(--primer-ink, #111); }
  .control input[type="range"] { width: 100%; accent-color: var(--primer-accent, #46e); display: block; }
  .control input[type="number"] {
    font: inherit; width: 100%; padding: 0.25rem 0.4rem; border-radius: 0.4rem;
    border: 1px solid var(--primer-border, #ccc);
    background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
  }
  /* Anchor ticks: drawn under the slider, one per in-range anchor. The slider cell is a positioning
     context so each tick can sit over its value. */
  .slider { position: relative; --tick-inset: 8px; /* ≈ half a native range thumb */ }
  .ticks { position: relative; height: 1.1rem; margin-top: 0.15rem; pointer-events: none; }
  .tick {
    position: absolute; top: 0;
    left: calc(var(--tick-inset) + (100% - 2 * var(--tick-inset)) * var(--at));
    transform: translateX(-50%);
    display: flex; flex-direction: column; align-items: center;
  }
  .tick i { display: block; width: 1px; height: 5px; background: var(--primer-ink-soft, #667); }
  .tick b {
    font-family: var(--primer-font-ui, sans-serif); font-size: 0.7rem; font-weight: 400;
    line-height: 1; margin-top: 1px; color: var(--primer-ink-soft, #667); white-space: nowrap;
  }
  /* When labels would crowd, JS adds .sparse-labels — keep every tick MARK but show only every 2nd
     label (the first is kept; even-positioned labels are dropped). */
  .ticks.sparse-labels .tick:nth-child(even) b { display: none; }
`;

/**
 * Mount a slider panel into `host` (which should carry the `.controls` styling above).
 * @param {HTMLElement} host
 * @param {SliderDef[]} defs
 * @param {Record<string, number> | undefined} initialValues  Seed for each control (else `value ?? min`).
 * @param {(values: Record<string, number>) => void} onChange  Called (coalesced) with the full values.
 * @returns {{ destroy: () => void }}
 */
export function mountSliderPanel(host, defs, initialValues, onChange) {
  /** @type {Record<string, number>} */
  const values = {};
  for (const d of defs) values[d.name] = initialValues?.[d.name] ?? d.value ?? d.min;

  host.innerHTML = controlsHtml(defs, values);

  let raf = 0;
  const flush = () => {
    raf = 0;
    try {
      onChange({ ...values });
    } catch {
      /* a bad value mid-edit shouldn't break the chart */
    }
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(flush);
  };

  /** @param {Event} e */
  const onInput = (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const name = input.dataset.name;
    if (!name) return;
    let value = Number(input.value);
    if (!Number.isFinite(value)) return;
    // Dragging the slider snaps to a nearby anchor (typing in the number box stays exact). The snap
    // distance is a fixed pixel budget mapped into value units, so the magnet feels the same on
    // every slider regardless of its range.
    if (input.dataset.role === "range") {
      const p = defs.find((q) => q.name === name);
      const width = input.getBoundingClientRect().width;
      if (p?.anchors && width > 0) {
        const SNAP_PX = 10;
        value = snapToAnchor(value, p.anchors, (SNAP_PX / width) * (p.max - p.min));
      }
    }
    values[name] = value;
    // Mirror to the sibling control with the same name (slider ↔ number box).
    for (const other of host.querySelectorAll(`input[data-name="${name}"]`)) {
      if (other !== input) /** @type {HTMLInputElement} */ (other).value = String(value);
    }
    // If a slider drag snapped, pull the dragged thumb onto the anchor too.
    if (input.dataset.role === "range" && Number(input.value) !== value) {
      input.value = String(value);
    }
    schedule();
  };
  host.addEventListener("input", onInput);

  // Thin crowded anchor labels as the panel width changes (also fires once on observe, which is when
  // we first know the laid-out slider width).
  /** @type {ResizeObserver | null} */
  let ro = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => updateTickDensity(host));
    ro.observe(host);
  }

  return {
    destroy() {
      host.removeEventListener("input", onInput);
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      ro = null;
      host.replaceChildren();
    },
  };
}

/**
 * @param {SliderDef[]} defs
 * @param {Record<string, number>} values
 * @returns {string} The controls markup (one labelled slider + number box per def).
 */
function controlsHtml(defs, values) {
  return defs
    .map((p, i) => {
      const step = p.step ?? 0.1;
      const value = values[p.name];
      // `label` may be a thunk (resolved here, at render, so a localized label picks up the active
      // locale even though the slider was registered before the translation overlay applied).
      const raw = typeof p.label === "function" ? p.label() : p.label;
      const label = escapeHtml(raw ?? p.name);
      // Slider and number share a name via `data-name`; `data-role` distinguishes them. The range
      // lives in a `.slider` cell so its anchor ticks can be positioned over the track.
      return `
        <div class="control">
          <label for="slider-num-${i}">${label}</label>
          <div class="slider">
            <input type="range" data-name="${escapeHtml(p.name)}" data-role="range"
              min="${p.min}" max="${p.max}" step="${step}" value="${value}"
              aria-label="${label}">
            ${ticksHtml(p)}
          </div>
          <input type="number" id="slider-num-${i}" data-name="${escapeHtml(p.name)}" data-role="number"
            min="${p.min}" max="${p.max}" step="${step}" value="${value}"
            aria-label="${label}">
        </div>`;
    })
    .join("");
}

/**
 * The labelled-tick markup for a def's `anchors`, or "" if it has none. Each in-range, finite anchor
 * becomes a tick positioned by its fraction along the track (`--at`).
 * @param {SliderDef} p
 * @returns {string}
 */
function ticksHtml(p) {
  const span = p.max - p.min;
  if (!Array.isArray(p.anchors) || !(span > 0)) return "";
  const ticks = p.anchors
    .filter((a) => Number.isFinite(a) && a >= p.min && a <= p.max)
    .map((a) => {
      const at = (a - p.min) / span;
      const label = escapeHtml(String(+a.toFixed(3))); // drop float noise; keep author values clean
      return `<span class="tick" style="--at:${at}"><i></i><b>${label}</b></span>`;
    })
    .join("");
  return ticks ? `<div class="ticks">${ticks}</div>` : "";
}

/**
 * Thin crowded anchor labels: when a slider's ticks are spaced closer than a label is wide, mark its
 * `.ticks` so only every 2nd label shows (the first is always kept). Tick *marks* always stay.
 * @param {HTMLElement} host
 */
function updateTickDensity(host) {
  const LABEL_MIN_PX = 34; // room for a ~3–4 char label at 0.7rem
  for (const ticks of host.querySelectorAll(".ticks")) {
    const range = ticks.parentElement?.querySelector('input[type="range"]');
    const width = range?.getBoundingClientRect().width ?? 0;
    const gaps = ticks.children.length - 1;
    const spacing = gaps > 0 ? width / gaps : Infinity;
    ticks.classList.toggle("sparse-labels", width > 0 && spacing < LABEL_MIN_PX);
  }
}

/**
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    /** @type {Record<string,string>} */ ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[c],
  );
}
