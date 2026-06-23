// @ts-check
/**
 * <primer-vignette title="…"> — a collapsible "interesting detour" inside a card:
 *
 *   <primer-card>
 *     <p>… the main idea …</p>
 *     <primer-vignette title="Why is it called that?">
 *       <p>An optional aside for the curious …</p>
 *     </primer-vignette>
 *   </primer-card>
 *
 * Like <primer-card> / <primer-theorem> it stays in the **light DOM** so nested
 * <primer-math> etc. still upgrade. It starts collapsed (only the title row shows) and
 * expands like a normal card when clicked. The collapse uses a native <details>/<summary>
 * for free keyboard + screen-reader support; the summary is an eyebrow (footsteps icon +
 * title) styled by css/primer.css (the `.vignette*` rules), and the original children are
 * moved into the details body. A vignette is content the learner does NOT need for the
 * concept — it's there if they're interested or want more clarification.
 * @module
 */

export class PrimerVignette extends HTMLElement {
  #built = false;

  connectedCallback() {
    if (this.#built) return; // build once; survive a disconnect/reconnect
    this.#built = true;
    this.classList.add("vignette");

    const title = this.getAttribute("title") || "Aside";

    const details = document.createElement("details");
    details.className = "vignette-details"; // collapsed by default (no `open`)

    const summary = document.createElement("summary");
    summary.className = "vignette-summary";
    const eyebrow = document.createElement("div");
    eyebrow.className = "eyebrow";
    const icon = document.createElement("span");
    icon.className = "eyebrow-icon";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "eyebrow-label";
    label.textContent = title;
    eyebrow.append(icon, label);
    summary.append(eyebrow);

    const body = document.createElement("div");
    body.className = "vignette-body";
    while (this.firstChild) body.appendChild(this.firstChild); // move the aside's content in

    details.append(summary, body);
    this.appendChild(details);
  }
}

if (!customElements.get("primer-vignette")) {
  customElements.define("primer-vignette", PrimerVignette);
}
