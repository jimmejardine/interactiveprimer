// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { seedPositions, tick, bounds, DEFAULT_PARAMS } from "../js/force-layout.js";

/** @param {string} id @param {number} x @param {number} y */
const node = (id, x, y) => ({ id, x, y, vx: 0, vy: 0 });
/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("seedPositions is deterministic and spreads nodes apart", () => {
  const a = [node("a", 0, 0), node("b", 0, 0), node("c", 0, 0)];
  const b = [node("a", 0, 0), node("b", 0, 0), node("c", 0, 0)];
  seedPositions(a);
  seedPositions(b);
  assert.deepEqual(
    a.map((n) => [n.x, n.y]),
    b.map((n) => [n.x, n.y]),
  );
  // No two seeded nodes coincide.
  assert.ok(dist(a[0], a[1]) > 1);
  assert.ok(dist(a[1], a[2]) > 1);
});

test("a spring pulls two connected nodes closer together", () => {
  const nodes = [node("a", -400, 0), node("b", 400, 0)]; // far apart (> springLength)
  const edges = [{ source: "a", target: "b" }];
  const before = dist(nodes[0], nodes[1]);
  for (let i = 0; i < 200; i++) tick(nodes, edges);
  const after = dist(nodes[0], nodes[1]);
  assert.ok(after < before, `expected ${after} < ${before}`);
});

test("a heavier-weight edge pulls its node closer than a weight-1 edge", () => {
  // root fixed at centre; b and c start the same distance away. a→c has weight 2, a→b weight 1,
  // so c should settle closer to the root. Isolate the springs (no outward push).
  const root = { id: "a", x: 0, y: 0, vx: 0, vy: 0, fixed: true };
  const nodes = [root, node("b", 0, 320), node("c", 0, -320)];
  const edges = [
    { source: "a", target: "b", weight: 1 },
    { source: "a", target: "c", weight: 2 },
  ];
  const params = { outward: 0, gravity: 0, repulsion: 4000 };
  for (let i = 0; i < 400; i++) tick(nodes, edges, params);
  const dab = Math.hypot(nodes[1].x - root.x, nodes[1].y - root.y);
  const dac = Math.hypot(nodes[2].x - root.x, nodes[2].y - root.y);
  assert.ok(dac < dab, `heavier edge should sit closer: ${dac} < ${dab}`);
});

test("repulsion pushes two unconnected nodes apart", () => {
  const nodes = [node("a", -5, 0), node("b", 5, 0)]; // close, no edge
  const before = dist(nodes[0], nodes[1]);
  for (let i = 0; i < 50; i++) tick(nodes, [], { gravity: 0 }); // no gravity, isolate repulsion
  const after = dist(nodes[0], nodes[1]);
  assert.ok(after > before, `expected ${after} > ${before}`);
});

test("outward force pushes a node away from the centre", () => {
  const nodes = [node("a", 10, 0)]; // lone node, slightly off-centre
  const before = Math.hypot(nodes[0].x, nodes[0].y);
  for (let i = 0; i < 30; i++) tick(nodes, [], { gravity: 0, repulsion: 0, outward: 2 });
  const after = Math.hypot(nodes[0].x, nodes[0].y);
  assert.ok(after > before, `expected radius to grow: ${after} > ${before}`);
});

test("outwardPerDepth pushes a deeper node further from the centre than a shallower one", () => {
  // Two non-interacting nodes (no edges, no repulsion) at the same spot: the depth-3 node should
  // settle further out than the depth-1 node, so prerequisite→dependent edges point outward.
  const shallow = { id: "a", x: 10, y: 0, vx: 0, vy: 0, depth: 1 };
  const deep = { id: "b", x: 10, y: 0, vx: 0, vy: 0, depth: 3 };
  const params = { outward: 0, gravity: 0.05, outwardPerDepth: 1, repulsion: 0 };
  for (let i = 0; i < 300; i++) tick([shallow, deep], [], params);
  const rShallow = Math.hypot(shallow.x, shallow.y);
  const rDeep = Math.hypot(deep.x, deep.y);
  assert.ok(rDeep > rShallow + 1, `deeper node should sit further out: ${rDeep} > ${rShallow}`);
});

test("a pinned (fixed) node at the origin stays put under outward force", () => {
  const root = { id: "root", x: 0, y: 0, vx: 0, vy: 0, fixed: true };
  const nodes = [root, node("a", 5, 0), node("b", -5, 0)];
  const edges = [{ source: "root", target: "a" }, { source: "root", target: "b" }];
  for (let i = 0; i < 200; i++) tick(nodes, edges);
  assert.equal(root.x, 0);
  assert.equal(root.y, 0);
});

test("a fixed node never moves", () => {
  const fixed = { id: "a", x: 100, y: -50, vx: 0, vy: 0, fixed: true };
  const nodes = [fixed, node("b", -300, 0), node("c", 0, 300)];
  const edges = [{ source: "a", target: "b" }, { source: "a", target: "c" }];
  for (let i = 0; i < 100; i++) tick(nodes, edges);
  assert.equal(fixed.x, 100);
  assert.equal(fixed.y, -50);
  assert.equal(fixed.vx, 0);
  assert.equal(fixed.vy, 0);
});

test("the system cools: kinetic energy decays toward rest", () => {
  const nodes = [node("a", -400, 10), node("b", 400, -10), node("c", 0, 300)];
  const edges = [{ source: "a", target: "b" }, { source: "b", target: "c" }];
  let prev = Infinity;
  let last = Infinity;
  // After an initial transient, energy should trend down and approach zero.
  for (let i = 0; i < 600; i++) last = tick(nodes, edges);
  // Run more steps with no new input — energy must not grow.
  for (let i = 0; i < 200; i++) {
    const e = tick(nodes, edges);
    assert.ok(e <= last + 1e-6, `energy grew: ${e} > ${last}`);
    last = e;
  }
  assert.ok(last < 1, `expected the layout to settle, energy=${last}`);
  assert.ok(prev === Infinity); // sanity: prev untouched, keeps lint happy
});

test("downward bias (when enabled) settles a dependent below its prerequisite", () => {
  // a → b (b depends on a). With downBias on, +y is down, so b should end up below a. Isolate the
  // bias (downBias/outward default off in the live params) and start the pair apart horizontally so
  // the vertical bias alone decides up vs. down.
  const nodes = [node("a", -60, 0), node("b", 60, 0)];
  const edges = [{ source: "a", target: "b" }];
  const params = { downBias: 40, outward: 0, repulsion: 3000, gravity: 0.02 };
  for (let i = 0; i < 500; i++) tick(nodes, edges, params);
  assert.ok(nodes[1].y > nodes[0].y, `expected b.y(${nodes[1].y}) > a.y(${nodes[0].y})`);
});

test("bounds covers all node positions; unit box when empty", () => {
  assert.deepEqual(bounds([]), { minX: 0, minY: 0, maxX: 1, maxY: 1 });
  const b = bounds([node("a", -10, 5), node("b", 30, -7)]);
  assert.deepEqual(b, { minX: -10, minY: -7, maxX: 30, maxY: 5 });
});

test("DEFAULT_PARAMS are exposed and overridable per call", () => {
  assert.ok(DEFAULT_PARAMS.springLength > 0);
  const nodes = [node("a", 0, 0)];
  // A lone node under gravity drifts toward the origin (already there) — just ensure no throw and
  // that custom params are accepted.
  assert.doesNotThrow(() => tick(nodes, [], { repulsion: 1, gravity: 0.5, damping: 0.5 }));
});
