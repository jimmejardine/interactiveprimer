// @ts-check
/**
 * <primer-pathway> — a small visual map of where the current concept sits in the
 * knowledge tree, rendered at the top and bottom of every lesson (inserted by
 * js/render.js). Three columns, centred on the current concept:
 *
 *   column 1: immediate predecessors (direct prerequisites)
 *   column 2: peers above, the CURRENT concept in the centre, peers below
 *   column 3: immediate successors (direct dependents)
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
import { neighborhood } from "../graph.js";
import { loadGraph } from "../graph-data.js";
import { t, getLocale } from "../i18n.js";

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
  // Saturation/lightness are theme-driven so the ramp stays legible against the node
  // text in every theme (e.g. darker, muted fills in dark mode). See css/primer.css.
  const s = getComputedStyle(document.documentElement);
  const sat = s.getPropertyValue("--primer-conf-sat").trim() || "70%";
  const light = s.getPropertyValue("--primer-conf-light").trim() || "62%";
  return `hsl(${hue}, ${sat}, ${light})`;
}

/** Paint a node element from its concept's rating (clears to the default when unrated). @param {Element} el */
function paintNode(el) {
  /** @type {HTMLElement} */ (el).style.background = confidenceColor(el.getAttribute("data-id") ?? "") ?? "";
}

const STYLE = `
  :host { display: block; }
  /* Scroll viewport: on a narrow screen the (nowrap) node pills make the 3-column grid
     wider than the page, so we scroll the whole map horizontally instead of widening the
     page or squashing pills. #render centres this on the current concept after layout. */
  .scroll {
    overflow-x: auto; overflow-y: hidden; max-width: 100%; margin: 1.25rem 0;
    scrollbar-width: thin; overscroll-behavior-x: contain;
  }
  /* The scrolled CONTENT (carries the wires overlay): width is auto, so it fills the
     viewport and the columns compress (pills ellipsize) as it narrows. The min-width is the
     floor below which the columns stop narrowing and the .scroll parent shows a horizontal
     scrollbar instead — so it sets the per-column node spacing on small screens (each column
     is ~1/3 of it). Keep it generous so phone pills don't crush; the scrollbar takes the rest.
     (Grid tracks stay minmax(0,1fr) below, so .cols always == .pathway width and the wires
     stay aligned.) Keep this element the wires' offset parent so #drawWires keeps aligning and
     the wires scroll with the nodes. */
  .pathway { position: relative; margin: 0; min-width: 32rem; }
  .cols {
    position: relative; z-index: 1;
    /* minmax(0, 1fr) lets a track shrink below its pill's text so the pill can ellipsize
       (rather than forcing the whole grid wider than the page). */
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
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
  /** @type {(() => void) | null} */
  #onTheme = null;

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
    if (this.#onTheme) document.removeEventListener("theme-change", this.#onTheme);
    this.#onTheme = null;
  }

  /**
   * @param {ShadowRoot} root
   * @param {Map<string, ResolvedConcept>} byId
   * @param {NonNullable<ReturnType<typeof neighborhood>>} hood
   */
  #render(root, byId, hood) {
    // Label nodes in the active language: a node's translated title when the overlays
    // provided one (harvested into graph.json by build-graph), else the English title.
    const locale = getLocale();
    /** @param {string} id */
    const title = (id) => {
      const c = byId.get(id);
      return c?.titles?.[locale] ?? c?.title ?? leaf(id);
    };
    /** Sort ids by resolved level, then title. @param {string[]} ids */
    const byLevel = (ids) =>
      [...ids].sort(
        (a, b) =>
          (byId.get(a)?.level ?? 0) - (byId.get(b)?.level ?? 0) || title(a).localeCompare(title(b)),
      );

    const col1 = byLevel(hood.predecessors);
    const col3 = byLevel(hood.successors);
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
      if (extra > 0) shown.push(`<span class="more">${t("pathway.more", { extra })}</span>`);
      return `<div class="col ${cls}">${shown.join("")}</div>`;
    };

    const col2 = `<div class="col col2">${[...above.map(link), current, ...below.map(link)].join("")}</div>`;

    root.innerHTML = `
      <style>${STYLE}</style>
      <div class="scroll">
        <nav class="pathway" aria-label="${t("pathway.label")}">
          <div class="cols">
            ${column("col1", col1)}
            ${col2}
            ${column("col3", col3)}
          </div>
          <svg class="wires" aria-hidden="true"></svg>
        </nav>
      </div>`;

    const scroll = /** @type {HTMLElement} */ (root.querySelector(".scroll"));
    const pathway = /** @type {HTMLElement} */ (root.querySelector(".pathway"));
    const svg = /** @type {SVGSVGElement} */ (root.querySelector(".wires"));
    const draw = () => this.#drawWires(pathway, svg, hood.edges);

    // Scroll the strip so the current concept starts centred (only meaningful when the map
    // is wider than the viewport; on a wide screen it's already centred so this is ~0).
    const centerOnCurrent = () => {
      const cur = /** @type {HTMLElement | null} */ (root.querySelector(".node--current"));
      if (!cur) return;
      scroll.scrollLeft = Math.max(0, cur.offsetLeft + cur.offsetWidth / 2 - scroll.clientWidth / 2);
    };

    // Draw + centre after first layout; redraw wires on resize (don't re-centre, so we
    // don't fight a learner who has scrolled). ResizeObserver fires once on observe.
    requestAnimationFrame(() => {
      draw();
      centerOnCurrent();
    });
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

    // Re-paint the rating colours when the theme changes (the fills are inline styles,
    // so unlike CSS var() they don't update themselves).
    this.#onTheme = () => {
      for (const el of nodes) paintNode(el);
    };
    document.addEventListener("theme-change", this.#onTheme);

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
