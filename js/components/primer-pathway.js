// @ts-check
/**
 * <primer-pathway> — a small visual map of where the current concept sits in the
 * knowledge tree, rendered at the top and bottom of every lesson (inserted by
 * js/render.js). Three columns, centred on the current concept:
 *
 *   column 1: all predecessors (ancestors)
 *   column 2: peers above, the CURRENT concept in the centre, peers below
 *   column 3: all successors (descendants)
 *
 * with lines connecting concepts that share a prerequisite edge. Every node except
 * the current one links to that concept's page.
 *
 * The whole graph is loaded once from /dist/graph.json (shared across the top and
 * bottom instances). If that fetch fails or the current concept isn't in the graph,
 * the widget renders nothing — the lesson is unaffected. Run `npm run graph` after
 * adding or editing concepts so the map reflects the latest tree.
 * @module
 */

import { attachShared } from "./shared.js";
import { getConceptMeta } from "../concept-meta.js";
import { indexConcepts, neighborhood } from "../graph.js";

/** @typedef {import("../types/domain.js").ResolvedConcept} ResolvedConcept */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Most nodes to show in any one column before collapsing the rest into a "+k more" chip. */
const MAX_PER_COL = 6;

/** Confidence (star) storage — mirrors js/components/primer-concept.js. */
const CONFIDENCE_PREFIX = "primer:confidence:";
const MAX_STARS = 10;

/**
 * A node's colour from its self-attested star rating: a RED→YELLOW→GREEN hue ramp
 * proportional to the rating (0 stars = red, half = yellow, full = green). Returns
 * null when the concept hasn't been rated, so the node keeps its default white look.
 * @param {string} id
 * @returns {string | null}
 */
function confidenceColor(id) {
  let raw;
  try {
    raw = localStorage.getItem(CONFIDENCE_PREFIX + id);
  } catch {
    return null; // localStorage unavailable (private mode, file://)
  }
  if (raw === null) return null; // not yet rated → white
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const stars = Math.min(MAX_STARS, Math.max(0, n));
  const hue = (stars / MAX_STARS) * 120; // 0 → red, 60 → yellow, 120 → green
  return `hsl(${hue}, 70%, 62%)`;
}

/** Paint a node element from its concept's rating (clears to the default when unrated). @param {Element} el */
function paintNode(el) {
  /** @type {HTMLElement} */ (el).style.background = confidenceColor(el.getAttribute("data-id") ?? "") ?? "";
}

/**
 * Load and index the knowledge graph once for the whole page (both pathway
 * instances share this promise). Rejects on any fetch/parse problem.
 * @returns {Promise<{ raw: any, byId: Map<string, ResolvedConcept> }>}
 */
function loadGraph() {
  const w = /** @type {any} */ (window);
  if (!w.__primerGraphPromise) {
    w.__primerGraphPromise = fetch("/dist/graph.json")
      .then((r) => {
        if (!r.ok) throw new Error(`graph.json HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => ({ raw, byId: indexConcepts(raw.concepts) }));
  }
  return w.__primerGraphPromise;
}

const STYLE = `
  :host { display: block; }
  .pathway { position: relative; margin: 1.25rem 0; }
  .cols {
    position: relative; z-index: 1;
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    align-items: center; gap: 0.5rem;
  }
  .col { display: flex; flex-direction: column; gap: 0.4rem; justify-content: center; }
  .col.col1 { align-items: flex-start; }
  .col.col2 { align-items: center; }
  .col.col3 { align-items: flex-end; }

  .node {
    font-family: var(--primer-font-ui, sans-serif);
    font-size: 0.8rem; line-height: 1.15;
    max-width: 100%;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--primer-border, #ddd);
    border-radius: 999px;
    background: var(--primer-surface, #fff);
    color: var(--primer-ink, #111);
    text-decoration: none;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: border-color .1s, box-shadow .1s, opacity .12s;
  }
  .node--current { border: 2px solid var(--primer-accent, #46e); font-weight: 600; }
  .more { font-size: 0.72rem; color: var(--primer-ink-soft, #667); padding: 0.15rem 0.4rem; }

  /* Hover emphasis: bolder connected nodes + edges, dimmed rest. */
  .node.is-hot { border-color: var(--primer-accent, #46e); box-shadow: 0 0 0 2px var(--primer-accent, #46e); font-weight: 600; }
  .node.is-dim { opacity: 0.4; }

  .wires {
    position: absolute; inset: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 0; overflow: visible;
  }
  .wires line { stroke: var(--primer-border, #ccc); stroke-width: 1.5; transition: stroke .1s, stroke-width .1s, opacity .12s; }
  .wires line.is-hot { stroke: var(--primer-accent, #46e); stroke-width: 3; }
  .wires line.is-dim { opacity: 0.2; }
`;

export class PrimerPathway extends HTMLElement {
  /** @type {ResizeObserver | null} */
  #observer = null;
  /** @type {((e: Event) => void) | null} */
  #onConfidence = null;

  async connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    /** @type {{ raw:any, byId: Map<string, ResolvedConcept> }} */
    let graph;
    try {
      const meta = getConceptMeta();
      if (!meta) return;
      graph = await loadGraph();
      // The element may have been disconnected while the graph loaded.
      if (!this.isConnected) return;
      const hood = neighborhood(meta.id, graph.byId);
      if (!hood) return; // current concept not in the (possibly stale) graph
      this.#render(root, graph.byId, hood);
    } catch (err) {
      console.warn("primer-pathway: could not build the navigation map —", err);
    }
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer = null;
    if (this.#onConfidence) document.removeEventListener("confidence-change", this.#onConfidence);
    this.#onConfidence = null;
  }

  /**
   * @param {ShadowRoot} root
   * @param {Map<string, ResolvedConcept>} byId
   * @param {NonNullable<ReturnType<typeof neighborhood>>} hood
   */
  #render(root, byId, hood) {
    /** @param {string} id */
    const title = (id) => byId.get(id)?.title ?? leaf(id);
    /** Sort ids by resolved level, then title. @param {string[]} ids */
    const byLevel = (ids) =>
      [...ids].sort(
        (a, b) =>
          (byId.get(a)?.level ?? 0) - (byId.get(b)?.level ?? 0) || title(a).localeCompare(title(b)),
      );

    const col1 = byLevel(hood.ancestors);
    const col3 = byLevel(hood.descendants);
    const peers = byLevel(hood.peers);
    const above = peers.slice(0, Math.ceil(peers.length / 2));
    const below = peers.slice(above.length);

    /** @param {string} id */
    const link = (id) =>
      `<a class="node" href="/concepts/${id}.html" data-id="${esc(id)}" title="${esc(title(id))}">${esc(title(id))}</a>`;
    const current = `<span class="node node--current" data-id="${esc(hood.id)}" aria-current="page" title="${esc(title(hood.id))}">${esc(title(hood.id))}</span>`;

    /** Render a column with an overflow "+k more" chip past MAX_PER_COL.
     * @param {string} cls @param {string[]} ids */
    const column = (cls, ids) => {
      const shown = ids.slice(0, MAX_PER_COL).map(link);
      const extra = ids.length - MAX_PER_COL;
      if (extra > 0) shown.push(`<span class="more">+${extra} more</span>`);
      return `<div class="col ${cls}">${shown.join("")}</div>`;
    };

    const col2 = `<div class="col col2">${[...above.map(link), current, ...below.map(link)].join("")}</div>`;

    root.innerHTML = `
      <style>${STYLE}</style>
      <nav class="pathway" aria-label="Concept pathway">
        <div class="cols">
          ${column("col1", col1)}
          ${col2}
          ${column("col3", col3)}
        </div>
        <svg class="wires" aria-hidden="true"></svg>
      </nav>`;

    const pathway = /** @type {HTMLElement} */ (root.querySelector(".pathway"));
    const svg = /** @type {SVGSVGElement} */ (root.querySelector(".wires"));
    const draw = () => this.#drawWires(pathway, svg, hood.edges);

    // Draw after layout, then on every resize (ResizeObserver fires once on observe).
    requestAnimationFrame(draw);
    this.#observer = new ResizeObserver(draw);
    this.#observer.observe(pathway);

    const nodes = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(".node")]);

    // Colour each node from its rating, and re-colour live when the learner changes
    // their stars on this page (primer-concept dispatches a composed confidence-change).
    for (const el of nodes) paintNode(el);
    this.#onConfidence = (e) => {
      const id = /** @type {any} */ (e).detail?.conceptId;
      if (!id) return;
      const el = root.querySelector(`.node[data-id="${cssEscape(id)}"]`);
      if (el) paintNode(el);
    };
    document.addEventListener("confidence-change", this.#onConfidence);

    // Hover: emphasise a node's connected nodes + edges and dim the rest.
    /** @type {Map<string, Set<string>>} */
    const adj = new Map();
    /** @param {string} x @param {string} y */
    const linkAdj = (x, y) => {
      let s = adj.get(x);
      if (!s) adj.set(x, (s = new Set()));
      s.add(y);
    };
    for (const { a, b } of hood.edges) {
      linkAdj(a, b);
      linkAdj(b, a);
    }
    /** @param {string} id @param {boolean} on */
    const setHot = (id, on) => {
      const hot = new Set([id, ...(adj.get(id) ?? [])]);
      for (const el of nodes) {
        const nid = el.getAttribute("data-id") ?? "";
        el.classList.toggle("is-hot", on && hot.has(nid));
        el.classList.toggle("is-dim", on && !hot.has(nid));
      }
      for (const ln of svg.querySelectorAll("line")) {
        const incident = ln.getAttribute("data-a") === id || ln.getAttribute("data-b") === id;
        ln.classList.toggle("is-hot", on && incident);
        ln.classList.toggle("is-dim", on && !incident);
      }
    };
    for (const el of nodes) {
      const id = el.getAttribute("data-id") ?? "";
      el.addEventListener("mouseenter", () => setHot(id, true));
      el.addEventListener("mouseleave", () => setHot(id, false));
    }
  }

  /**
   * Measure each node's centre and draw a line per edge into the SVG layer.
   * @param {HTMLElement} pathway
   * @param {SVGSVGElement} svg
   * @param {{ a: string, b: string }[]} edges
   */
  #drawWires(pathway, svg, edges) {
    const box = pathway.getBoundingClientRect();
    if (box.width === 0) return;
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);

    /** @param {string} id */
    const centre = (id) => {
      const el = pathway.querySelector(`.node[data-id="${cssEscape(id)}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 };
    };

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    for (const { a, b } of edges) {
      const p = centre(a);
      const q = centre(b);
      if (!p || !q) continue;
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(p.x));
      line.setAttribute("y1", String(p.y));
      line.setAttribute("x2", String(q.x));
      line.setAttribute("y2", String(q.y));
      line.setAttribute("data-a", a);
      line.setAttribute("data-b", b);
      svg.appendChild(line);
    }
  }
}

/** Last path segment of an id (fallback label when a title is missing). @param {string} id */
function leaf(id) {
  return id.split("/").pop() ?? id;
}

/** @param {string} s */
function esc(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      /** @type {Record<string, string>} */ ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

/** Escape an id for use inside a CSS attribute selector (ids contain "/"). @param {string} id */
function cssEscape(id) {
  const cssAny = /** @type {any} */ (window.CSS);
  return cssAny && typeof cssAny.escape === "function" ? cssAny.escape(id) : id.replace(/["\\]/g, "\\$&");
}

if (!customElements.get("primer-pathway")) {
  customElements.define("primer-pathway", PrimerPathway);
}
