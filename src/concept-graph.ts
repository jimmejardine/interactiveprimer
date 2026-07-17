/**
 * Renders the whole concept DAG as an SVG force-directed graph and wires up interaction
 * (drag-to-rearrange, pan, zoom, click-to-open). The layout maths live in src/force-layout.ts;
 * this module is the DOM/SVG/rAF/pointer shell. Colours come from the theme (themeColors) and the
 * learner's confidence (confidenceColor), and re-paint on `theme-change` / `confidence-change` —
 * mirroring src/components/primer-pathway.ts.
 * @module
 */

import type { ResolvedConcept } from "./types/domain.ts";

import { seedPositions, tick, bounds } from "./force-layout.ts";
import { themeColors } from "./theme.ts";
import { confidenceColor } from "./confidence-color.ts";
import { mountConceptSearch, mountCourseSearch, SEARCH_BOX_CSS } from "./concept-search-box.ts";
import { createContextMenu } from "./context-menu.ts";
import { t } from "./i18n.ts";
import { getCurrentCourse, setCurrentCourse } from "./course.ts";
import { buildDependents, directNeighbors, kHopNeighborhood } from "./graph.ts";
import { mk, clamp } from "./svg-util.ts";
// Defines <primer-math> on this page (concepts.html doesn't load boot.js) so a node with a math
// title can typeset inside a <foreignObject>. concepts.html supplies the KaTeX CSS + import map.
import "./components/primer-math.ts";

const ENERGY_MIN = 0.04; // below this the layout is "settled" and the rAF loop pauses
const PREWARM = 320; // synchronous ticks before first paint, so the graph opens tidy
const CLICK_PX = 4; // pointer travel under this (screen px) counts as a click, not a drag
const PAD_X = 12, PAD_Y = 7, EDGE_GAP = 4; // node text padding; gap between an edge end and a node
const LABEL_MAXW = 120, LINE_H = 15; // wrap node labels to this width (px); line height
const SHIELD = 18, SHIELD_GAP = 5; // course-page crest: size (px) + gap to the label (see buildNodeDom)
const EXPLICIT_WEIGHT = 2.2; // spring strength for an explicit (concept-meta) prerequisite edge
const IMPLICIT_WEIGHT = 0.3; // a much weaker pull for an implicit edge (only a prose <primer-ref>)
// A course's own edges dominate the layout: members shove each other a bit harder apart (charge)
// while the gold edges between them pull harder together, so the course tends toward a clean linear
// spine with its prerequisite foundations off to the side. Kept moderate so the layout still SETTLES
// — too stiff a spring (or too high a charge) makes the explicit-Euler integrator oscillate forever.
const COURSE_EDGE_WEIGHT = 3.4; // spring strength for a member→member (gold) course edge (> explicit's 2.2)
const COURSE_CHARGE = 1.7; // repulsion multiplier on a course-member node (shoves ancestors off the spine)
const COURSE_GAP = 95; // vertical centre-to-centre spacing of pinned course members (the spine)
const LAYOUT = { outwardPerDepth: 0.45 }; // extra outward push per depth level → edges fan outward

/**
 * Word-wrap an SVG <text> label into vertically-centred <tspan> lines that each fit `maxWidth` px.
 * The element must already be in the DOM (so glyph widths resolve). Returns the line count.
 */
function wrapLabel(textEl: SVGElement, label: string, maxWidth: number, lineH: number = LINE_H) {
  const words = String(label).split(/\s+/).filter(Boolean);
  textEl.textContent = "";
  const ruler = (mk("tspan") as unknown as SVGTextContentElement);
  textEl.appendChild(ruler);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    ruler.textContent = test;
    if (cur && ruler.getComputedTextLength() > maxWidth) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  if (!lines.length) lines.push(String(label));

  textEl.textContent = "";
  const top = -((lines.length - 1) * lineH) / 2; // centre the block on the node's middle
  lines.forEach((ln, i) => {
    const ts = mk("tspan", { x: 0, dy: i === 0 ? top : lineH });
    ts.textContent = ln;
    textEl.appendChild(ts);
  });
  return lines.length;
}

/** Read the current theme's surface/border tokens alongside themeColors(). */
function palette() {
  const tc = themeColors();
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return { ink: tc.ink, line: tc.line, surface: get("--primer-surface", "#fff"), border: get("--primer-border", "#ccc"), course: get("--primer-course", "#e3b15c") };
}

/**
 * Mount the concept graph into `host` (a block element that has a real height). Returns a handle
 * with `destroy()` to tear down listeners and the animation loop.
 *
 * `focusId` (optional): centre the map on this concept (the fixed/bold node) instead of `root`.
 * An absent or unknown id falls back to `root` — the default, unchanged behaviour.
 */
export function mountConceptGraph(host: HTMLElement, { byId, locale, focusId }: { byId: Map<string, ResolvedConcept>, locale: string, focusId?: string }): { destroy: () => void } {
  const titleOf = (id: string) => {
    const c = byId.get(id);
    return c?.titles?.[locale] ?? c?.title ?? (id.split("/").pop() ?? id);
  };
  // The raw title markup for a math title — but only when we're showing the English title (a
  // translated, plain title takes precedence). Drives the foreignObject path below.
  const titleHtmlOf = (id: string) => {
    const c = byId.get(id);
    return c?.titleHtml && !c?.titles?.[locale] ? c.titleHtml : null;
  };

  // Progressive disclosure: instead of rendering the whole DAG, we start from a small SEED set and
  // let clicks expand outward. The seed depends on context (the same three cases that pick the
  // centre): an active course's member line, a focused concept, or the root — plus everything within
  // SEED_HOPS of it. `visible` is the live set of shown ids; `byId` is the full graph behind it.
  const activeCourse = getCurrentCourse();
  const courseNode = activeCourse ? byId.get(activeCourse) : undefined;
  // The course as an ORDERED list, STARTING WITH THE COURSE PAGE ITSELF, then the concepts it links —
  // a linear, non-cyclic spine. The gold "course edges" are the consecutive links of this sequence
  // (member[i]→member[i+1]); the members are pinned into a vertical column in this order, top→bottom.
  // (Built defensively so it's hub-first whether or not dist/graph.json already prepends the hub.)
  const orderedMembers = courseNode
    ? [activeCourse, ...(courseNode.courseMembers ?? []).filter((id) => id !== activeCourse)]
    : [];
  const courseMembers = new Set(orderedMembers); // tinted gold + pinned into the spine (incl. the hub, first)

  // Whole-graph adjacency (for seeding + expand/collapse), computed once.
  const dependents = buildDependents(byId);
  /** predecessors ∪ successors (both directions), known only */
  const directNbrs = (id: string): string[] => directNeighbors(id, byId, dependents);

  const SEED_HOPS = 2; // the starting view shows the seed + everything within this many hops
  const seedIds = activeCourse
    ? [activeCourse, ...orderedMembers] // the whole course line
    : focusId && byId.has(focusId)
      ? [focusId] // a focused concept
      : ["root"]; // default: the tree's root
  const seedSet = new Set(seedIds.filter((id) => byId.has(id))); // never collapsed away
  /** the live set of shown concept ids */
  const visible: Set<string> = kHopNeighborhood(seedIds, byId, SEED_HOPS, dependents);

  // The concept pinned at the centre (bold, larger). Prefer the focus, else root, else the course hub.
  const centerId = focusId && visible.has(focusId) ? focusId : visible.has("root") ? "root" : activeCourse || [...visible][0] || "root";

  // ---- model: layout nodes (built incrementally) + directed prerequisite→dependent edges ----
  type GNode = { id: string, x: number, y: number, vx: number, vy: number, fixed?: boolean, pinned?: boolean, depth?: number, charge?: number, hw: number, hh: number, g: SVGGElement, rect: SVGElement, text?: SVGElement, fo?: SVGElement, div?: HTMLElement, badge?: SVGGElement, badgeText?: SVGElement };
  const nodes: GNode[] = [];
  const nodeById: Map<string, GNode> = new Map();
  const edges: { source: string, target: string, explicit: boolean, course: boolean, weight: number, line: SVGElement }[] = [];
  /** edge DOM deduped by unordered pair */
  const edgeKeys: Set<string> = new Set();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  // The gold course spine: consecutive member→member links draw gold and supersede a prereq edge there.
  const chainMembers = orderedMembers.filter((id) => visible.has(id));
  const coursePairs = new Set(chainMembers.slice(1).map((id, i) => pairKey(chainMembers[i], id)));

  // ---- SVG scaffold ----
  host.replaceChildren();
  injectStyleOnce();
  const svg = (mk("svg", { class: "cg-svg" }) as SVGSVGElement);
  const defs = mk("defs");
  const marker = mk("marker", {
    id: "cg-arrow", viewBox: "0 0 10 10", refX: "9", refY: "5",
    markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse",
  });
  const arrowPath = mk("path", { d: "M0,0 L10,5 L0,10 z" });
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  // A second, gold arrowhead for course edges (its fill is set to --primer-course in paint()).
  const markerCourse = mk("marker", {
    id: "cg-arrow-course", viewBox: "0 0 10 10", refX: "9", refY: "5",
    markerWidth: "3.5", markerHeight: "3.5", orient: "auto-start-reverse", // half the standard arrowhead
  });
  const arrowPathCourse = mk("path", { d: "M0,0 L10,5 L0,10 z" });
  markerCourse.appendChild(arrowPathCourse);
  defs.appendChild(markerCourse);
  const viewport = (mk("g", { class: "cg-viewport" }) as SVGGElement);
  const edgesG = mk("g", { class: "cg-edges" });
  const nodesG = mk("g", { class: "cg-nodes" });
  viewport.append(edgesG, nodesG);
  svg.append(defs, viewport);
  host.appendChild(svg);

  // When a course is active, name it in gold at the bottom-centre of the canvas. host is positioned
  // (concepts.html: position:fixed), so this absolutely-positioned child anchors to it; it's cleared
  // with the rest of host on a course-change rebuild.
  if (activeCourse) {
    const banner = document.createElement("div");
    banner.className = "cg-course-banner";
    banner.textContent = `${t("course.filtered")} ${titleOf(activeCourse)}`;
    host.appendChild(banner);
  }

  // ---- per-element paint (theme + confidence + course outline); the whole-graph paint() loops these ----
  const paintNode = (n: GNode, c: ReturnType<typeof palette>) => {
    // A course member keeps its CONFIDENCE fill (so the learner's star progress still shows) and is
    // marked instead by a gold OUTLINE (stroke); non-members keep the normal border.
    n.rect.setAttribute("fill", confidenceColor(n.id) ?? c.surface);
    n.rect.setAttribute("stroke", courseMembers.has(n.id) ? c.course : c.border);
    // SVG text colours via `fill`; a foreignObject HTML label (incl. KaTeX) via CSS `color`.
    if (n.div) n.div.style.color = c.ink;
    else n.text?.setAttribute("fill", c.ink);
  };
  const paintEdge = (e: (typeof edges)[number], c: ReturnType<typeof palette>) => {
    // An edge linking two course members is drawn in the course colour (gold), so the course's
    // internal spine stands out from the prerequisite foundations beneath it.
    e.line.setAttribute("stroke", e.course ? c.course : c.line);
    e.line.setAttribute("stroke-opacity", e.course ? "0.95" : e.explicit ? "0.5" : "0.28");
  };

  // ---- build one node's DOM (label + pill, measured) and its hidden "+N" expand badge ----
  const buildNodeDom = (n: GNode) => {
    const g = (mk("g", { class: "cg-node" }) as SVGGElement);
    g.setAttribute("data-id", n.id);
    const isCourse = byId.get(n.id)?.course === true; // a course PAGE → gets the gold crest inside the pill
    if (n.id === centerId) g.classList.add("cg-node--root"); // bigger, bold central node
    if (courseMembers.has(n.id)) g.classList.add("cg-node--course"); // gold outline (stroke set in paint)
    const rect = mk("rect", { rx: "10", ry: "10" });
    g.appendChild(rect);
    nodesG.appendChild(g); // in the DOM before measuring so glyph widths / KaTeX layout resolve
    const html = titleHtmlOf(n.id);
    if (html) {
      // Math title → foreignObject HTML so its <primer-math> can typeset (SVG <text> can't show
      // KaTeX). Give the fo a generous sandbox first so the inline-block label lays out at its
      // natural width; the measure below shrinks it to fit.
      const fo = mk("foreignObject", { x: -1000, y: -100, width: 2000, height: 200 });
      const wrap = document.createElement("div");
      wrap.className = "cg-fo-wrap"; // fills the pill and flex-centres the label
      const span = document.createElement("span");
      span.className = "cg-fo-label";
      span.innerHTML = html; // trusted authored markup; <primer-math> upgrades + typesets on insert
      wrap.appendChild(span);
      fo.appendChild(wrap);
      g.appendChild(fo);
      n.fo = fo;
      n.div = span;
    } else {
      const text = mk("text", { "text-anchor": "middle", "dominant-baseline": "central" });
      g.appendChild(text);
      const isRoot = n.id === centerId; // the centre node's label is larger/bold (21px)
      wrapLabel(text, titleOf(n.id), isRoot ? 170 : LABEL_MAXW, isRoot ? 26 : LINE_H);
      n.text = text;
    }
    n.g = g;
    n.rect = rect;

    // Measure the label and size the pill.
    let cw, ch;
    if (n.div) {
      const r = n.div.getBoundingClientRect(); // KaTeX included; build-time transform ≈ identity
      cw = r.width;
      ch = r.height;
    } else {
      const bb = (n.text as unknown as SVGGraphicsElement).getBBox();
      cw = bb.width;
      ch = bb.height;
    }
    const w = Math.max(36, cw + PAD_X * 2 + (isCourse ? SHIELD + SHIELD_GAP : 0)); // reserve left room for a course crest
    const h = Math.max(24, ch + PAD_Y * 2);
    n.hw = w / 2;
    n.hh = h / 2;
    rect.setAttribute("x", String(-n.hw));
    rect.setAttribute("y", String(-n.hh));
    rect.setAttribute("width", String(w));
    rect.setAttribute("height", String(h));
    if (n.fo) {
      n.fo.setAttribute("x", String(-n.hw));
      n.fo.setAttribute("y", String(-n.hh));
      n.fo.setAttribute("width", String(w));
      n.fo.setAttribute("height", String(h));
    }

    // Course pages carry the gold crest at the pill's left; the label is shifted right to make room,
    // so it reads as "🛡 Label" inside the node. The image's pointer-events:none (CSS) lets clicks fall
    // through to the node g/rect, just like the label.
    if (isCourse) {
      if (n.fo) {
        n.fo.setAttribute("x", String(-n.hw + SHIELD + SHIELD_GAP));
        n.fo.setAttribute("width", String(w - (SHIELD + SHIELD_GAP)));
      } else {
        n.text?.setAttribute("transform", `translate(${(SHIELD + SHIELD_GAP) / 2},0)`);
      }
      g.appendChild(mk("image", {
        href: "/images/course_shield.png",
        x: -n.hw + PAD_X, y: -SHIELD / 2, width: SHIELD, height: SHIELD,
        preserveAspectRatio: "xMidYMid meet", class: "cg-shield",
      }));
    }

    // The "+N hidden neighbours" badge, pinned to the pill's top-right corner. Hidden until
    // refreshBadges() finds un-revealed neighbours. Colours come from CSS (themed).
    const badge = (mk("g", { class: "cg-badge", transform: `translate(${n.hw},${-n.hh})` }) as SVGGElement);
    badge.style.display = "none";
    badge.appendChild(mk("circle", { r: "8" }));
    const bt = mk("text", { "text-anchor": "middle", "dominant-baseline": "central", class: "cg-badge-text" });
    badge.appendChild(bt);
    g.appendChild(badge);
    n.badge = badge;
    n.badgeText = bt;
  };

  // ---- incremental node/edge add + remove (drive expand / collapse / reveal) ----
  /** Create + show a node at (x,y) if not already visible. */
  const addNode = (id: string, x = 0, y = 0): GNode | undefined => {
    const existing = nodeById.get(id);
    if (existing) return existing;
    if (!byId.has(id)) return undefined;
    const n = ({ id, x, y, vx: 0, vy: 0, hw: 0, hh: 0, charge: courseMembers.has(id) ? COURSE_CHARGE : 1 } as GNode);
    nodes.push(n);
    nodeById.set(id, n);
    visible.add(id);
    buildNodeDom(n);
    paintNode(n, palette());
    return n;
  };
  const addEdgeDom = (e: (typeof edges)[number]) => {
    e.line = mk("line", { "marker-end": e.course ? "url(#cg-arrow-course)" : "url(#cg-arrow)" });
    e.line.setAttribute("data-source", e.source);
    e.line.setAttribute("data-target", e.target);
    if (e.explicit) e.line.classList.add("cg-explicit");
    if (e.course) e.line.classList.add("cg-course");
    edgesG.appendChild(e.line);
    edges.push(e);
    edgeKeys.add(pairKey(e.source, e.target));
    paintEdge(e, palette());
  };
  // (Re)create any prerequisite/course edge whose endpoints are now both visible.
  const syncEdges = () => {
    for (const tgt of visible) {
      const c = byId.get(tgt);
      if (!c) continue;
      const expl = c.explicitPrerequisites;
      for (const pre of c.prerequisites ?? []) {
        if (pre === tgt || !visible.has(pre)) continue;
        const key = pairKey(pre, tgt);
        if (edgeKeys.has(key) || coursePairs.has(key)) continue; // already drawn, or a gold course link
        const explicit = expl ? expl.includes(pre) : true;
        addEdgeDom(({ source: pre, target: tgt, explicit, course: false, weight: explicit ? EXPLICIT_WEIGHT : IMPLICIT_WEIGHT } as any));
      }
    }
    // The gold course chain: consecutive visible members, drawn over any prereq edge there.
    for (let i = 1; i < chainMembers.length; i++) {
      const a = chainMembers[i - 1], b = chainMembers[i];
      if (!visible.has(a) || !visible.has(b) || edgeKeys.has(pairKey(a, b))) continue;
      addEdgeDom(({ source: a, target: b, explicit: false, course: true, weight: COURSE_EDGE_WEIGHT } as any));
    }
  };
  /** Remove a node, its DOM, and every incident edge. */
  const removeNode = (id: string) => {
    const n = nodeById.get(id);
    if (!n) return;
    n.g.remove();
    for (let i = edges.length - 1; i >= 0; i--) {
      const e = edges[i];
      if (e.source === id || e.target === id) {
        e.line.remove();
        edgeKeys.delete(pairKey(e.source, e.target));
        edges.splice(i, 1);
      }
    }
    nodeById.delete(id);
    visible.delete(id);
    const idx = nodes.indexOf(n);
    if (idx >= 0) nodes.splice(idx, 1);
  };
  // Show / hide each node's "+N" badge from its count of still-hidden neighbours.
  const refreshBadges = () => {
    for (const n of nodes) {
      if (!n.badge || !n.badgeText) continue;
      const hidden = directNbrs(n.id).reduce((acc, x) => acc + (visible.has(x) ? 0 : 1), 0);
      if (hidden > 0) {
        n.badgeText.textContent = `${hidden}`;
        n.badge.style.display = "";
        n.g.classList.add("cg-node--expandable");
      } else {
        n.badge.style.display = "none";
        n.g.classList.remove("cg-node--expandable");
      }
    }
  };

  // ---- colours (re-applied on theme / confidence change): loop the per-element painters ----
  const paint = () => {
    const c = palette();
    svg.style.background = "var(--primer-bg, #fff)";
    for (const n of nodes) paintNode(n, c);
    for (const e of edges) paintEdge(e, c);
    arrowPath.setAttribute("fill", c.line);
    arrowPath.setAttribute("fill-opacity", "0.5");
    arrowPathCourse.setAttribute("fill", c.course); // gold arrowheads on course edges
    arrowPathCourse.setAttribute("fill-opacity", "0.95");
  };

  // ---- seed the starting view (positions are set by seedPositions below) ----
  for (const id of visible) addNode(id);
  syncEdges();
  paint();
  refreshBadges();

  // ---- pan / zoom view transform ----
  const view = { tx: 0, ty: 0, scale: 1 };
  const applyView = () => viewport.setAttribute("transform", `translate(${view.tx},${view.ty}) scale(${view.scale})`);

  /** Clip an edge endpoint to a node's pill border (+ gap) toward a target point. */
  const border = (n: GNode, towardX: number, towardY: number) => {
    const dx = towardX - n.x, dy = towardY - n.y;
    if (dx === 0 && dy === 0) return { x: n.x, y: n.y };
    const tx = dx !== 0 ? (n.hw + EDGE_GAP) / Math.abs(dx) : Infinity;
    const ty = dy !== 0 ? (n.hh + EDGE_GAP) / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty, 1);
    return { x: n.x + dx * t, y: n.y + dy * t };
  };

  const render = () => {
    for (const n of nodes) n.g.setAttribute("transform", `translate(${n.x},${n.y})`);
    for (const e of edges) {
      const s = nodeById.get(e.source);
      const t = nodeById.get(e.target);
      if (!s || !t) continue;
      const a = border(s, t.x, t.y);
      const b = border(t, s.x, s.y);
      e.line.setAttribute("x1", String(a.x));
      e.line.setAttribute("y1", String(a.y));
      e.line.setAttribute("x2", String(b.x));
      e.line.setAttribute("y2", String(b.y));
    }
  };

  // ---- seed, pin the anchor (course column, or the centre node), pre-warm, fit-to-view ----
  seedPositions(nodes, 46);
  const centerNode = nodeById.get(centerId);
  // In course mode the rigid, evenly-spaced vertical member column IS the layout's anchor (so we
  // don't ALSO pin root at the origin). Members are `fixed`, so the sim never moves them — the gold
  // spine is a clean top→bottom line and the layout always settles. Re-applied after the on-open
  // re-seed below, because seedPositions overwrites x/y for every node.
  const pinCourseColumn = () => {
    const n = chainMembers.length;
    chainMembers.forEach((id, i) => {
      const node = nodeById.get(id);
      if (!node) return;
      node.x = 0;
      node.y = (i - (n - 1) / 2) * COURSE_GAP; // member[0] at the top, last member at the bottom
      node.fixed = true;
      node.pinned = true;
    });
  };
  if (chainMembers.length) {
    pinCourseColumn();
  } else if (centerNode) {
    centerNode.x = 0;
    centerNode.y = 0;
    centerNode.fixed = true; // skipped by the sim → it never moves from the origin
    centerNode.pinned = true; // and the pointer handlers won't drag it
  }

  // Depth = graph distance from the centre node, feeding `outwardPerDepth` so deeper nodes are
  // pushed further out and the edges fan radially outward. From `root` everything is downstream, so
  // a DIRECTED BFS (prerequisite→dependent) suffices and is the unchanged default. When centred on
  // an arbitrary concept its ancestors are *upstream*, so we walk the graph UNDIRECTED — depth is
  // then distance in either direction and the map fans out evenly around the focus.
  const undirected = centerId !== "root";
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    adj.get(e.source)?.push(e.target);
    if (undirected) adj.get(e.target)?.push(e.source);
  }
  let frontier: string[] = centerNode ? [centerId] : [];
  if (centerNode) centerNode.depth = 0;
  const seen = new Set(frontier);
  for (let d = 1; frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const t of adj.get(id) ?? []) {
        if (seen.has(t)) continue;
        seen.add(t);
        const tn = nodeById.get(t);
        if (tn) tn.depth = d;
        next.push(t);
      }
    }
    frontier = next;
  }
  for (const n of nodes) if (n.depth === undefined) n.depth = 1; // any node not reached from centre

  // Pre-warm until the layout settles (or PREWARM caps it) so `fit()` frames the SETTLED layout.
  // The on-open animation below re-seeds and re-settles deterministically to this same state, so
  // the view it's fitted to stays correct once the motion ends.
  for (let i = 0; i < PREWARM; i++) if (tick(nodes, edges, LAYOUT) <= ENERGY_MIN) break;
  // The view transform that perfectly frames + centres the currently-shown nodes.
  const computeFit = () => {
    const b = bounds(nodes);
    const w = host.clientWidth || svg.clientWidth || 900;
    const h = host.clientHeight || svg.clientHeight || 600;
    const gw = b.maxX - b.minX || 1;
    const gh = b.maxY - b.minY || 1;
    const scale = clamp(Math.min((w - 120) / gw, (h - 120) / gh), 0.08, 1.3);
    return { scale, tx: w / 2 - ((b.minX + b.maxX) / 2) * scale, ty: h / 2 - ((b.minY + b.maxY) / 2) * scale };
  };
  const fit = () => {
    const f = computeFit();
    view.scale = f.scale;
    view.tx = f.tx;
    view.ty = f.ty;
    applyView();
  };
  fit();
  render();

  // Keep the SAME layout point centred across host resizes (window resize, devtools, rotation): the
  // view transform is in pixels, so without this the content would stay pinned to the top-left and
  // the visible centre would drift. We re-anchor tx/ty (scale unchanged — no re-fit).
  let lastW = svg.clientWidth || host.clientWidth || 0;
  let lastH = svg.clientHeight || host.clientHeight || 0;
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      const w = svg.clientWidth || host.clientWidth || 0;
      const h = svg.clientHeight || host.clientHeight || 0;
      if (!w || !h) return;
      if (lastW && lastH && (w !== lastW || h !== lastH)) {
        const cx = (lastW / 2 - view.tx) / view.scale; // layout point centred before the resize
        const cy = (lastH / 2 - view.ty) / view.scale;
        view.tx = w / 2 - cx * view.scale; // …kept centred after it
        view.ty = h / 2 - cy * view.scale;
        applyView();
        reheat(); // let ambient auto-fit re-frame to the new viewport size
      }
      lastW = w;
      lastH = h;
    });
    ro.observe(host);
  }

  // ---- ambient auto-fit: every frame, ease the view a minuscule amount toward a perfect fit + centre
  //      of the shown nodes, so the graph perpetually, almost-imperceptibly keeps itself framed as it
  //      settles, expands or collapses. ALWAYS running — no debounce, no pausing. The ease is so tiny
  //      it doesn't perceptibly fight a manual zoom/pan; the view just slowly drifts back to the fit. ----
  const FIT_EASE = 0.0001; // fraction of the remaining gap closed per frame — minuscule = glacial, near-invisible drift
  const FIT_EASE_IN = 0.01; // zooming IN (content too small → must grow) corrects 10× faster than zooming out
  /** Step the view toward the fit. @returns true while still easing (keeps the loop alive). */
  const autoFitStep = (): boolean => {
    const f = computeFit();
    const ds = f.scale - view.scale, dx = f.tx - view.tx, dy = f.ty - view.ty;
    if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4 && Math.abs(ds) < 1e-4) return false; // already fitted
    if (prefersReduced) { view.scale = f.scale; view.tx = f.tx; view.ty = f.ty; applyView(); return false; }
    // Zoom-in (ds > 0: too far out, scale must grow) snaps back 10× faster than zoom-out; tx/ty follow
    // the same pace so the motion stays coherent.
    const ease = ds > 0 ? FIT_EASE_IN : FIT_EASE;
    view.scale += ds * ease;
    view.tx += dx * ease;
    view.ty += dy * ease;
    applyView();
    return true;
  };

  // ---- animation loop: run while hot OR while still auto-fitting; pause when settled + framed ----
  let raf = 0;
  let running = false;
  const frame = () => {
    const e = tick(nodes, edges, LAYOUT);
    const fitting = autoFitStep();
    render();
    if (e > ENERGY_MIN || dragNode || fitting) raf = requestAnimationFrame(frame);
    else { running = false; raf = 0; }
  };
  const reheat = () => {
    if (!running) {
      running = true;
      raf = requestAnimationFrame(frame);
    }
  };

  // Auto-play the settling animation on open — the same loop a drag reheats. Re-scatter the nodes
  // to the deterministic seed and let the simulation settle them back into the already-fitted
  // layout, so the graph visibly organises itself instead of appearing static. Skipped under
  // prefers-reduced-motion: the graph stays in its settled, fitted state.
  const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!prefersReduced) {
    seedPositions(nodes, 46); // identical spiral scatter (also zeroes velocities → starts from rest)
    if (chainMembers.length) {
      pinCourseColumn(); // re-pin the course spine the scatter just overwrote
    } else if (centerNode) {
      centerNode.x = 0; // keep the centre node at the origin (still fixed/pinned from above)
      centerNode.y = 0;
    }
    render(); // paint the scatter first…
    reheat(); // …then animate it settling
  }

  // ---- progressive disclosure: expand / collapse / reveal ----
  /** Does this concept have neighbours not yet shown? (drives click = expand vs. open.) */
  const hasHidden = (id: string) => directNbrs(id).some((x) => !visible.has(x));

  /** Reveal a clicked node's direct predecessors + successors (and the edges among everything). */
  const expand = (id: string) => {
    const clicked = nodeById.get(id);
    if (!clicked) return;
    const fresh = directNbrs(id).filter((x) => !visible.has(x));
    if (!fresh.length) return;
    fresh.forEach((nid, i) => {
      const a = (i / fresh.length) * Math.PI * 2; // fan the new nodes around the clicked one
      const n = addNode(nid, clicked.x + 90 * Math.cos(a), clicked.y + 90 * Math.sin(a));
      if (n) n.depth = (clicked.depth ?? 1) + 1;
    });
    syncEdges();
    refreshBadges();
    render();
    reheat();
  };

  /** Re-hide the subtree a node introduced: visible non-seed nodes that only reach the seed THROUGH `id`. */
  const collapse = (id: string) => {
    if (!nodeById.has(id)) return;
    // Reachability over the visible graph with `id` removed; whatever still reaches a seed stays.
    const keep = new Set();
    const stack: string[] = [];
    for (const s of seedSet) if (visible.has(s) && s !== id) { keep.add(s); stack.push(s); }
    while (stack.length) {
      const x = (stack.pop() as string);
      for (const e of edges) {
        const y = e.source === x ? e.target : e.target === x ? e.source : null;
        if (y && y !== id && !keep.has(y)) { keep.add(y); stack.push(y); }
      }
    }
    keep.add(id); // the collapsed node itself stays
    const doomed = [...visible].filter((v) => !keep.has(v) && !seedSet.has(v));
    if (!doomed.length) return;
    doomed.forEach(removeNode);
    refreshBadges();
    render();
    reheat();
  };

  /** Surface a concept (from search): add it + its neighbourhood if hidden, then pan to centre it. */
  const reveal = (id: string) => {
    if (!byId.has(id)) return;
    if (!visible.has(id)) {
      const w = host.clientWidth || svg.clientWidth || 900;
      const h = host.clientHeight || svg.clientHeight || 600;
      const cx = (w / 2 - view.tx) / view.scale, cy = (h / 2 - view.ty) / view.scale; // current view centre, in layout coords
      let i = 0;
      for (const nid of kHopNeighborhood([id], byId, SEED_HOPS, dependents)) {
        if (nid === id) addNode(nid, cx, cy);
        else { const a = i++ * 2.39996; addNode(nid, cx + 70 * Math.cos(a), cy + 70 * Math.sin(a)); }
      }
      syncEdges();
      refreshBadges();
    }
    const n = nodeById.get(id);
    if (n) {
      const w = host.clientWidth || svg.clientWidth || 900;
      const h = host.clientHeight || svg.clientHeight || 600;
      view.tx = w / 2 - n.x * view.scale;
      view.ty = h / 2 - n.y * view.scale;
      applyView();
    }
    render();
    reheat();
  };

  // ---- context menu: right-click / long-press a node → Open · Explore · Collapse ----
  const ctxMenu = createContextMenu(document.body, [
    // "Open" — open the concept's lesson in a new tab.
    {
      label: t("contextmenu.open"),
      run: (id) => {
        window.open(`/concepts/${id}.html`, "_blank", "noopener");
      },
    },
    // "Explore" — re-seed the whole map around this concept (a fresh focus view).
    {
      label: t("menu.explore"),
      run: (id) => {
        window.location.href = `/concepts.html?id=${encodeURIComponent(id)}`;
      },
    },
    // "Collapse" — re-hide the neighbours this concept revealed (touch-friendly shift-click).
    {
      label: t("menu.collapse"),
      run: (id) => collapse(id),
    },
  ]);

  // ---- pointer interaction: drag a node, pan the background, click to open, pinch to zoom ----
  let dragNode: GNode | null = null;
  let panning = false;
  let lastX = 0, lastY = 0, travel = 0;
  // Touch long-press → context menu (the mouse uses the native `contextmenu` event below).
  let longPressTimer = 0;
  let longPressed = false;
  // Multi-touch: track every active pointer so two fingers can pinch-zoom. The SVG sets
  // touch-action: none, so the browser does no native pinch — we drive it here.
  const pointers: Map<number, { x: number, y: number }> = new Map();
  let pinchDist = 0; // last two-finger distance (client px); 0 = not pinching
  let gesturePinched = false; // a pinch occurred this touch sequence → suppress tap-to-open
  let tapShift = false; // shift held at pointerdown → a tap collapses instead of expands
  /** The first two active pointers (only called when ≥2 are down). */
  const twoPointers = (): Array<{ x: number, y: number }> => {
    const it = pointers.values();
    const a = (it.next().value as { x: number, y: number });
    const b = (it.next().value as { x: number, y: number });
    return [a, b];
  };

  /** Screen (client) → layout coordinates. */
  const toLayout = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left - view.tx) / view.scale, y: (ev.clientY - r.top - view.ty) / view.scale };
  };

  /** Cancel a pending touch long-press (movement, second finger, or release). */
  const cancelLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = 0;
    }
  };

  const onDown = (ev: PointerEvent) => {
    if (ev.button === 2) return; // right-click is handled by the `contextmenu` listener below
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { svg.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }

    if (pointers.size >= 2) {
      // Two fingers down → pinch-zoom. Abandon any single-finger drag/pan in progress.
      cancelLongPress();
      if (dragNode) {
        if (!dragNode.pinned) dragNode.fixed = false;
        dragNode = null;
      }
      panning = false;
      gesturePinched = true;
      const [a, b] = twoPointers();
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }

    // Single pointer: drag the node under it, else pan the background.
    const target = (ev.target as Element);
    const g = target.closest(".cg-node");
    lastX = ev.clientX;
    lastY = ev.clientY;
    travel = 0;
    longPressed = false;
    tapShift = ev.shiftKey;
    if (g) {
      dragNode = nodeById.get(g.getAttribute("data-id") ?? "") ?? null;
      if (dragNode) dragNode.fixed = true;
      // Touch/pen: hold still for ~500ms over a node to open its context menu instead of dragging.
      if (dragNode && ev.pointerType !== "mouse") {
        const id = g.getAttribute("data-id") ?? "";
        const lx = ev.clientX, ly = ev.clientY;
        longPressTimer = window.setTimeout(() => {
          longPressTimer = 0;
          longPressed = true; // checked in onUp so the release doesn't also open the lesson
          if (dragNode && !dragNode.pinned) dragNode.fixed = false;
          dragNode = null;
          if (id) ctxMenu.open(id, lx, ly);
        }, 500);
      }
    } else {
      panning = true;
    }
  };
  const onMove = (ev: PointerEvent) => {
    const tracked = pointers.get(ev.pointerId);
    if (tracked) {
      tracked.x = ev.clientX;
      tracked.y = ev.clientY;
    }

    if (pointers.size >= 2) {
      // Pinch: scale about the midpoint of the two fingers (which also pans as they move),
      // reusing the same anchored-zoom math as the wheel handler.
      const [a, b] = twoPointers();
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0 && dist > 0) {
        const r = svg.getBoundingClientRect();
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        const lx = (mx - view.tx) / view.scale, ly = (my - view.ty) / view.scale;
        view.scale = clamp(view.scale * (dist / pinchDist), 0.08, 4);
        view.tx = mx - lx * view.scale;
        view.ty = my - ly * view.scale;
        applyView();
        reheat(); // keep the loop alive so ambient auto-fit keeps running during the pinch
      }
      pinchDist = dist;
      return;
    }

    if (dragNode) {
      travel += Math.hypot(ev.clientX - lastX, ev.clientY - lastY);
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (longPressTimer && travel > CLICK_PX) cancelLongPress(); // a real drag, not a hold
      // The pinned root stays at the origin — track travel (so a tap still opens it) but don't move.
      if (!dragNode.pinned) {
        const p = toLayout(ev);
        dragNode.x = p.x;
        dragNode.y = p.y;
        reheat();
        render();
      }
    } else if (panning) {
      view.tx += ev.clientX - lastX;
      view.ty += ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      applyView();
      reheat(); // keep the loop alive so ambient auto-fit keeps running during the pan
    }
  };
  const onUp = (ev: PointerEvent) => {
    try { svg.releasePointerCapture(ev.pointerId); } catch { /* not captured */ }
    pointers.delete(ev.pointerId);

    if (pointers.size >= 2) {
      // Still pinching with the remaining fingers — re-seed the baseline distance.
      const [a, b] = twoPointers();
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      return;
    }
    if (pointers.size === 1) {
      // Dropped from a pinch to one finger → continue as a pan from where it is (no jump, no grab).
      pinchDist = 0;
      const rem = (pointers.values().next().value as { x: number, y: number });
      lastX = rem.x;
      lastY = rem.y;
      panning = true;
      dragNode = null;
      return;
    }

    // Last pointer up — end of the gesture.
    pinchDist = 0;
    cancelLongPress();
    if (dragNode) {
      const n = dragNode;
      dragNode = null;
      if (!n.pinned) n.fixed = false; // keep the pinned root fixed
      // Neither a pinch nor a long-press counts as a tap. A tap shift-collapses, else expands the
      // node's hidden neighbours, else (fully expanded) opens its lesson.
      if (!gesturePinched && !longPressed && travel < CLICK_PX) {
        if (tapShift) collapse(n.id);
        else if (hasHidden(n.id)) expand(n.id);
        else window.open(`/concepts/${n.id}.html`, "_blank", "noopener");
      }
      reheat();
    }
    panning = false;
    gesturePinched = false;
    longPressed = false;
    reheat();
  };
  svg.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointercancel", onUp);

  // Right-click a node → the context menu at the cursor (the background keeps its native menu).
  const onContextMenu = (ev: MouseEvent) => {
    const g = (ev.target as Element).closest?.(".cg-node");
    if (!g) return;
    ev.preventDefault();
    const id = g.getAttribute("data-id");
    if (id) ctxMenu.open(id, ev.clientX, ev.clientY);
  };
  svg.addEventListener("contextmenu", onContextMenu);

  const onWheel = (ev: WheelEvent) => {
    ev.preventDefault();
    const r = svg.getBoundingClientRect();
    const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    const lx = (sx - view.tx) / view.scale, ly = (sy - view.ty) / view.scale;
    view.scale = clamp(view.scale * Math.exp(-ev.deltaY * 0.001), 0.08, 4);
    view.tx = sx - lx * view.scale;
    view.ty = sy - ly * view.scale;
    applyView();
    reheat();
  };
  svg.addEventListener("wheel", onWheel, { passive: false });

  // ---- hover: emphasise a node and its incident edges ----
  const hover = (ev: Event, on: boolean) => {
    const g = (ev.target as Element).closest?.(".cg-node");
    if (!g) return;
    const id = g.getAttribute("data-id");
    g.classList.toggle("cg-hot", on);
    for (const e of edges) {
      if (e.source !== id && e.target !== id) continue;
      e.line.classList.toggle("cg-hot", on);
      // Emphasise the node at the OTHER end of each incident edge too.
      const otherId = e.source === id ? e.target : e.source;
      nodeById.get(otherId)?.g.classList.toggle("cg-hot", on);
    }
  };
  const onOver = (e: Event) => hover(e, true);
  const onOut = (e: Event) => hover(e, false);
  nodesG.addEventListener("pointerover", onOver);
  nodesG.addEventListener("pointerout", onOut);

  // ---- react to theme / confidence changes (like primer-pathway) ----
  const onTheme = () => paint();
  const onConfidence = (ev: Event) => {
    const id = (ev as any).detail?.conceptId;
    const n = id && nodeById.get(id);
    if (n) {
      // A course member keeps its gold outline; only the confidence FILL updates here.
      n.rect.setAttribute("fill", confidenceColor(n.id) ?? palette().surface);
    }
  };
  document.addEventListener("theme-change", onTheme);
  document.addEventListener("confidence-change", onConfidence);

  // ---- top-left search: two stacked boxes pinned to the viewport top-left. The COURSES box (on top)
  //      lists only course pages; picking one focuses that course (the explorer then rebuilds to its
  //      spine). The CONCEPTS box (below) lists every concept; picking one reveals it on the map. ----
  const searchStack = document.createElement("div");
  searchStack.className = "cg-search-stack";
  host.appendChild(searchStack);
  const courseSearch = mountCourseSearch(searchStack, {
    byId, locale, placement: "inline",
    onSelect: (id) => setCurrentCourse(id), // → course-change → concepts.html rebuilds to the course's spine
  });
  const searchBox = mountConceptSearch(searchStack, {
    byId, locale, placement: "inline",
    onSelect: (id) => reveal(id),
  });

  return {
    destroy() {
      courseSearch.destroy();
      searchBox.destroy();
      searchStack.remove();
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      svg.removeEventListener("contextmenu", onContextMenu);
      svg.removeEventListener("wheel", onWheel);
      cancelLongPress();
      ctxMenu.destroy();
      nodesG.removeEventListener("pointerover", onOver);
      nodesG.removeEventListener("pointerout", onOut);
      document.removeEventListener("theme-change", onTheme);
      document.removeEventListener("confidence-change", onConfidence);
      host.replaceChildren();
    },
  };
}

/** Inject the graph's stylesheet once (cursor affordances, hover emphasis, non-selectable labels). */
function injectStyleOnce() {
  if (document.getElementById("concept-graph-style")) return;
  const style = document.createElement("style");
  style.id = "concept-graph-style";
  style.textContent = `
    .cg-svg { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; }
    .cg-svg:active { cursor: grabbing; }
    .cg-node { cursor: pointer; }
    .cg-node text {
      font-family: var(--primer-font-ui, sans-serif); font-size: 13px;
      pointer-events: none; user-select: none;
    }
    .cg-shield { pointer-events: none; } /* the course crest: clicks fall through to the node */
    /* HTML label inside a node's foreignObject (math titles). The wrap fills the pill and
       flex-centres the label both ways (no SVG dominant-baseline for HTML); the label shrink-wraps
       its content for measuring. KaTeX inherits the colour paint() sets via color. pointer-events:
       none so drag/click fall through to the node g/rect. */
    .cg-node .cg-fo-wrap {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none;
    }
    .cg-node .cg-fo-label {
      display: inline-block; white-space: nowrap;
      font-family: var(--primer-font-ui, sans-serif); font-size: 13px; line-height: 1;
      pointer-events: none; user-select: none;
    }
    .cg-node rect { transition: stroke-width .1s; stroke-width: 1.5; }
    .cg-node.cg-hot rect { stroke: var(--primer-accent, #46e); stroke-width: 3; }
    /* The central root node, bigger and bold (the pill auto-sizes to the larger label). */
    .cg-node--root text, .cg-node--root .cg-fo-label { font-size: 21px; font-weight: 700; }
    .cg-node--root rect { stroke-width: 2.5; }
    .cg-node--course rect { stroke-width: 3; } /* gold outline marks a course member (stroke colour in paint) */
    /* "+N hidden neighbours" badge — a small accent disc at the pill's top-right; a faint accent ring
       on the pill signals the node is expandable (click to reveal its predecessors + successors). */
    .cg-node--expandable rect { stroke: var(--primer-accent, #46e); stroke-dasharray: 4 2.5; }
    .cg-badge circle { fill: var(--primer-accent, #46e); }
    .cg-badge-text { fill: var(--primer-accent-ink, #fff); font-family: var(--primer-font-ui, sans-serif); font-size: 8.5px; font-weight: 700; pointer-events: none; user-select: none; }
    .cg-edges line { stroke-width: 1.2; transition: stroke-width .1s, stroke-opacity .1s; }
    .cg-edges line.cg-explicit { stroke-width: 2.6; }
    .cg-edges line.cg-hot { stroke: var(--primer-accent, #46e) !important; stroke-opacity: 0.9 !important; stroke-width: 3; }
    .cg-edges line.cg-course { stroke-width: 4.5; } /* the course spine: thicker than an explicit edge */
    .cg-course-banner {
      position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%);
      color: var(--primer-course, #e3b15c); font-family: var(--primer-font-ui, sans-serif);
      font-weight: 600; font-size: 0.95rem; pointer-events: none; white-space: nowrap;
    }
    /* Two stacked search boxes (courses over concepts), pinned to the viewport top-left. */
    .cg-search-stack {
      position: fixed; top: 0.75rem; left: 0.75rem; z-index: 1000;
      display: flex; flex-direction: column; gap: 0.5rem; width: min(8.5rem, 29vw);
    }
    .cg-search-stack .cg-search { width: 100%; } /* override the inline default width to fill the stack */
    ${SEARCH_BOX_CSS}
  `;
  document.head.appendChild(style);
}
