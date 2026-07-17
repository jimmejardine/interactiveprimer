/**
 * A tiny spring-electrical force simulation for laying out the concept DAG — pure and DOM-free,
 * so it's unit-testable. The renderer (js/concept-graph.js) drives it on requestAnimationFrame
 * and paints the positions; this module only does the maths.
 *
 * Model: nodes repel each other (electrical), edges pull their endpoints together (springs), a
 * gentle gravity keeps the whole thing centred, and a mild downward bias makes a dependent settle
 * *below* its prerequisite so the DAG flows top-to-bottom. Velocities are damped each step, so the
 * system cools to rest — `tick` returns the total kinetic energy so a driver can stop when settled
 * and reheat on interaction.
 * @module
 */

export type LayoutNode = { id: string, x: number, y: number, vx: number, vy: number, fixed?: boolean, depth?: number, charge?: number };
// `depth` is a node's graph distance from the pinned root (root = 0); deeper nodes get more
// outward push (see `outwardPerDepth`), so prerequisite→dependent edges point radially outward.
// `charge` scales a node's repulsion (default 1; > 1 makes it shove harder — pairwise repulsion is
// multiplied by both endpoints' charges, so two high-charge nodes fly apart strongly).
export type LayoutEdge = { source: string, target: string, weight?: number };
// `weight` scales an edge's spring strength (default 1; > 1 pulls its endpoints harder).

export interface LayoutParams {
  /** Electrical repulsion strength between every node pair. */
  repulsion?: number;
  /** Rest length of an edge spring. */
  springLength?: number;
  /** Edge spring stiffness (0–1ish). */
  springK?: number;
  /** Inward pull toward the origin (∝ distance; a soft outer cap). */
  gravity?: number;
  /** Constant radial push away from the origin (hollows the centre). */
  outward?: number;
  /** Extra outward push per unit of a node's `depth` (radial layering). */
  outwardPerDepth?: number;
  /** Downward force on a dependent relative to its prerequisite. */
  downBias?: number;
  /** Velocity retained each step (0–1); lower = cools faster. */
  damping?: number;
  /** Max distance a node may move in one step (stability clamp). */
  maxStep?: number;
}

export const DEFAULT_PARAMS: Required<LayoutParams> = {
  repulsion: 45000,
  springLength: 180,
  springK: 0.06,
  gravity: 0.01, // gentle inward cap so the spread stays bounded…
  outward: 1.5, // …while this pushes nodes radially off the centre (root sits pinned at 0,0)
  outwardPerDepth: 0, // off by default; the explorer turns this on to splay deeper nodes outward
  downBias: 0, // off by default: the graph spreads evenly in every direction
  damping: 0.82,
  maxStep: 60,
};

/**
 * Deterministically seed node positions on a golden-angle spiral (no Math.random, so layouts are
 * reproducible and testable). Mutates each node's x/y/vx/vy.
 * @param nodes
 * @param spacing  Radial spacing between successive nodes.
 * @returns the same array, for chaining
 */
export function seedPositions(nodes: LayoutNode[], spacing: number = 36): LayoutNode[] {
  const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.399963 rad
  nodes.forEach((n, i) => {
    const r = spacing * Math.sqrt(i + 0.5);
    const a = i * GOLDEN;
    n.x = r * Math.cos(a);
    n.y = r * Math.sin(a);
    n.vx = 0;
    n.vy = 0;
  });
  return nodes;
}

/**
 * Advance the simulation by one step. Mutates node positions/velocities in place and returns the
 * total kinetic energy (Σ v²) afterwards — when it's near zero the layout has settled.
 * @returns total kinetic energy after the step
 */
export function tick(nodes: LayoutNode[], edges: LayoutEdge[], params: LayoutParams = {}): number {
  const p = { ...DEFAULT_PARAMS, ...params };
  const byId: Map<string, LayoutNode> = new Map(nodes.map((n) => [n.id, n]));

  // Accumulated force per node this step.
  const force: Map<LayoutNode, { fx: number, fy: number }> = new Map(nodes.map((n) => [n, { fx: 0, fy: 0 }]));

  // 1) Pairwise repulsion (O(n²) — fine for the graph sizes here).
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const fa = force.get(a) as { fx: number, fy: number };
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1e-6) {
        // Coincident nodes: nudge apart deterministically so they don't divide by ~0.
        dx = (i - j) * 0.01 + 0.01;
        dy = (i + j) * 0.01 + 0.01;
        d2 = dx * dx + dy * dy;
      }
      const inv = 1 / d2;
      const mag = p.repulsion * inv * (a.charge ?? 1) * (b.charge ?? 1);
      const dist = Math.sqrt(d2);
      const ux = dx / dist;
      const uy = dy / dist;
      const fb = force.get(b) as { fx: number, fy: number };
      fa.fx += ux * mag;
      fa.fy += uy * mag;
      fb.fx -= ux * mag;
      fb.fy -= uy * mag;
    }
  }

  // 2) Edge springs (Hooke toward springLength) + a downward bias pulling the target below source.
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    let dx = t.x - s.x;
    let dy = t.y - s.y;
    const dist = Math.hypot(dx, dy) || 1e-3;
    const stretch = dist - p.springLength;
    const mag = p.springK * stretch * (e.weight ?? 1); // heavier (explicit) edges pull harder
    const ux = dx / dist;
    const uy = dy / dist;
    const fs = force.get(s) as { fx: number, fy: number };
    const ft = force.get(t) as { fx: number, fy: number };
    fs.fx += ux * mag;
    fs.fy += uy * mag;
    ft.fx -= ux * mag;
    ft.fy -= uy * mag;
    // Downward bias: nudge the dependent below its prerequisite (+y is down).
    fs.fy -= p.downBias * 0.5;
    ft.fy += p.downBias * 0.5;
  }

  // 3) Centering gravity (inward, ∝ distance) + an outward radial push that GROWS with a node's
  //    depth from the root, so a deeper (successor) node sits further out than its predecessor and
  //    the edge between them points radially outward. With the root pinned at the origin these
  //    balance into a spread-out radial tree rather than a dense blob.
  for (const n of nodes) {
    const f = force.get(n) as { fx: number, fy: number };
    f.fx -= n.x * p.gravity;
    f.fy -= n.y * p.gravity;
    const ow = p.outward + p.outwardPerDepth * (n.depth ?? 0);
    if (ow) {
      const d = Math.hypot(n.x, n.y);
      if (d > 1e-3) {
        f.fx += (n.x / d) * ow;
        f.fy += (n.y / d) * ow;
      }
    }
  }

  // 4) Integrate (damped), skipping fixed nodes, with a per-step displacement clamp.
  let energy = 0;
  for (const n of nodes) {
    if (n.fixed) {
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    const f = force.get(n) as { fx: number, fy: number };
    n.vx = (n.vx + f.fx) * p.damping;
    n.vy = (n.vy + f.fy) * p.damping;
    let dx = n.vx;
    let dy = n.vy;
    const step = Math.hypot(dx, dy);
    if (step > p.maxStep) {
      const k = p.maxStep / step;
      dx *= k;
      dy *= k;
    }
    n.x += dx;
    n.y += dy;
    energy += n.vx * n.vx + n.vy * n.vy;
  }
  return energy;
}

/**
 * Axis-aligned bounding box of the nodes (for fit-to-view). Returns a unit box when empty.
 */
export function bounds(nodes: LayoutNode[]): { minX: number, minY: number, maxX: number, maxY: number } {
  if (!nodes.length) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  return { minX, minY, maxX, maxY };
}
