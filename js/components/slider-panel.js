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
  /* "Neon HUD" control panel: a recessed instrument surface framed with a hairline,
     a glowing accent slider thumb over a lit fill, and monospace numeric readouts. All colours come
     from --primer-* tokens, so it recolours per theme (the glow is the theme's accent/ring). */
  .controls {
    display: grid; gap: 0.5rem 0.75rem; margin-top: 0.6rem;
    padding: 0.75rem 0.95rem; border-radius: 0.55rem; position: relative;
    background: var(--primer-control-bg, #f1ede4);
    border: 1px solid var(--primer-control-border, #ccc);
    box-shadow: inset 0 1px 0 var(--primer-ring, rgba(70,90,230,0.25));
    container-type: inline-size; /* so controls restack by the PANEL's own width, not the viewport */
  }
  .controls:empty { display: none; padding: 0; border: 0; box-shadow: none; }

  .control { display: grid; grid-template-columns: minmax(6rem, auto) 1fr minmax(3.5rem, auto); gap: 0.6rem; align-items: center; }

  /* Narrow panel: stack the control — name on top, full-width slider below, value box to the right of both. */
  @container (max-width: 26rem) {
    .control {
      grid-template-columns: 1fr auto;
      grid-template-areas: "name value" "slider value";
      gap: 0.15rem 0.6rem;
    }
    .control > label { grid-area: name; }
    .control .slider { grid-area: slider; }
    .control > input[type="number"] { grid-area: value; align-self: center; }
    /* Choice controls: label on its own line, segmented chips below. */
    .control.choice { grid-template-columns: 1fr; grid-template-areas: "name" "seg"; }
    .control.choice > label { grid-area: name; }
    .control.choice .segmented { grid-area: seg; }
  }
  .control > label {
    font-family: var(--primer-font-ui, sans-serif); font-size: 0.72rem;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--primer-ink-soft, #667);
  }

  /* The range slider: a thin grooved track with a lit accent fill (--fill set by JS) and a small
     glowing accent thumb. Styled per-engine (WebKit + Firefox). */
  .control input[type="range"] {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 1.4rem; display: block; background: transparent; cursor: pointer;
    --fill: 50%;
  }
  .control input[type="range"]:focus { outline: none; }
  .control input[type="range"]::-webkit-slider-runnable-track {
    height: 4px; border-radius: 2px;
    background: linear-gradient(90deg, var(--primer-accent, #46e) 0 var(--fill),
      var(--primer-control-border, #ccc) var(--fill) 100%);
    box-shadow: inset 0 0 0 1px var(--primer-control-border, #ccc);
  }
  .control input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none; margin-top: -4px;
    width: 12px; height: 12px; border-radius: 2px;
    background: var(--primer-accent, #46e); border: 1px solid var(--primer-accent-ink, #fff);
    box-shadow: 0 0 6px var(--primer-ring, rgba(70,90,230,0.6));
  }
  .control input[type="range"]:focus::-webkit-slider-thumb {
    box-shadow: 0 0 0 3px var(--primer-ring, rgba(70,90,230,0.5)), 0 0 10px var(--primer-accent, #46e);
  }
  .control input[type="range"]::-moz-range-track {
    height: 4px; border-radius: 2px; background: var(--primer-control-border, #ccc);
  }
  .control input[type="range"]::-moz-range-progress {
    height: 4px; border-radius: 2px; background: var(--primer-accent, #46e);
  }
  .control input[type="range"]::-moz-range-thumb {
    width: 12px; height: 12px; border-radius: 2px;
    background: var(--primer-accent, #46e); border: 1px solid var(--primer-accent-ink, #fff);
    box-shadow: 0 0 6px var(--primer-ring, rgba(70,90,230,0.6));
  }
  .control input[type="range"]:focus::-moz-range-thumb {
    box-shadow: 0 0 0 3px var(--primer-ring, rgba(70,90,230,0.5)), 0 0 10px var(--primer-accent, #46e);
  }

  /* Numeric readout: a monospace "instrument" box. */
  .control input[type="number"] {
    box-sizing: border-box; /* shadow DOM doesn't inherit the document's box-sizing reset, so set it
       here — else width:100% + padding + border overflows the grid cell and eats the panel padding */
    font-family: var(--primer-font-mono, monospace); font-size: 0.74rem; text-align: center;
    width: 100%; padding: 0.25rem 0.35rem; border-radius: 0.35rem;
    border: 1px solid var(--primer-control-border, #ccc);
    background: var(--primer-control-bg, #fff); color: var(--primer-ink, #111);
  }
  .control input[type="number"]:focus {
    outline: none; border-color: var(--primer-accent, #46e);
    box-shadow: 0 0 0 2px var(--primer-ring, rgba(70,90,230,0.5));
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
  .tick i { display: block; width: 1px; height: 5px; background: var(--primer-accent, #667); opacity: 0.55; }
  .tick b {
    font-family: var(--primer-font-mono, monospace); font-size: 0.65rem; font-weight: 400;
    line-height: 1; margin-top: 1px; color: var(--primer-ink-soft, #667); white-space: nowrap;
  }
  /* When labels would crowd, JS adds .sparse-labels — keep every tick MARK but show only every 2nd
     label (the first is kept; even-positioned labels are dropped). */
  .ticks.sparse-labels .tick:nth-child(even) b { display: none; }

  /* A "choice" control: a label and a segmented row of HUD chips (the selected one is lit). */
  .control.choice { grid-template-columns: minmax(6rem, auto) 1fr; }
  .segmented { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .segmented .seg {
    font-family: var(--primer-font-ui, sans-serif); font-size: 0.85rem;
    padding: 0.3rem 0.65rem; border-radius: 0.35rem; cursor: pointer;
    border: 1px solid var(--primer-control-border, #ccc);
    background: var(--primer-control-bg, #fff); color: var(--primer-ink, #111);
    transition: border-color 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease;
  }
  .segmented .seg:hover { border-color: var(--primer-accent, #46e); }
  .segmented .seg[aria-pressed="true"] {
    background: var(--primer-accent, #46e); color: var(--primer-accent-ink, #fff);
    border-color: transparent; box-shadow: 0 0 8px var(--primer-ring, rgba(70,90,230,0.6));
  }
  .segmented .seg:focus-visible {
    outline: none; border-color: var(--primer-accent, #46e);
    box-shadow: 0 0 0 2px var(--primer-ring, rgba(70,90,230,0.5)), 0 0 8px var(--primer-ring, rgba(70,90,230,0.4));
  }
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
  for (const d of defs) values[d.name] = initialValues?.[d.name] ?? d.value ?? d.min ?? 0;

  host.innerHTML = controlsHtml(defs, values);

  // Paint each range's lit fill (--fill, a 0–100% the track gradient reads) from its current value.
  /** @param {HTMLInputElement} input */
  const setFill = (input) => {
    const min = Number(input.min);
    const max = Number(input.max);
    const v = Number(input.value);
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    input.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct))}%`);
  };
  for (const r of host.querySelectorAll('input[type="range"]')) setFill(/** @type {HTMLInputElement} */ (r));

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
        value = snapToAnchor(value, p.anchors, (SNAP_PX / width) * ((p.max ?? 0) - (p.min ?? 0)));
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
    // Keep the lit fill in sync with the new value (whether typed or dragged).
    for (const r of host.querySelectorAll(`input[type="range"][data-name="${name}"]`)) {
      setFill(/** @type {HTMLInputElement} */ (r));
    }
    schedule();
  };
  host.addEventListener("input", onInput);

  // Segmented "choice" controls are buttons, not <input>s, so they report via click. The chosen
  // option's index becomes the control's (numeric) value, exactly like a slider position.
  /** @param {Event} e */
  const onClick = (e) => {
    const target = /** @type {Element | null} */ (e.target);
    const btn = /** @type {HTMLElement | null} */ (target?.closest?.('[data-role="choice"]') ?? null);
    if (!btn) return;
    const name = btn.dataset.name;
    const idx = Number(btn.dataset.index);
    if (!name || !Number.isFinite(idx)) return;
    values[name] = idx;
    for (const other of host.querySelectorAll(`.seg[data-name="${name}"]`)) {
      other.setAttribute("aria-pressed", String(other === btn));
    }
    schedule();
  };
  host.addEventListener("click", onClick);

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
      host.removeEventListener("click", onClick);
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
      // A "choice" control is a segmented row of buttons; its value is the selected option index.
      if (p.type === "choice") {
        const buttons = (p.options ?? [])
          .map(
            (opt, oi) =>
              `<button type="button" class="seg" data-name="${escapeHtml(p.name)}" data-role="choice"` +
              ` data-index="${oi}" aria-pressed="${oi === value}">${escapeHtml(opt)}</button>`,
          )
          .join("");
        return `
        <div class="control choice">
          <label>${label}</label>
          <div class="segmented" role="group" aria-label="${label}">${buttons}</div>
        </div>`;
      }
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
  const min = p.min ?? 0;
  const max = p.max ?? 0;
  const span = max - min;
  if (!Array.isArray(p.anchors) || !(span > 0)) return "";
  const ticks = p.anchors
    .filter((a) => Number.isFinite(a) && a >= min && a <= max)
    .map((a) => {
      const at = (a - min) / span;
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
