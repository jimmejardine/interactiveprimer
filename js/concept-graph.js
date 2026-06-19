// @ts-check
/**
 * Renders the whole concept DAG as an SVG force-directed graph and wires up interaction
 * (drag-to-rearrange, pan, zoom, click-to-open). The layout maths live in js/force-layout.js;
 * this module is the DOM/SVG/rAF/pointer shell. Colours come from the theme (themeColors) and the
 * learner's confidence (confidenceColor), and re-paint on `theme-change` / `confidence-change` —
 * mirroring js/components/primer-pathway.js.
 * @module
 */

import { seedPositions, tick, bounds } from "./force-layout.js";
import { themeColors } from "./theme.js";
import { confidenceColor } from "./confidence-color.js";
import { searchConcepts } from "./concept-search.js";
// Defines <primer-math> on this page (concepts.html doesn't load boot.js) so a node with a math
// title can typeset inside a <foreignObject>. concepts.html supplies the KaTeX CSS + import map.
import "./components/primer-math.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const ENERGY_MIN = 0.04; // below this the layout is "settled" and the rAF loop pauses
const PREWARM = 320; // synchronous ticks before first paint, so the graph opens tidy
const CLICK_PX = 4; // pointer travel under this (screen px) counts as a click, not a drag
const PAD_X = 12, PAD_Y = 7, EDGE_GAP = 4; // node text padding; gap between an edge end and a node
const LABEL_MAXW = 120, LINE_H = 15; // wrap node labels to this width (px); line height
const EXPLICIT_WEIGHT = 2.2; // spring strength for an explicit (concept-meta) edge vs 1 for implicit

/**
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @returns {SVGElement}
 */
function mk(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
  return /** @type {SVGElement} */ (e);
}

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Word-wrap an SVG <text> label into vertically-centred <tspan> lines that each fit `maxWidth` px.
 * The element must already be in the DOM (so glyph widths resolve). Returns the line count.
 * @param {SVGElement} textEl @param {string} label @param {number} maxWidth
 */
function wrapLabel(textEl, label, maxWidth) {
  const words = String(label).split(/\s+/).filter(Boolean);
  textEl.textContent = "";
  const ruler = /** @type {SVGTextContentElement} */ (/** @type {unknown} */ (mk("tspan")));
  textEl.appendChild(ruler);
  /** @type {string[]} */
  const lines = [];
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
  const top = -((lines.length - 1) * LINE_H) / 2; // centre the block on the node's middle
  lines.forEach((ln, i) => {
    const ts = mk("tspan", { x: 0, dy: i === 0 ? top : LINE_H });
    ts.textContent = ln;
    textEl.appendChild(ts);
  });
  return lines.length;
}

/** Read the current theme's surface/border tokens alongside themeColors(). */
function palette() {
  const tc = themeColors();
  const cs = getComputedStyle(document.documentElement);
  const get = (/** @type {string} */ name, /** @type {string} */ fb) => cs.getPropertyValue(name).trim() || fb;
  return { ink: tc.ink, line: tc.line, surface: get("--primer-surface", "#fff"), border: get("--primer-border", "#ccc") };
}

/**
 * Mount the concept graph into `host` (a block element that has a real height). Returns a handle
 * with `destroy()` to tear down listeners and the animation loop.
 * @param {HTMLElement} host
 * @param {{ byId: Map<string, import("./types/domain.js").ResolvedConcept>, locale: string }} opts
 * @returns {{ destroy: () => void }}
 */
export function mountConceptGraph(host, { byId, locale }) {
  /** @param {string} id */
  const titleOf = (id) => {
    const c = byId.get(id);
    return c?.titles?.[locale] ?? c?.title ?? (id.split("/").pop() ?? id);
  };
  // The raw title markup for a math title — but only when we're showing the English title (a
  // translated, plain title takes precedence). Drives the foreignObject path below.
  /** @param {string} id */
  const titleHtmlOf = (id) => {
    const c = byId.get(id);
    return c?.titleHtml && !c?.titles?.[locale] ? c.titleHtml : null;
  };

  // ---- model: layout nodes (+ render refs) and directed prerequisite→dependent edges ----
  /** @typedef {{ id: string, x: number, y: number, vx: number, vy: number, fixed?: boolean, pinned?: boolean, hw: number, hh: number, g: SVGGElement, rect: SVGElement, text?: SVGElement, fo?: SVGElement, div?: HTMLElement }} GNode */
  /** @type {GNode[]} */
  const nodes = [];
  /** @type {Map<string, GNode>} */
  const nodeById = new Map();
  for (const c of byId.values()) {
    const n = /** @type {GNode} */ ({ id: c.id, x: 0, y: 0, vx: 0, vy: 0, hw: 0, hh: 0 });
    nodes.push(n);
    nodeById.set(c.id, n);
  }
  // Edges are prerequisite→dependent. An edge is "explicit" when the prerequisite was declared in
  // the concept-meta (vs. only harvested from an inline <primer-ref>): explicit edges pull harder
  // and draw thicker. Fall back to "explicit" when the graph predates explicitPrerequisites.
  /** @type {{ source: string, target: string, explicit: boolean, weight: number, line: SVGElement }[]} */
  const edges = [];
  for (const c of byId.values()) {
    const expl = c.explicitPrerequisites;
    for (const pre of c.prerequisites ?? []) {
      if (nodeById.has(pre) && pre !== c.id) {
        const explicit = expl ? expl.includes(pre) : true;
        edges.push(/** @type {any} */ ({ source: pre, target: c.id, explicit, weight: explicit ? EXPLICIT_WEIGHT : 1 }));
      }
    }
  }

  // ---- SVG scaffold ----
  host.replaceChildren();
  injectStyleOnce();
  const svg = /** @type {SVGSVGElement} */ (mk("svg", { class: "cg-svg" }));
  const defs = mk("defs");
  const marker = mk("marker", {
    id: "cg-arrow", viewBox: "0 0 10 10", refX: "9", refY: "5",
    markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse",
  });
  const arrowPath = mk("path", { d: "M0,0 L10,5 L0,10 z" });
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  const viewport = /** @type {SVGGElement} */ (mk("g", { class: "cg-viewport" }));
  const edgesG = mk("g", { class: "cg-edges" });
  const nodesG = mk("g", { class: "cg-nodes" });
  viewport.append(edgesG, nodesG);
  svg.append(defs, viewport);
  host.appendChild(svg);

  // ---- build edge + node DOM ----
  for (const e of edges) {
    e.line = mk("line", { "marker-end": "url(#cg-arrow)" });
    e.line.setAttribute("data-source", e.source);
    e.line.setAttribute("data-target", e.target);
    if (e.explicit) e.line.classList.add("cg-explicit");
    edgesG.appendChild(e.line);
  }
  for (const n of nodes) {
    const g = /** @type {SVGGElement} */ (mk("g", { class: "cg-node" }));
    g.setAttribute("data-id", n.id);
    const rect = mk("rect", { rx: "10", ry: "10" });
    g.appendChild(rect);
    nodesG.appendChild(g); // in the DOM before measuring so glyph widths / KaTeX layout resolve
    const html = titleHtmlOf(n.id);
    if (html) {
      // Math title → foreignObject HTML so its <primer-math> can typeset (SVG <text> can't show
      // KaTeX). Give the fo a generous sandbox first so the inline-block label lays out at its
      // natural width; the measure pass below shrinks it to fit.
      const fo = mk("foreignObject", { x: -1000, y: -100, width: 2000, height: 200 });
      const wrap = document.createElement("div");
      wrap.className = "cg-fo-wrap"; // fills the pill and flex-centres the label (see measure pass)
      const span = document.createElement("span");
      span.className = "cg-fo-label";
      span.innerHTML = html; // trusted authored markup; <primer-math> upgrades + typesets on insert
      wrap.appendChild(span);
      fo.appendChild(wrap);
      g.appendChild(fo);
      n.fo = fo;
      n.div = span; // the measured + coloured label; the wrap centres it within the pill
    } else {
      const text = mk("text", { "text-anchor": "middle", "dominant-baseline": "central" });
      g.appendChild(text);
      wrapLabel(text, titleOf(n.id), LABEL_MAXW);
      n.text = text;
    }
    n.g = g;
    n.rect = rect;
  }

  // ---- measure each label and size its pill (titles are static until a locale reload) ----
  for (const n of nodes) {
    let cw, ch;
    if (n.div) {
      // The HTML label's natural size (rendered KaTeX included). At build time the view transform
      // is identity, so a client rect ≈ user units.
      const r = n.div.getBoundingClientRect();
      cw = r.width;
      ch = r.height;
    } else {
      const bb = /** @type {SVGGraphicsElement} */ (/** @type {unknown} */ (n.text)).getBBox();
      cw = bb.width;
      ch = bb.height;
    }
    const w = Math.max(36, cw + PAD_X * 2);
    const h = Math.max(24, ch + PAD_Y * 2);
    n.hw = w / 2;
    n.hh = h / 2;
    n.rect.setAttribute("x", String(-n.hw));
    n.rect.setAttribute("y", String(-n.hh));
    n.rect.setAttribute("width", String(w));
    n.rect.setAttribute("height", String(h));
    // A foreignObject label fills the WHOLE pill (not just the content box) and flex-centres its
    // wrap, so the typeset math sits dead-centre with PAD margin — no baseline drift, no clipping.
    if (n.fo) {
      n.fo.setAttribute("x", String(-n.hw));
      n.fo.setAttribute("y", String(-n.hh));
      n.fo.setAttribute("width", String(w));
      n.fo.setAttribute("height", String(h));
    }
  }

  // ---- colours (re-applied on theme / confidence change) ----
  const paint = () => {
    const c = palette();
    svg.style.background = "var(--primer-bg, #fff)";
    for (const n of nodes) {
      n.rect.setAttribute("fill", confidenceColor(n.id) ?? c.surface);
      n.rect.setAttribute("stroke", c.border);
      // SVG text colours via `fill`; a foreignObject HTML label (incl. KaTeX) via CSS `color`.
      if (n.div) n.div.style.color = c.ink;
      else n.text?.setAttribute("fill", c.ink);
    }
    for (const e of edges) {
      e.line.setAttribute("stroke", c.line);
      e.line.setAttribute("stroke-opacity", e.explicit ? "0.5" : "0.28");
    }
    arrowPath.setAttribute("fill", c.line);
    arrowPath.setAttribute("fill-opacity", "0.5");
  };
  paint();

  // ---- pan / zoom view transform ----
  const view = { tx: 0, ty: 0, scale: 1 };
  const applyView = () => viewport.setAttribute("transform", `translate(${view.tx},${view.ty}) scale(${view.scale})`);

  /** Clip an edge endpoint to a node's pill border (+ gap) toward a target point. */
  const border = (/** @type {GNode} */ n, /** @type {number} */ towardX, /** @type {number} */ towardY) => {
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

  // ---- seed, pin the root at the centre, pre-warm, fit-to-view ----
  seedPositions(nodes, 46);
  const rootNode = nodeById.get("root");
  if (rootNode) {
    rootNode.x = 0;
    rootNode.y = 0;
    rootNode.fixed = true; // skipped by the sim → it never moves from the origin
    rootNode.pinned = true; // and the pointer handlers won't drag it
  }
  for (let i = 0; i < PREWARM; i++) tick(nodes, edges);
  const fit = () => {
    const b = bounds(nodes);
    const w = host.clientWidth || svg.clientWidth || 900;
    const h = host.clientHeight || svg.clientHeight || 600;
    const gw = b.maxX - b.minX || 1;
    const gh = b.maxY - b.minY || 1;
    view.scale = clamp(Math.min((w - 120) / gw, (h - 120) / gh), 0.08, 1.3);
    view.tx = w / 2 - ((b.minX + b.maxX) / 2) * view.scale;
    view.ty = h / 2 - ((b.minY + b.maxY) / 2) * view.scale;
    applyView();
  };
  fit();
  render();

  // ---- animation loop: run while hot, pause when settled, reheat on demand ----
  let raf = 0;
  let running = false;
  const frame = () => {
    const e = tick(nodes, edges);
    render();
    if (e > ENERGY_MIN || dragNode) raf = requestAnimationFrame(frame);
    else { running = false; raf = 0; }
  };
  const reheat = () => {
    if (!running) {
      running = true;
      raf = requestAnimationFrame(frame);
    }
  };

  // ---- pointer interaction: drag a node, pan the background, click to open ----
  /** @type {GNode | null} */
  let dragNode = null;
  let panning = false;
  let lastX = 0, lastY = 0, travel = 0;

  /** Screen (client) → layout coordinates. @param {PointerEvent} ev */
  const toLayout = (ev) => {
    const r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left - view.tx) / view.scale, y: (ev.clientY - r.top - view.ty) / view.scale };
  };

  /** @param {PointerEvent} ev */
  const onDown = (ev) => {
    const target = /** @type {Element} */ (ev.target);
    const g = target.closest(".cg-node");
    lastX = ev.clientX;
    lastY = ev.clientY;
    travel = 0;
    svg.setPointerCapture(ev.pointerId);
    if (g) {
      dragNode = nodeById.get(g.getAttribute("data-id") ?? "") ?? null;
      if (dragNode) dragNode.fixed = true;
    } else {
      panning = true;
    }
  };
  /** @param {PointerEvent} ev */
  const onMove = (ev) => {
    if (dragNode) {
      travel += Math.hypot(ev.clientX - lastX, ev.clientY - lastY);
      lastX = ev.clientX;
      lastY = ev.clientY;
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
    }
  };
  /** @param {PointerEvent} ev */
  const onUp = (ev) => {
    try { svg.releasePointerCapture(ev.pointerId); } catch { /* not captured */ }
    if (dragNode) {
      const n = dragNode;
      dragNode = null;
      if (!n.pinned) n.fixed = false; // keep the pinned root fixed
      if (travel < CLICK_PX) window.open(`/concepts/${n.id}.html`, "_blank", "noopener");
      reheat();
    }
    panning = false;
  };
  svg.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointercancel", onUp);

  /** @param {WheelEvent} ev */
  const onWheel = (ev) => {
    ev.preventDefault();
    const r = svg.getBoundingClientRect();
    const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    const lx = (sx - view.tx) / view.scale, ly = (sy - view.ty) / view.scale;
    view.scale = clamp(view.scale * Math.exp(-ev.deltaY * 0.001), 0.08, 4);
    view.tx = sx - lx * view.scale;
    view.ty = sy - ly * view.scale;
    applyView();
  };
  svg.addEventListener("wheel", onWheel, { passive: false });

  // ---- hover: emphasise a node and its incident edges ----
  /** @param {Event} ev @param {boolean} on */
  const hover = (ev, on) => {
    const g = /** @type {Element} */ (ev.target).closest?.(".cg-node");
    if (!g) return;
    const id = g.getAttribute("data-id");
    g.classList.toggle("cg-hot", on);
    for (const e of edges) {
      if (e.source === id || e.target === id) e.line.classList.toggle("cg-hot", on);
    }
  };
  const onOver = (/** @type {Event} */ e) => hover(e, true);
  const onOut = (/** @type {Event} */ e) => hover(e, false);
  nodesG.addEventListener("pointerover", onOver);
  nodesG.addEventListener("pointerout", onOut);

  // ---- react to theme / confidence changes (like primer-pathway) ----
  const onTheme = () => paint();
  /** @param {Event} ev */
  const onConfidence = (ev) => {
    const id = /** @type {any} */ (ev).detail?.conceptId;
    const n = id && nodeById.get(id);
    if (n) {
      const c = palette();
      n.rect.setAttribute("fill", confidenceColor(n.id) ?? c.surface);
    }
  };
  document.addEventListener("theme-change", onTheme);
  document.addEventListener("confidence-change", onConfidence);

  // ---- top-left search: filter concept names, click/Enter to open the concept ----
  const searchIndex = nodes.map((n) => ({ id: n.id, title: titleOf(n.id) }));
  const search = document.createElement("div");
  search.className = "cg-search";
  search.innerHTML =
    `<input class="cg-search-input" type="search" autocomplete="off" spellcheck="false"` +
    ` placeholder="Search concepts…" aria-label="Search concepts" role="combobox"` +
    ` aria-expanded="false" aria-controls="cg-search-list" aria-autocomplete="list" />` +
    `<ul class="cg-results" id="cg-search-list" role="listbox" hidden></ul>`;
  host.appendChild(search);
  const input = /** @type {HTMLInputElement} */ (search.querySelector(".cg-search-input"));
  const list = /** @type {HTMLElement} */ (search.querySelector(".cg-results"));

  /** @type {{ id: string, title: string }[]} */
  let results = [];
  let activeIdx = -1;

  const closeList = () => {
    list.hidden = true;
    list.replaceChildren();
    results = [];
    activeIdx = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };
  /** Move the active row (wrapping); -1 clears it. @param {number} i */
  const setActive = (i) => {
    const items = [...list.children];
    activeIdx = items.length ? ((i % items.length) + items.length) % items.length : -1;
    items.forEach((el, idx) => el.classList.toggle("is-active", idx === activeIdx));
    if (activeIdx >= 0) {
      const el = /** @type {HTMLElement} */ (items[activeIdx]);
      input.setAttribute("aria-activedescendant", el.id);
      el.scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  };
  /** @param {number} i */
  const select = (i) => {
    const r = results[i];
    if (!r) return;
    window.open(`/concepts/${r.id}.html`, "_blank", "noopener"); // matches a node click
    input.value = "";
    closeList();
  };
  const renderResults = () => {
    results = searchConcepts(searchIndex, input.value, 10);
    list.replaceChildren();
    if (!results.length) return closeList();
    results.forEach((r, i) => {
      const li = document.createElement("li");
      li.className = "cg-result";
      li.id = `cg-result-${i}`;
      li.setAttribute("role", "option");
      li.dataset.id = r.id;
      const title = document.createElement("span");
      title.className = "cg-result-title";
      title.textContent = r.title;
      const sub = document.createElement("span");
      sub.className = "cg-result-id";
      sub.textContent = r.id;
      li.append(title, sub);
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    setActive(0);
  };

  const onSearchInput = () => renderResults();
  /** @param {KeyboardEvent} e */
  const onSearchKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (list.hidden) renderResults();
      else setActive(activeIdx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(activeIdx - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(activeIdx >= 0 ? activeIdx : 0);
    } else if (e.key === "Escape") {
      input.value = "";
      closeList();
      input.blur();
    }
  };
  // Select on pointerdown (before the input blurs) so a click reliably opens the row.
  const onListDown = (/** @type {Event} */ e) => {
    const li = /** @type {Element} */ (e.target).closest?.(".cg-result");
    if (!li) return;
    e.preventDefault();
    const idx = [...list.children].indexOf(li);
    if (idx >= 0) select(idx);
  };
  const onDocDown = (/** @type {Event} */ e) => {
    if (!e.composedPath().includes(search)) closeList();
  };
  input.addEventListener("input", onSearchInput);
  input.addEventListener("keydown", onSearchKey);
  list.addEventListener("pointerdown", onListDown);
  document.addEventListener("pointerdown", onDocDown);

  return {
    destroy() {
      document.removeEventListener("pointerdown", onDocDown);
      if (raf) cancelAnimationFrame(raf);
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      svg.removeEventListener("wheel", onWheel);
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
    .cg-edges line { stroke-width: 1.2; transition: stroke-width .1s, stroke-opacity .1s; }
    .cg-edges line.cg-explicit { stroke-width: 2.6; }
    .cg-edges line.cg-hot { stroke: var(--primer-accent, #46e) !important; stroke-opacity: 0.9 !important; stroke-width: 3; }

    /* Top-left search overlay. Sits above the SVG; themed via the --primer-* tokens. */
    .cg-search { position: absolute; top: 0.7rem; left: 0.7rem; z-index: 5; width: min(20rem, 70vw); font-family: var(--primer-font-ui, sans-serif); }
    .cg-search-input {
      width: 100%; box-sizing: border-box; font: inherit; font-size: 0.92rem;
      padding: 0.45rem 0.6rem; border-radius: var(--primer-radius, 0.6rem);
      border: 1px solid var(--primer-border, #ccc);
      background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    }
    .cg-search-input:focus { outline: 2px solid var(--primer-accent, #46e); outline-offset: 1px; }
    .cg-results {
      list-style: none; margin: 0.35rem 0 0; padding: 0.25rem;
      max-height: 16rem; overflow-y: auto;
      background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
      border: 1px solid var(--primer-border, #ccc); border-radius: var(--primer-radius, 0.6rem);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
    }
    .cg-results[hidden] { display: none; }
    .cg-result { display: flex; flex-direction: column; gap: 0.05rem; padding: 0.35rem 0.5rem; border-radius: 0.4rem; cursor: pointer; }
    .cg-result:hover, .cg-result.is-active { background: var(--primer-accent, #46e); color: var(--primer-accent-ink, #fff); }
    .cg-result-title { font-size: 0.92rem; }
    .cg-result-id { font-size: 0.72rem; opacity: 0.7; }
    .cg-result:hover .cg-result-id, .cg-result.is-active .cg-result-id { opacity: 0.85; }
  `;
  document.head.appendChild(style);
}
