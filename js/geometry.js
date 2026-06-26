// @ts-check
/**
 * Pure-ish helpers for the `<primer-geometry>` waypoint timeline.
 *
 * The timeline model is **build-all, reveal-by-threshold**: the geometry builder creates every
 * element up front, and each `step(caption, drawFn)` tags the elements that step created. The
 * timeline state is one integer `current` (= number of revealed steps, 0…stepCount); a step `i` is
 * visible iff `i < current`. Stepping forward/back/jumping is then just changing `current` and
 * re-applying visibility — idempotent, no undo bookkeeping.
 *
 * These helpers are DOM-free (they only call `el.setAttribute`, easily mocked) so they unit-test.
 * @module
 */

/**
 * Clamp a step index to the valid range [0, stepCount].
 * @param {number} n
 * @param {number} stepCount
 * @returns {number}
 */
export function clampStep(n, stepCount) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(stepCount, Math.round(n)));
}

/**
 * @typedef {{ el: any, vis: boolean }} StepEl  An element + the visibility the author gave it at
 *   creation (so a deliberately-hidden helper — e.g. a line's auto-endpoint, or an invisible
 *   construction point — is NOT forced visible when its step is revealed).
 * @typedef {{ caption: string, els: StepEl[] }} Waypoint
 */

/**
 * Read an element's intended visibility (JSXGraph stores it on `visProp.visible`); defaults true.
 * @param {any} el
 * @returns {boolean}
 */
function intendedVisible(el) {
  return el?.visProp ? el.visProp.visible !== false : true;
}

/**
 * A waypoint collector over a JSXGraph board. `step(caption, drawFn)` runs `drawFn` immediately and
 * records the elements it created — by diffing `board.objectsList` before/after — together with the
 * caption and each element's intended visibility. Elements created OUTSIDE any `step()`
 * (before/between calls) are "base": never recorded, so they stay as drawn at every step.
 * @param {{ objectsList: any[] }} board
 * @returns {{ step: (caption: string, drawFn: () => void) => void, steps: Waypoint[] }}
 */
export function createStepCollector(board) {
  /** @type {Waypoint[]} */
  const steps = [];
  /** @param {string} caption @param {() => void} drawFn */
  const step = (caption, drawFn) => {
    const before = board.objectsList.length;
    drawFn();
    const els = board.objectsList.slice(before).map((el) => ({ el, vis: intendedVisible(el) }));
    steps.push({ caption, els });
  };
  return { step, steps };
}

/**
 * Apply the reveal-by-threshold rule: step `i` is revealed iff `i < current`. A revealed element is
 * shown only to its *intended* visibility (so endpoints/helpers an author created hidden stay
 * hidden); a not-yet-revealed step's elements are hidden. The caller calls `board.update()` after.
 * @param {Waypoint[]} steps
 * @param {number} current
 */
export function applyStepVisibility(steps, current) {
  steps.forEach((s, i) => {
    const reveal = i < current;
    for (const { el, vis } of s.els) el.setAttribute?.({ visible: reveal && vis });
  });
}

/* ------------------------------------------------------------------ */
/* Pure math for the geometry TOOLS (js/geometry-tools.js binds these to a board). */
/* ------------------------------------------------------------------ */

/** @typedef {[number, number]} Vec */

/**
 * The stroke segments for `count` "parallel-mark" arrowhead chevrons (`›`, `››`, …) centred on
 * `(x, y)` and pointing ALONG the unit vector `along` — a chevron is the arrowHEAD only (two short
 * strokes meeting at a tip), with no shaft. Multiple chevrons stack behind the tip (`»`). Returns two
 * segments per chevron.
 * @param {number} x @param {number} y @param {Vec} along
 * @param {number} [count]
 * @param {{ len?: number, gap?: number, spread?: number }} [opts]
 * @returns {[Vec, Vec][]}
 */
export function chevronArrowheads(x, y, along, count = 1, { len = 0.2, gap = 0.16, spread = 0.6 } = {}) {
  const [ax, ay] = along;
  const m = Math.hypot(ax, ay) || 1;
  const ux = ax / m;
  const uy = ay / m;
  const px = -uy; // perpendicular
  const py = ux;
  /** @type {[Vec, Vec][]} */
  const out = [];
  for (let k = 0; k < count; k++) {
    const cx = x - ux * (k * gap); // stack successive chevrons behind the tip
    const cy = y - uy * (k * gap);
    /** @type {Vec} */
    const tip = [cx + ux * (len / 2), cy + uy * (len / 2)];
    const bx = cx - ux * (len / 2);
    const by = cy - uy * (len / 2);
    out.push([tip, [bx + px * len * spread, by + py * len * spread]]);
    out.push([tip, [bx - px * len * spread, by - py * len * spread]]);
  }
  return out;
}

/**
 * The `[start, end]` segments for `count` equal-length "tick" hatches centred on `(mx, my)` — the
 * midpoint of a side — drawn PERPENDICULAR to the side's unit direction `along`. Each hatch is `2*d`
 * long; multiple hatches are spaced `gap` apart along the side (so a double tick reads as ‖). This is
 * the congruent-sides mark (one/two/three ticks for distinct equal groups).
 * @param {number} mx @param {number} my @param {Vec} along  Unit vector ALONG the side.
 * @param {number} [count]
 * @param {{ d?: number, gap?: number }} [opts]
 * @returns {[Vec, Vec][]}
 */
export function tickSegments(mx, my, along, count = 1, { d = 0.16, gap = 0.12 } = {}) {
  const [ax, ay] = along;
  const m = Math.hypot(ax, ay) || 1;
  const ux = ax / m;
  const uy = ay / m;
  const px = -uy; // perpendicular (the hatch direction)
  const py = ux;
  /** @type {[Vec, Vec][]} */
  const out = [];
  for (let k = 0; k < count; k++) {
    const off = (k - (count - 1) / 2) * gap;
    const cx = mx + ux * off;
    const cy = my + uy * off;
    out.push([
      [cx - px * d, cy - py * d],
      [cx + px * d, cy + py * d],
    ]);
  }
  return out;
}

/**
 * Geometry for an equal-angle arc mark at a vertex `V` between rays toward `P1` and `P2`. Returns the
 * `count` concentric arc radii (a single/double/triple arc marks distinct equal-angle groups) and the
 * point on the bisector at `labelR` where an angle label sits. The angles are returned as the
 * JSXGraph-friendly bounding directions so the caller can draw `arc`/`sector` elements.
 * @param {Vec} V @param {Vec} P1 @param {Vec} P2
 * @param {number} [count]
 * @param {{ r?: number, gap?: number, labelR?: number }} [opts]
 * @returns {{ radii: number[], bisector: Vec, labelAt: Vec }}
 */
export function angleArcSpec(V, P1, P2, count = 1, { r = 0.5, gap = 0.12, labelR = 0.8 } = {}) {
  /** @param {Vec} P @returns {Vec} */
  const dir = (P) => {
    const dx = P[0] - V[0];
    const dy = P[1] - V[1];
    const m = Math.hypot(dx, dy) || 1;
    return [dx / m, dy / m];
  };
  const a = dir(P1);
  const b = dir(P2);
  // Bisector of the (smaller) angle between the two rays.
  let bx = a[0] + b[0];
  let by = a[1] + b[1];
  const bm = Math.hypot(bx, by);
  if (bm < 1e-9) {
    // Rays are opposite — bisector is perpendicular to a.
    bx = -a[1];
    by = a[0];
  } else {
    bx /= bm;
    by /= bm;
  }
  const radii = [];
  for (let k = 0; k < count; k++) radii.push(r + k * gap);
  return {
    radii,
    bisector: [bx, by],
    labelAt: [V[0] + bx * labelR, V[1] + by * labelR],
  };
}

/**
 * Screen quadrant a direction points into: "ur" (x+,y+), "ul" (x−,y+), "ll" (x−,y−), "lr" (x+,y−).
 * JSXGraph user coords have y pointing UP, so this matches what the eye sees. Boundary angles round
 * up into the next CCW quadrant.
 * @param {number} angleRad
 * @returns {"ur"|"ul"|"ll"|"lr"}
 */
export function quadrantOf(angleRad) {
  let deg = ((angleRad * 180) / Math.PI) % 360;
  if (deg < 0) deg += 360;
  if (deg < 90) return "ur";
  if (deg < 180) return "ul";
  if (deg < 270) return "ll";
  return "lr";
}

/**
 * The four angles around a crossing of two lines (directions `dirA`, `dirB`). Splits the plane by the
 * four rays ±dirA / ±dirB, pairs adjacent rays into wedges, and tags each wedge with its bisector and
 * the screen quadrant ("ul"/"ur"/"ll"/"lr") the bisector points into — so a caller can place a label
 * or fill an angle "by corner". For two distinct lines the four corners are distinct.
 * @param {Vec} dirA @param {Vec} dirB
 * @returns {{ corner: "ur"|"ul"|"ll"|"lr", bisector: Vec, rays: [Vec, Vec] }[]}
 */
export function quadrantWedges(dirA, dirB) {
  /** @param {Vec} v @returns {Vec} */
  const norm = ([x, y]) => {
    const m = Math.hypot(x, y) || 1;
    return [x / m, y / m];
  };
  const a = norm(dirA);
  const b = norm(dirB);
  /** @type {Vec[]} */
  const rays = [a, [-a[0], -a[1]], b, [-b[0], -b[1]]];
  /** @param {Vec} v */
  const angOf = ([x, y]) => {
    let d = (Math.atan2(y, x) * 180) / Math.PI;
    if (d < 0) d += 360;
    return d;
  };
  const sorted = rays.map((r) => ({ r, a: angOf(r) })).sort((p, q) => p.a - q.a);
  const out = [];
  for (let i = 0; i < 4; i++) {
    const cur = sorted[i];
    const nxt = sorted[(i + 1) % 4];
    const a1 = cur.a;
    const a2 = nxt.a < a1 ? nxt.a + 360 : nxt.a;
    const mid = ((a1 + a2) / 2) % 360;
    const midRad = (mid * Math.PI) / 180;
    out.push({
      corner: quadrantOf(midRad),
      bisector: /** @type {Vec} */ ([Math.cos(midRad), Math.sin(midRad)]),
      rays: /** @type {[Vec, Vec]} */ ([cur.r, nxt.r]),
    });
  }
  return out;
}
