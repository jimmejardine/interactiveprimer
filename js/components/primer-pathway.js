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
  }
  a.node:hover { border-color: var(--primer-accent, #46e); color: var(--primer-accent, #46e); }
  .node--current {
    background: var(--primer-accent, #46e);
    color: var(--primer-accent-ink, #fff);
    border-color: transparent;
    font-weight: 600;
  }
  .more { font-size: 0.72rem; color: var(--primer-ink-soft, #667); padding: 0.15rem 0.4rem; }

  .wires {
    position: absolute; inset: 0; width: 100%; height: 100%;
    pointer-events: none; z-index: 0; overflow: visible;
  }
`;

export class PrimerPathway extends HTMLElement {
  /** @type {ResizeObserver | null} */
  #observer = null;

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
      line.setAttribute("stroke", "var(--primer-border, #ccc)");
      line.setAttribute("stroke-width", "1.5");
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
