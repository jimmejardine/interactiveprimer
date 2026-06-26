// @ts-check
/**
 * <primer-menu> — a fixed top-right hamburger button that opens a small drill-down menu.
 * The root lists three sections — Theme (Light / Dark / Fun), Language, and Progress
 * (save / restore) — and each opens a sub-view with the choices and a back header. It is
 * mounted once per page (by js/render.js on concept pages, and by index.html on the landing).
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
import { getCurrentCourse, setCurrentCourse, clearCourse } from "../course.js";
import { loadGraph } from "../graph-data.js";
import { confirmDialog } from "../confirm-dialog.js";

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
    width: 2.6rem; height: 2.6rem; padding: 0;
    border-radius: 0.7rem;
    color: var(--primer-ink, #111);
    box-shadow: var(--primer-shadow-md, 0 2px 8px rgba(0,0,0,0.12));
  }
  .toggle:hover { transform: translateY(-1px); }

  .panel {
    position: absolute; right: 0; top: calc(100% + 0.45rem);
    min-width: 11.5rem;
    background: var(--primer-surface, #fff);
    border: 1px solid var(--primer-border, #ddd);
    border-radius: var(--primer-radius, 0.6rem);
    box-shadow: var(--primer-shadow-lg, 0 12px 36px rgba(0,0,0,0.18));
    padding: 0.75rem;
    display: none;
  }
  .panel.open { display: block; }

  /* The panel is a small drill-down: a root list of sections (Theme / Language / Progress),
     each opening a sub-view (.menu-view) with a back header and that section's choices. */
  .menu-view[hidden] { display: none; }

  .nav {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; text-align: left;
  }
  .nav + .nav { margin-top: 0.35rem; }
  .nav .chev { opacity: 0.55; margin-left: 0.75rem; }

  .back {
    width: 100%; text-align: left; margin-bottom: 0.5rem;
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--primer-ink-soft, #667);
  }

  .choices { display: flex; flex-direction: column; gap: 0.35rem; }
  .choices button { text-align: left; }

  /* The active course's name in the Course sub-view: a link to its page, tinted with the course colour. */
  .course-name {
    display: block; text-align: left; font-weight: 600;
    color: var(--primer-ink, #111); text-decoration: none;
    padding: 0.3rem 0.4rem; border-left: 3px solid var(--primer-course, #e3b15c);
  }
  .course-name:hover { text-decoration: underline; }

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
  /** @type {(() => void) | null} */
  #onCourseChange = null;

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
        <div class="menu-view view-root">
          <button type="button" class="nav" data-href="/">${t("menu.home")}</button>
          <button type="button" class="nav" data-href="/concepts.html">${t("menu.explore")}</button>
          <button type="button" class="nav nav-course" data-target="course" hidden>${t("menu.course")}<span class="chev" aria-hidden="true">›</span></button>
          <button type="button" class="nav" data-target="progress">${t("menu.progress")}<span class="chev" aria-hidden="true">›</span></button>
          <button type="button" class="nav" data-target="theme">${t("menu.theme")}<span class="chev" aria-hidden="true">›</span></button>
          <button type="button" class="nav" data-target="lang">${t("menu.language")}<span class="chev" aria-hidden="true">›</span></button>
          <button type="button" class="nav" data-extern="https://github.com/jimmejardine/interactiveprimer/discussions">${t("menu.feedback")}<span class="chev" aria-hidden="true">↗</span></button>
        </div>
        <div class="menu-view view-theme" hidden>
          <button type="button" class="back"><span aria-hidden="true">‹ </span>${t("menu.theme")}</button>
          <div class="choices" role="group" aria-label="${t("menu.theme")}">${themeButtons}</div>
        </div>
        <div class="menu-view view-lang" hidden>
          <button type="button" class="back"><span aria-hidden="true">‹ </span>${t("menu.language")}</button>
          <div class="choices" role="group" aria-label="${t("menu.language")}">${langButtons}</div>
        </div>
        <div class="menu-view view-progress" hidden>
          <button type="button" class="back"><span aria-hidden="true">‹ </span>${t("menu.progress")}</button>
          <div class="choices" role="group" aria-label="${t("menu.progress")}">
            <button type="button" class="save">${t("menu.save")}</button>
            <button type="button" class="restore">${t("menu.restore")}</button>
          </div>
          <p class="status" role="status" aria-live="polite" hidden></p>
          <input type="file" class="file-input" accept=".gz,.json,application/gzip,application/json" />
        </div>
        <div class="menu-view view-course" hidden>
          <button type="button" class="back"><span aria-hidden="true">‹ </span>${t("menu.course")}</button>
          <div class="choices" role="group" aria-label="${t("menu.course")}">
            <a class="course-name" href="#"></a>
            <button type="button" class="exit-course">${t("course.exit")}</button>
          </div>
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

    // Drill-down navigation: a root list, then one sub-view per section.
    const menuViews = /** @type {Record<string, HTMLElement>} */ ({
      root: /** @type {HTMLElement} */ (root.querySelector(".view-root")),
      theme: /** @type {HTMLElement} */ (root.querySelector(".view-theme")),
      lang: /** @type {HTMLElement} */ (root.querySelector(".view-lang")),
      progress: /** @type {HTMLElement} */ (root.querySelector(".view-progress")),
      course: /** @type {HTMLElement} */ (root.querySelector(".view-course")),
    });
    /** @param {string} name */
    const showView = (name) => {
      for (const [key, el] of Object.entries(menuViews)) el.hidden = key !== name;
    };

    /** @param {boolean} open */
    const setOpen = (open) => {
      if (open) showView("root"); // always reopen at the top level
      panel.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", () => setOpen(!panel.classList.contains("open")));

    for (const b of /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll(".nav")])) {
      if (b.dataset.target) b.addEventListener("click", () => showView(/** @type {string} */ (b.dataset.target)));
      else if (b.dataset.href) b.addEventListener("click", () => { window.location.href = /** @type {string} */ (b.dataset.href); });
      else if (b.dataset.extern) b.addEventListener("click", () => {
        window.open(/** @type {string} */ (b.dataset.extern), "_blank", "noopener");
        setOpen(false);
      });
    }
    for (const b of /** @type {HTMLButtonElement[]} */ ([...root.querySelectorAll(".back")])) {
      b.addEventListener("click", () => showView("root"));
    }

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

    // --- Course: show the active course's name + an Exit; the root item only appears in a course.
    const navCourse = /** @type {HTMLButtonElement} */ (root.querySelector(".nav-course"));
    const courseNameEl = /** @type {HTMLAnchorElement} */ (root.querySelector(".course-name"));
    const reflectCourse = async () => {
      const course = getCurrentCourse();
      navCourse.hidden = !course;
      if (!course) return;
      courseNameEl.href = `/concepts/${course}.html`;
      courseNameEl.textContent = t("course.none"); // placeholder until the title resolves
      try {
        const { byId } = await loadGraph();
        const c = byId.get(course);
        courseNameEl.textContent = c ? (c.titles?.[getLocale()] ?? c.title) : (course.split("/").pop() ?? course);
      } catch {
        courseNameEl.textContent = course.split("/").pop() ?? course;
      }
    };
    void reflectCourse();
    /** @type {HTMLButtonElement} */ (root.querySelector(".exit-course")).addEventListener("click", () => {
      clearCourse();
      showView("root");
      setOpen(false);
    });
    this.#onCourseChange = () => void reflectCourse();
    document.addEventListener("course-change", this.#onCourseChange);

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
        const { entries, course: importedCourse } = await readProgressFile(file);
        // A course clash: the file carries a course different from the current one. Ask whether to
        // adopt it. (No current course → adopt silently; same course → nothing to ask.)
        const cur = getCurrentCourse();
        if (importedCourse && cur && importedCourse !== cur) {
          let importedTitle = importedCourse.split("/").pop() ?? importedCourse;
          try {
            const { byId } = await loadGraph();
            importedTitle = byId.get(importedCourse)?.title ?? importedTitle;
          } catch {
            /* fall back to the leaf id */
          }
          if (await confirmDialog({ message: t("course.importClash", { course: importedTitle }), confirm: t("course.switch"), cancel: t("course.keep") })) {
            setCurrentCourse(importedCourse);
          }
        } else if (importedCourse && !cur) {
          setCurrentCourse(importedCourse);
        }
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
    if (this.#onCourseChange) document.removeEventListener("course-change", this.#onCourseChange);
    this.#onThemeChange = this.#onKeydown = this.#onDocClick = this.#onCourseChange = null;
  }
}

if (!customElements.get("primer-menu")) {
  customElements.define("primer-menu", PrimerMenu);
}
