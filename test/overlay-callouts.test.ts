import test from "node:test";
import assert from "node:assert/strict";
import { layoutCallouts, leaderEndpoints } from "../src/components/overlay-callouts.ts";
import { makeRng } from "../src/rng.ts";
import { SCAFFOLDS, anglePos, lengthPos } from "../src/geometry-engine/scaffolds.ts";

const box = { stageW: 800, stageH: 450, boxW: 30, boxH: 16, gap: 8 };

test("isolated boxes stay on their anchors", () => {
  const out = layoutCallouts(
    [
      { key: "A", ax: 120, ay: 200 },
      { key: "B", ax: 620, ay: 200 },
    ],
    box,
  );
  assert.equal(out.length, 2);
  const a = out.find((p) => p.key === "A")!;
  const b = out.find((p) => p.key === "B")!;
  assert.equal(a.pulled, false);
  assert.equal(b.pulled, false);
  assert.ok(Math.hypot(a.x - 120, a.y - 200) < 1);
  assert.ok(Math.hypot(b.x - 620, b.y - 200) < 1);
});

test("a pile of boxes at one vertex is fanned out with leaders", () => {
  const out = layoutCallouts(
    [
      { key: "ur", ax: 400, ay: 220 },
      { key: "ul", ax: 404, ay: 218 },
      { key: "ll", ax: 398, ay: 224 },
      { key: "lr", ax: 402, ay: 226 },
    ],
    box,
  );
  assert.ok(out.every((p) => p.pulled), "every stacked box should be pulled off the vertex");
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const dx = Math.abs(out[i].x - out[j].x);
      const dy = Math.abs(out[i].y - out[j].y);
      assert.ok(
        dx >= box.boxW + box.gap - 0.5 || dy >= box.boxH + box.gap - 0.5,
        `${out[i].key} still overlaps ${out[j].key} (${dx.toFixed(1)}, ${dy.toFixed(1)})`,
      );
    }
  }
});

test("pulled boxes stay inside the stage padding", () => {
  const out = layoutCallouts(
    [
      { key: "a", ax: 790, ay: 20 },
      { key: "b", ax: 788, ay: 22 },
      { key: "c", ax: 792, ay: 18 },
    ],
    box,
  );
  const pad = 12;
  for (const p of out) {
    assert.ok(p.x >= pad + box.boxW / 2 - 0.01, `${p.key} x ${p.x} left of pad`);
    assert.ok(p.x <= box.stageW - pad - box.boxW / 2 + 0.01, `${p.key} x ${p.x} right of pad`);
    assert.ok(p.y >= pad + box.boxH / 2 - 0.01, `${p.key} y ${p.y} above pad`);
    assert.ok(p.y <= box.stageH - pad - box.boxH / 2 + 0.01, `${p.key} y ${p.y} below pad`);
  }
});

test("a vertical column follows the marks' top-to-bottom order, not the piled-up homes", () => {
  // Homes sit on top of each other (the small-triangle collapse); the marks they
  // refer to are a clear top / mid / bottom. Boxes must come out in that order.
  const out = layoutCallouts(
    [
      { key: "bot", ax: 400, ay: 200, ox: 360, oy: 320 },
      { key: "top", ax: 402, ay: 198, ox: 350, oy: 80 },
      { key: "mid", ax: 401, ay: 201, ox: 355, oy: 200 },
    ],
    { ...box, clusterPx: 50 },
  );
  const top = out.find((p) => p.key === "top")!;
  const mid = out.find((p) => p.key === "mid")!;
  const bot = out.find((p) => p.key === "bot")!;
  assert.ok(top.y < mid.y, `top box y=${top.y} should sit above mid y=${mid.y}`);
  assert.ok(mid.y < bot.y, `mid box y=${mid.y} should sit above bot y=${bot.y}`);
});

test("leaderEndpoints starts at the box edge and aims at the tip", () => {
  const ep = leaderEndpoints(100, 100, 200, 100, 30, 16);
  assert.ok(ep);
  assert.ok(Math.abs(ep.x1 - 115) < 0.01, `expected box-edge x1=115, got ${ep.x1}`);
  assert.equal(ep.y1, 100);
  assert.ok(ep.x2 < 200 && ep.x2 > 180, "should stop just short of the tip");
  assert.equal(leaderEndpoints(100, 100, 101, 100, 30, 16), null);
});

test("similarPair: the small triangle's blanks fan out instead of stacking", () => {
  const ux = 80;
  const uy = 80;
  const ox = 420;
  const oy = 280;
  const toScreen = (p: [number, number]) => ({ ax: ox + p[0] * ux, ay: oy - p[1] * uy });
  const smallKeys = new Set(["D", "E", "F", "DE", "DF", "EF"]);
  const largeKeys = new Set(["A", "B", "C", "AB", "AC", "BC"]);
  for (let seed = 0; seed < 12; seed++) {
    const fig = SCAFFOLDS.similarPair(makeRng(seed));
    const anchors = [
      ...fig.angles.map((a) => {
        const home = toScreen(anglePos(fig, a));
        const tip = toScreen(anglePos(fig, a, 0.4));
        return { key: a.key, ...home, ox: tip.ax, oy: tip.ay };
      }),
      ...(fig.lengths ?? []).map((L) => {
        const home = toScreen(lengthPos(fig, L));
        return { key: L.key, ...home, ox: home.ax, oy: home.ay };
      }),
    ];
    const out = layoutCallouts(anchors, { ...box, clusterPx: 0.85 * ux });
    const small = out.filter((p) => smallKeys.has(p.key));
    const largePulled = out.filter((p) => largeKeys.has(p.key) && p.pulled);
    assert.equal(small.length, 6);
    assert.ok(
      small.filter((p) => p.pulled).length >= 4,
      `seed ${seed}: expected the small triangle's crowded blanks to be pulled, got ${small.filter((p) => p.pulled).map((p) => p.key)}`,
    );
    assert.ok(
      largePulled.length <= 1,
      `seed ${seed}: large triangle should stay on-figure, pulled ${largePulled.map((p) => p.key)}`,
    );
    const smallTips = anchors.filter((a) => smallKeys.has(a.key));
    const smallRight = Math.max(...smallTips.map((a) => a.ox ?? a.ax));
    const pulledSmall = out.filter((p) => smallKeys.has(p.key) && p.pulled);
    assert.ok(
      pulledSmall.every((p) => p.x > smallRight - 8),
      `seed ${seed}: pulled small-triangle boxes should sit to the right of the triangle, got ${pulledSmall.map((p) => `${p.key}@${p.x.toFixed(0)}`)} vs edge ${smallRight.toFixed(0)}`,
    );
    const tipY = new Map(anchors.map((a) => [a.key, a.oy ?? a.ay]));
    const byBox = pulledSmall.slice().sort((a, b) => a.y - b.y);
    for (let i = 1; i < byBox.length; i++) {
      assert.ok(
        (tipY.get(byBox[i].key) ?? 0) >= (tipY.get(byBox[i - 1].key) ?? 0) - 0.5,
        `seed ${seed}: boxes ${byBox[i - 1].key} then ${byBox[i].key} invert their marks`,
      );
    }
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const dx = Math.abs(out[i].x - out[j].x);
        const dy = Math.abs(out[i].y - out[j].y);
        assert.ok(
          dx >= box.boxW + box.gap - 0.5 || dy >= box.boxH + box.gap - 0.5,
          `seed ${seed}: ${out[i].key} overlaps ${out[j].key}`,
        );
      }
    }
  }
});
