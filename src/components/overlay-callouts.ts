/**
 * Layout for the fill-in boxes overlaid on a geometry problem.
 *
 * Isolated boxes stay on their angle / length. When several would pile up (a small
 * triangle, four angles at a crossing, …) they are pushed off the figure and the
 * renderer draws a leader line back to the mark so the learner can still tell
 * which box is which.
 *
 * Pure + DOM-free so the clustering / separation is unit-testable.
 * @module
 */

export interface CalloutAnchor {
  key: string;
  /** Preferred box centre (screen px) — usually the angle/length label point. */
  ax: number;
  ay: number;
  /** Mark the leader points at (the angle arc / side). Occupied-region for clearance. */
  ox?: number;
  oy?: number;
}

export interface CalloutPlacement {
  key: string;
  x: number;
  y: number;
  /** True when the box was moved far enough to need a leader line. */
  pulled: boolean;
}

export interface CalloutOpts {
  stageW: number;
  stageH: number;
  boxW: number;
  boxH: number;
  /** Min gap between box *edges* after placement. */
  gap?: number;
  /** Inset from the stage edge to a box centre. */
  pad?: number;
  /** Two anchors this close (centre-to-centre, px) form a crowded cluster. */
  clusterPx?: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Union-find clusters: anchors within `clusterPx` of each other (transitive). */
function clusters(anchors: CalloutAnchor[], clusterPx: number): CalloutAnchor[][] {
  const n = anchors.length;
  const parent = anchors.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.hypot(anchors[i].ax - anchors[j].ax, anchors[i].ay - anchors[j].ay) < clusterPx) {
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map<number, CalloutAnchor[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(anchors[i]);
    else groups.set(r, [anchors[i]]);
  }
  return [...groups.values()];
}

type Side = "top" | "right" | "bottom" | "left";

/** Park a crowded cluster as a row/column on the outward side of its marks. */
function placeCluster(
  group: CalloutAnchor[],
  all: CalloutAnchor[],
  opts: Required<Pick<CalloutOpts, "stageW" | "stageH" | "boxW" | "boxH">> & { pad: number },
  fit: (x: number, y: number) => [number, number],
  minDx: number,
  minDy: number,
): CalloutPlacement[] {
  const occX = (a: CalloutAnchor) => a.ox ?? a.ax;
  const occY = (a: CalloutAnchor) => a.oy ?? a.ay;
  const minX = Math.min(...group.map(occX));
  const maxX = Math.max(...group.map(occX));
  const minY = Math.min(...group.map(occY));
  const maxY = Math.max(...group.map(occY));
  // Outward = from the whole figure's centroid through this cluster, so a small
  // triangle on the right parks to the right — not back into the neighbouring figure.
  const gcx = all.reduce((s, a) => s + (a.ox ?? a.ax), 0) / all.length;
  const gcy = all.reduce((s, a) => s + (a.oy ?? a.ay), 0) / all.length;
  const ccx = group.reduce((s, a) => s + occX(a), 0) / group.length;
  const ccy = group.reduce((s, a) => s + occY(a), 0) / group.length;
  const ox = ccx - gcx;
  const oy = ccy - gcy;
  let side: Side;
  if (Math.hypot(ox, oy) < 24) {
    const spaces: Record<Side, number> = {
      left: minX - opts.pad,
      right: opts.stageW - opts.pad - maxX,
      top: minY - opts.pad,
      bottom: opts.stageH - opts.pad - maxY,
    };
    const pref: Record<Side, number> = { top: 3, right: 2, bottom: 1, left: 0 };
    side = (Object.keys(spaces) as Side[]).sort((a, b) => {
      const d = spaces[b] - spaces[a];
      if (Math.abs(d) > 40) return d;
      return pref[b] - pref[a];
    })[0];
  } else if (Math.abs(ox) >= Math.abs(oy)) {
    side = ox > 0 ? "right" : "left";
  } else {
    side = oy > 0 ? "bottom" : "top";
  }

  const n = group.length;
  const lift = Math.max(minDx, minDy) * 0.4 + 18;
  // Order by the *mark* the leader points at (not the piled-up box home), so
  // a vertical column matches top-to-bottom of the vertices and lines don't cross.
  if (side === "right" || side === "left") {
    const x = side === "right" ? maxX + lift : minX - lift;
    const ordered = group.slice().sort((a, b) => occY(a) - occY(b) || occX(a) - occX(b) || a.key.localeCompare(b.key));
    const lo = opts.pad + opts.boxH / 2;
    const hi = opts.stageH - opts.pad - opts.boxH / 2;
    const ys = spread(ordered.map(occY), minDy, lo, hi);
    return ordered.map((a, i) => {
      const [cx, cy] = fit(x, ys[i]);
      return { key: a.key, x: cx, y: cy, pulled: true };
    });
  }
  const y = side === "bottom" ? maxY + lift : minY - lift;
  const ordered = group.slice().sort((a, b) => occX(a) - occX(b) || occY(a) - occY(b) || a.key.localeCompare(b.key));
  const lo = opts.pad + opts.boxW / 2;
  const hi = opts.stageW - opts.pad - opts.boxW / 2;
  const xs = spread(ordered.map(occX), minDx, lo, hi);
  return ordered.map((a, i) => {
    const [cx, cy] = fit(xs[i], y);
    return { key: a.key, x: cx, y: cy, pulled: true };
  });
}

/** Push `targets` apart to a min gap, keeping order and staying as close as possible to each target. */
function spread(targets: number[], minGap: number, lo?: number, hi?: number): number[] {
  const ys = targets.slice();
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] < ys[i - 1] + minGap) ys[i] = ys[i - 1] + minGap;
  }
  if (lo != null && ys[0] < lo) {
    const d = lo - ys[0];
    for (let i = 0; i < ys.length; i++) ys[i] += d;
  }
  if (hi != null && ys.length && ys[ys.length - 1] > hi) {
    const d = ys[ys.length - 1] - hi;
    for (let i = 0; i < ys.length; i++) ys[i] -= d;
  }
  if (lo != null && ys[0] < lo) {
    for (let i = 0; i < ys.length; i++) ys[i] = lo + i * minGap;
  }
  return ys;
}

/**
 * Place each fill-in box. Crowded clusters are parked off the figure on the
 * roomiest side; a last pass separates leftover overlaps and clamps to the stage.
 */
export function layoutCallouts(anchors: CalloutAnchor[], opts: CalloutOpts): CalloutPlacement[] {
  const gap = opts.gap ?? 8;
  const pad = opts.pad ?? 12;
  const minDx = opts.boxW + gap;
  const minDy = opts.boxH + gap;
  const clusterPx = opts.clusterPx ?? Math.hypot(opts.boxW, opts.boxH) * 2.2;
  const minCX = pad + opts.boxW / 2;
  const maxCX = opts.stageW - pad - opts.boxW / 2;
  const minCY = pad + opts.boxH / 2;
  const maxCY = opts.stageH - pad - opts.boxH / 2;
  const fit = (x: number, y: number): [number, number] => [
    maxCX >= minCX ? clamp(x, minCX, maxCX) : opts.stageW / 2,
    maxCY >= minCY ? clamp(y, minCY, maxCY) : opts.stageH / 2,
  ];

  if (!anchors.length || opts.stageW < 1 || opts.stageH < 1) {
    return anchors.map((a) => ({ key: a.key, x: a.ax, y: a.ay, pulled: false }));
  }

  const placed: CalloutPlacement[] = [];
  for (const group of clusters(anchors, clusterPx)) {
    if (group.length === 1) {
      const a = group[0];
      const [x, y] = fit(a.ax, a.ay);
      placed.push({ key: a.key, x, y, pulled: Math.hypot(x - a.ax, y - a.ay) > 8 });
      continue;
    }
    placed.push(...placeCluster(group, anchors, { ...opts, pad }, fit, minDx, minDy));
  }

  // Clamping a ring onto a tight stage can restack boxes — push overlaps apart.
  for (let iter = 0; iter < 16; iter++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const ox = minDx - Math.abs(a.x - b.x);
        const oy = minDy - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        if (ox < oy) {
          const push = ox / 2 + 0.5;
          const s = a.x <= b.x ? -1 : 1;
          a.x += s * push;
          b.x -= s * push;
        } else {
          const push = oy / 2 + 0.5;
          const s = a.y <= b.y ? -1 : 1;
          a.y += s * push;
          b.y -= s * push;
        }
        moved = true;
      }
    }
    for (const p of placed) {
      const [x, y] = fit(p.x, p.y);
      if (x !== p.x || y !== p.y) {
        p.x = x;
        p.y = y;
        moved = true;
      }
    }
    if (!moved) break;
  }

  const home = new Map(anchors.map((a) => [a.key, a]));
  for (const p of placed) {
    const a = home.get(p.key);
    if (a) p.pulled = Math.hypot(p.x - a.ax, p.y - a.ay) > 8;
  }
  return placed;
}

/**
 * Line from a box centre to its mark, clipped so it starts at the box edge and
 * stops just short of the tip (where a dot is drawn). `null` if they're too close.
 */
export function leaderEndpoints(
  x: number,
  y: number,
  ax: number,
  ay: number,
  boxW: number,
  boxH: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = ax - x;
  const dy = ay - y;
  const dist = Math.hypot(dx, dy);
  if (dist < 6) return null;
  const hw = boxW / 2;
  const hh = boxH / 2;
  const tx = Math.abs(dx) < 1e-9 ? Infinity : hw / Math.abs(dx);
  const ty = Math.abs(dy) < 1e-9 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(tx, ty);
  const x1 = x + dx * t;
  const y1 = y + dy * t;
  const cut = Math.min(5, dist * 0.12);
  const x2 = ax - (dx / dist) * cut;
  const y2 = ay - (dy / dist) * cut;
  if (Math.hypot(x2 - x1, y2 - y1) < 4) return null;
  return { x1, y1, x2, y2 };
}
