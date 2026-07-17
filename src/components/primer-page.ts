/**
 * <primer-page> — the page shell that wraps the slotted concept content.
 *
 * It renders no header or footer: prerequisites and navigation are surfaced by the
 * knowledge graph / pathway widget, and the declared level sits beside the concept title
 * (see src/components/primer-concept.ts).
 * @module
 */

import { attachShared } from "./shared.ts";

export class PrimerPage extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    root.innerHTML = `<slot></slot>`;
  }
}

if (!customElements.get("primer-page")) {
  customElements.define("primer-page", PrimerPage);
}
