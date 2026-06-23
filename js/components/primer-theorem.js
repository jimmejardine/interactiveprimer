// @ts-check
/**
 * <primer-theorem> — a labelled callout that wraps a formal theorem statement:
 *
 *   <primer-theorem name="Alternate Interior Angles">
 *     <p>If two parallel lines are cut by a transversal, then each pair of
 *        alternate interior angles is equal.</p>
 *   </primer-theorem>
 *
 * For now it is deliberately a *simple wrapper*: like <primer-card> it stays in the
 * light DOM and just adopts the shared `.theorem` class, so its styling (the accent
 * rule, the "Theorem" eyebrow) comes from css/primer.css — slotted content is styled
 * by the document stylesheet, not a component's shadow sheet. The optional `name`
 * attribute names the theorem and is surfaced in the eyebrow.
 *
 * The point of marking theorems with their own element (rather than an ad-hoc styled
 * block) is forward-looking: a single semantic tag lets us later harvest *every*
 * theorem across the Primer — its name and statement — straight from the page markup.
 * @module
 */

export class PrimerTheorem extends HTMLElement {
  #built = false;

  connectedCallback() {
    this.classList.add("theorem");
    if (this.#built) return; // prepend the eyebrow once
    this.#built = true;
    const name = this.getAttribute("name");
    const eyebrow = document.createElement("div");
    eyebrow.className = "eyebrow";
    const icon = document.createElement("span");
    icon.className = "eyebrow-icon"; // gears icon, masked + tinted via css/primer.css
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "eyebrow-label";
    label.textContent = name ? `Theorem — ${name}` : "Theorem";
    eyebrow.append(icon, label);
    this.prepend(eyebrow);
  }
}

if (!customElements.get("primer-theorem")) {
  customElements.define("primer-theorem", PrimerTheorem);
}
