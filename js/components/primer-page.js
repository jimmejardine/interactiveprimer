// @ts-check
/**
 * <primer-page> — the page shell: the concept content (slotted) and a footer back to
 * the tree.
 *
 * It no longer renders a header. Prerequisites are surfaced by the knowledge graph /
 * navigation pathway widget, and the declared level now sits beside the concept title
 * (see js/components/primer-concept.js).
 * @module
 */

import { attachShared } from "./shared.js";
import { t } from "../i18n.js";

export class PrimerPage extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);
    root.innerHTML = `
      <slot></slot>
      <footer class="page-foot meta" style="margin-top:2rem;">
        <a href="/index.html">${t("page.backToTree")}</a>
      </footer>`;
  }
}

if (!customElements.get("primer-page")) {
  customElements.define("primer-page", PrimerPage);
}
