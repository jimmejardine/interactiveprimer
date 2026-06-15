// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { indexConcepts, neighborhood } from "../js/graph.js";

/** @param {Array<{id:string, prerequisites?:string[]}>} list */
const idx = (list) =>
  indexConcepts(list.map((c) => ({ title: c.id, prerequisites: [], ...c })));

/** Set of "a|b" edge keys for order-independent comparison.
 * @param {{a:string,b:string}[]} edges */
const edgeKeys = (edges) => new Set(edges.map((e) => `${e.a}|${e.b}`));

test("neighborhood returns null for an unknown id", () => {
  const byId = idx([{ id: "a" }]);
  assert.equal(neighborhood("missing", byId), null);
});

test("neighborhood of an isolated root has empty columns and no edges", () => {
  const byId = idx([{ id: "solo" }]);
  const n = neighborhood("solo", byId);
  assert.deepEqual(n?.predecessors, []);
  assert.deepEqual(n?.successors, []);
  assert.deepEqual(n?.peers, []);
  assert.deepEqual(n?.edges, []);
});

test("neighborhood shows only immediate predecessors/successors", () => {
  const byId = idx([
    { id: "counting", prerequisites: [] },
    { id: "addition", prerequisites: ["counting"] },
    { id: "pythagorean", prerequisites: ["addition"] },
  ]);

  const mid = neighborhood("addition", byId);
  assert.deepEqual(mid?.predecessors, ["counting"]);
  assert.deepEqual(mid?.successors, ["pythagorean"]);
  assert.deepEqual(mid?.peers, []); // no siblings/co-parents
  assert.deepEqual(edgeKeys(mid?.edges), new Set(["addition|counting", "addition|pythagorean"]));

  // counting's successor is ONLY addition — pythagorean is two hops away, not shown.
  const root = neighborhood("counting", byId);
  assert.deepEqual(root?.predecessors, []);
  assert.deepEqual(root?.successors, ["addition"]);
  assert.deepEqual(root?.peers, []);

  // pythagorean's predecessor is ONLY addition — counting is two hops away, not shown.
  const leaf = neighborhood("pythagorean", byId);
  assert.deepEqual(leaf?.predecessors, ["addition"]);
  assert.deepEqual(leaf?.successors, []);
  assert.deepEqual(leaf?.peers, []);
});

test("siblings: two concepts sharing a parent are peers of each other", () => {
  const byId = idx([
    { id: "p", prerequisites: [] },
    { id: "a", prerequisites: ["p"] },
    { id: "b", prerequisites: ["p"] },
  ]);
  const n = neighborhood("a", byId);
  assert.deepEqual(n?.predecessors, ["p"]);
  assert.deepEqual(n?.successors, []);
  assert.deepEqual(n?.peers, ["b"]); // sibling under p
  // a connects to its parent p; the peer b connects to the shared parent p.
  assert.deepEqual(edgeKeys(n?.edges), new Set(["a|p", "b|p"]));
});

test("diamond: the other middle node is a peer, all four edges drawn", () => {
  const byId = idx([
    { id: "top", prerequisites: [] },
    { id: "left", prerequisites: ["top"] },
    { id: "right", prerequisites: ["top"] },
    { id: "bottom", prerequisites: ["left", "right"] },
  ]);
  const n = neighborhood("left", byId);
  assert.deepEqual(n?.predecessors, ["top"]);
  assert.deepEqual(n?.successors, ["bottom"]);
  assert.deepEqual(n?.peers, ["right"]); // co-parent of bottom, sibling under top
  assert.deepEqual(
    edgeKeys(n?.edges),
    new Set(["left|top", "right|top", "bottom|left", "bottom|right"]),
  );
});

test("a peer that is also a direct successor is not double-listed", () => {
  // b is both a sibling of a (under p) AND a direct successor of a — successor wins.
  const byId = idx([
    { id: "p", prerequisites: [] },
    { id: "a", prerequisites: ["p"] },
    { id: "b", prerequisites: ["p", "a"] },
  ]);
  const n = neighborhood("a", byId);
  assert.deepEqual(n?.successors, ["b"]);
  assert.deepEqual(n?.peers, []); // b excluded from peers because it's a direct successor
});

test("edges are undirected, deduped, and never self-referential", () => {
  const byId = idx([
    { id: "p", prerequisites: [] },
    { id: "a", prerequisites: ["p"] },
    { id: "b", prerequisites: ["p"] },
  ]);
  const n = neighborhood("a", byId);
  for (const e of n?.edges ?? []) {
    assert.notEqual(e.a, e.b);
    assert.ok(e.a < e.b, "edge endpoints should be ordered a < b");
  }
  assert.equal(new Set((n?.edges ?? []).map((e) => `${e.a}|${e.b}`)).size, n?.edges.length);
});

test("neighborhood uses a precomputed successors field when present", () => {
  // No prerequisites anywhere, but successors say x → y. Descendants must follow them.
  const byId = indexConcepts(
    /** @type {any} */ ([
      { id: "x", title: "X", prerequisites: [], successors: ["y"] },
      { id: "y", title: "Y", prerequisites: [], successors: [] },
    ]),
  );
  const n = neighborhood("x", byId);
  assert.deepEqual(n?.successors, ["y"]);
});
