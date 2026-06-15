// @ts-check
/**
 * <primer-menu> — a fixed top-right hamburger button that opens a small menu with the
 * Theme switcher (Light / Dark / Fun) and the Language switcher. It is mounted once per
 * page (by js/render.js on concept pages, and by index.html on the landing page).
 *
 * Its own labels are localized via i18n's `t(...)`; the language options use each locale's
 * endonym (e.g. "Español"), which is conventionally not translated.
 * @module
 */

import { attachShared } from "./shared.js";
import { THEMES, getTheme, applyTheme } from "../theme.js";
import { LOCALES, getLocale, applyLocale, t } from "../i18n.js";

/** @typedef {import("../theme.js").ThemeId} ThemeId */
/** @typedef {import("../i18n.js").LocaleId} LocaleId */

const HAMBURGER_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="20" height="20">' +
  '<path d="M3 6h18M3 12h18M3 18h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
  "</svg>";

const STYLE = `
  :host { position: fixed; top: 0.75rem; right: 0.75rem; z-index: 1000; }

  .toggle {
    display: grid; place-items: center;
    width: 2.5rem; height: 2.5rem; padding: 0;
    border-radius: 0.6rem;
    color: var(--primer-ink, #111);
    box-shadow: 0 1px 4px rgba(0,0,0,0.12);
  }

  .panel {
    position: absolute; right: 0; top: calc(100% + 0.4rem);
    min-width: 11rem;
    background: var(--primer-surface, #fff);
    border: 1px solid var(--primer-border, #ddd);
    border-radius: var(--primer-radius, 0.6rem);
    box-shadow: 0 6px 24px rgba(0,0,0,0.18);
    padding: 0.75rem;
    display: none;
  }
  .panel.open { display: block; }

  .group + .group { margin-top: 0.75rem; }
  .group-label {
    font-family: var(--primer-font-ui, sans-serif);
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--primer-ink-soft, #667);
    margin: 0 0 0.4rem;
  }
  .choices { display: flex; flex-direction: column; gap: 0.35rem; }
  .choices button { text-align: left; }
`;

export class PrimerMenu extends HTMLElement {
  /** @type {((e: Event) => void) | null} */
  #onDocClick = null;
  /** @type {((e: Event) => void) | null} */
  #onThemeChange = null;
  /** @type {((e: KeyboardEvent) => void) | null} */
  #onKeydown = null;

  connectedCallback() {
    const root = this.shadowRoot ?? attachShared(this);

    const themeButtons = THEMES.map(
      (th) =>
        `<button type="button" class="theme" data-theme-id="${th.id}" aria-pressed="false">${t(
          "theme." + th.id,
        )}</button>`,
    ).join("");

    const langButtons = LOCALES.map(
      (l) =>
        `<button type="button" class="lang" data-locale-id="${l.id}" aria-pressed="false">${l.label}</button>`,
    ).join("");

    root.innerHTML = `
      <style>${STYLE}</style>
      <button class="toggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="${t("menu.label")}">
        ${HAMBURGER_SVG}
      </button>
      <div class="panel" role="menu">
        <div class="group">
          <p class="group-label" id="theme-label">${t("menu.theme")}</p>
          <div class="choices" role="group" aria-labelledby="theme-label">${themeButtons}</div>
        </div>
        <div class="group">
          <p class="group-label" id="lang-label">${t("menu.language")}</p>
          <div class="choices" role="group" aria-labelledby="lang-label">${langButtons}</div>
        </div>
      </div>`;

    const toggle = /** @type {HTMLButtonElement} */ (root.querySelector(".toggle"));
    const panel = /** @type {HTMLElement} */ (root.querySelector(".panel"));
    const themeEls = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll(".theme")]);
    const langEls = /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll(".lang")]);

    const reflect = () => {
      const theme = getTheme();
      for (const b of themeEls) b.setAttribute("aria-pressed", String(b.dataset.themeId === theme));
      const locale = getLocale();
      for (const b of langEls) b.setAttribute("aria-pressed", String(b.dataset.localeId === locale));
    };
    reflect();

    /** @param {boolean} open */
    const setOpen = (open) => {
      panel.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", () => setOpen(!panel.classList.contains("open")));

    for (const b of themeEls) {
      b.addEventListener("click", () => {
        applyTheme(/** @type {ThemeId} */ (b.dataset.themeId));
        reflect();
        setOpen(false);
      });
    }

    // Switching language persists the choice and reloads, so the page re-resolves its
    // translation overlay + chrome strings (applyLocale handles the reload).
    for (const b of langEls) {
      b.addEventListener("click", () => {
        applyLocale(/** @type {LocaleId} */ (b.dataset.localeId));
      });
    }

    // Keep the pressed state in sync if the theme changes elsewhere.
    this.#onThemeChange = () => reflect();
    document.addEventListener("theme-change", this.#onThemeChange);

    // Close on Escape and on a click outside this element.
    this.#onKeydown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", this.#onKeydown);

    this.#onDocClick = (e) => {
      if (!e.composedPath().includes(this)) setOpen(false);
    };
    document.addEventListener("click", this.#onDocClick);
  }

  disconnectedCallback() {
    if (this.#onThemeChange) document.removeEventListener("theme-change", this.#onThemeChange);
    if (this.#onKeydown) document.removeEventListener("keydown", this.#onKeydown);
    if (this.#onDocClick) document.removeEventListener("click", this.#onDocClick);
    this.#onThemeChange = this.#onKeydown = this.#onDocClick = null;
  }
}

if (!customElements.get("primer-menu")) {
  customElements.define("primer-menu", PrimerMenu);
}
