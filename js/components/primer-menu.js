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
import {
  exportProgress,
  readProgressFile,
  applyProgress,
  hasExistingProgress,
} from "../progress.js";

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

  .file-input { display: none; }
  .status { margin: 0.5rem 0 0; font-size: 0.8rem; color: var(--primer-ink-soft, #667); }
  .status[hidden] { display: none; }
  .status.error { color: var(--primer-danger, #c0392b); }

  /* Modal backdrop + dialog for the merge/overwrite restore choice (three options, so a
     native confirm() — which only offers two — won't do). */
  .backdrop {
    position: fixed; inset: 0; z-index: 1100;
    background: rgba(0,0,0,0.35);
    display: none; place-items: center;
  }
  .backdrop.open { display: grid; }
  .dialog {
    background: var(--primer-surface, #fff);
    border: 1px solid var(--primer-border, #ddd);
    border-radius: var(--primer-radius, 0.6rem);
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    padding: 1.25rem; max-width: 22rem; margin: 1rem;
    color: var(--primer-ink, #111);
  }
  .dialog h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
  .dialog p { margin: 0 0 1rem; font-size: 0.9rem; color: var(--primer-ink-soft, #667); }
  .dialog .actions { display: flex; flex-direction: column; gap: 0.4rem; }
  .dialog .view[hidden] { display: none; }
  .dialog button.danger {
    background: var(--primer-danger, #c0392b);
    color: #fff; border-color: transparent;
  }
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
        <div class="group">
          <p class="group-label" id="progress-label">${t("menu.progress")}</p>
          <div class="choices" role="group" aria-labelledby="progress-label">
            <button type="button" class="save">${t("menu.save")}</button>
            <button type="button" class="restore">${t("menu.restore")}</button>
          </div>
          <p class="status" role="status" aria-live="polite" hidden></p>
          <input type="file" class="file-input" accept=".gz,.json,application/gzip,application/json" />
        </div>
      </div>
      <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="restore-title">
        <div class="dialog">
          <h2 id="restore-title">${t("progress.restoreTitle")}</h2>
          <div class="view view-choice">
            <p>${t("progress.restorePrompt")}</p>
            <div class="actions">
              <button type="button" class="merge">${t("progress.merge")}</button>
              <button type="button" class="overwrite">${t("progress.overwrite")}</button>
              <button type="button" class="cancel">${t("progress.cancel")}</button>
            </div>
          </div>
          <div class="view view-confirm" hidden>
            <p>${t("progress.overwriteConfirm")}</p>
            <div class="actions">
              <button type="button" class="confirm-overwrite danger">${t("progress.overwriteConfirmYes")}</button>
              <button type="button" class="cancel">${t("progress.cancel")}</button>
            </div>
          </div>
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

    // --- Save / restore progress -------------------------------------------------------
    const saveBtn = /** @type {HTMLButtonElement} */ (root.querySelector(".save"));
    const restoreBtn = /** @type {HTMLButtonElement} */ (root.querySelector(".restore"));
    const fileInput = /** @type {HTMLInputElement} */ (root.querySelector(".file-input"));
    const status = /** @type {HTMLElement} */ (root.querySelector(".status"));
    const backdrop = /** @type {HTMLElement} */ (root.querySelector(".backdrop"));

    /** @param {string} msg @param {boolean} [isError] */
    const showStatus = (msg, isError = false) => {
      status.textContent = msg;
      status.classList.toggle("error", isError);
      status.hidden = false;
    };

    saveBtn.addEventListener("click", () => {
      void exportProgress();
      setOpen(false);
    });

    restoreBtn.addEventListener("click", () => fileInput.click());

    const viewChoice = /** @type {HTMLElement} */ (root.querySelector(".view-choice"));
    const viewConfirm = /** @type {HTMLElement} */ (root.querySelector(".view-confirm"));

    /** Entries awaiting a merge/overwrite choice in the dialog. */
    let pending = /** @type {import("../progress.js").ProgressEntry[] | null} */ (null);

    // Open the dialog on the first (merge/overwrite) view; overwrite then asks to confirm.
    const openDialog = () => {
      viewConfirm.hidden = true;
      viewChoice.hidden = false;
      backdrop.classList.add("open");
    };
    const closeDialog = () => {
      backdrop.classList.remove("open");
      pending = null;
    };

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.value = ""; // reset so re-picking the same file fires `change` again
      if (!file) return;
      try {
        const entries = await readProgressFile(file);
        if (hasExistingProgress()) {
          pending = entries; // let the learner choose merge vs overwrite
          openDialog();
        } else {
          applyProgress(entries, "merge"); // nothing local to clash with
          showStatus(t("progress.imported", { n: entries.length }));
          location.reload();
        }
      } catch (err) {
        showStatus(t("progress.importError", { error: String(/** @type {any} */ (err)?.message ?? err) }), true);
      }
    });

    /** @param {"merge" | "overwrite"} mode */
    const finishRestore = (mode) => {
      backdrop.classList.remove("open");
      if (!pending) return;
      applyProgress(pending, mode);
      pending = null;
      location.reload();
    };
    /** @type {HTMLButtonElement} */ (root.querySelector(".merge")).addEventListener("click", () => finishRestore("merge"));
    // Overwrite erases everything, so step to a confirmation view rather than acting at once.
    /** @type {HTMLButtonElement} */ (root.querySelector(".overwrite")).addEventListener("click", () => {
      viewChoice.hidden = true;
      viewConfirm.hidden = false;
    });
    /** @type {HTMLButtonElement} */ (root.querySelector(".confirm-overwrite")).addEventListener(
      "click",
      () => finishRestore("overwrite"),
    );
    // Both views carry a Cancel button; either dismisses the whole dialog.
    for (const c of /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll(".cancel")])) {
      c.addEventListener("click", closeDialog);
    }

    // Keep the pressed state in sync if the theme changes elsewhere.
    this.#onThemeChange = () => reflect();
    document.addEventListener("theme-change", this.#onThemeChange);

    // Clicking the dimmed backdrop (outside the dialog) cancels the restore.
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeDialog();
    });

    // Close on Escape (the dialog first, if open) and on a click outside this element.
    this.#onKeydown = (e) => {
      if (e.key !== "Escape") return;
      if (backdrop.classList.contains("open")) closeDialog();
      else setOpen(false);
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
