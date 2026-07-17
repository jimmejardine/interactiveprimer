/**
 * <primer-menu> — a fixed top-right hamburger button that opens a small drill-down menu.
 * The root lists three sections — Theme (Light / Dark / Fun), Language, and Progress
 * (save / restore) — and each opens a sub-view with the choices and a back header. It is
 * mounted once per page (by src/render.ts on concept pages, and by index.html on the landing).
 *
 * Its own labels are localized via i18n's `t(...)`; the language options use each locale's
 * endonym (e.g. "Español"), which is conventionally not translated.
 * @module
 */

import { attachShared } from "./shared.ts";
import { THEMES, getTheme, applyTheme } from "../theme.ts";
import { LOCALES, getLocale, applyLocale, t } from "../i18n.ts";
import {
  exportProgress,
  readProgressFile,
  applyProgress,
  hasExistingProgress,
  clearLocalProgress,
} from "../progress.ts";
import { getCurrentCourse, setCurrentCourse } from "../course.ts";
import { loadGraph } from "../graph-data.ts";
import { confirmDialog } from "../confirm-dialog.ts";
import { trapFocus } from "../focus-trap.ts";
import {
  getUser,
  initAccount,
  requestCode,
  submitCode,
  signOutAccount,
  logoutAllDevices,
  deleteCloudData,
} from "../account.ts";
import { syncNow } from "../cloud-sync.ts";

import type { ThemeId } from "../theme.ts";
import type { LocaleId } from "../i18n.ts";
import type { ProgressEntry } from "../progress.ts";

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
  @media (prefers-reduced-motion: reduce) { .toggle:hover { transform: none; } }

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

  /* Progress sub-view: section labels (Local / Cloud) + the cloud sign-in form. */
  .section-label {
    margin: 0.65rem 0 0.35rem; font-size: 0.72rem; text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--primer-ink-soft, #667);
  }
  .choices button.danger { color: var(--primer-danger, #c0392b); }
  .cloud-section[hidden], .email-form[hidden], .code-form[hidden],
  .cloud-in[hidden], .cloud-out[hidden] { display: none; }
  .email-form, .code-form { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.35rem; }
  .email-input, .code-input {
    width: 100%; box-sizing: border-box; padding: 0.4rem 0.5rem; font: inherit;
    border: 1px solid var(--primer-border, #ccc); border-radius: 0.4rem;
    background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
  }
  .code-input { text-transform: uppercase; letter-spacing: 0.25em; text-align: center; }
  .logged-in-as { margin: 0 0 0.4rem; font-size: 0.85rem; color: var(--primer-ink, #111); word-break: break-all; }
  .cloud-status { margin: 0.4rem 0 0; font-size: 0.8rem; text-align: center; color: var(--primer-danger, #c0392b); }
  .cloud-status[hidden] { display: none; }
`;

export class PrimerMenu extends HTMLElement {
  #onDocClick: ((e: Event) => void) | null = null;
  #onThemeChange: ((e: Event) => void) | null = null;
  #onKeydown: ((e: KeyboardEvent) => void) | null = null;
  #onCourseChange: (() => void) | null = null;
  #onAuthChange: (() => void) | null = null;

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
          <button type="button" class="nav" data-href="/progress.html">${t("menu.course")}</button>
          <button type="button" class="nav" data-href="/concepts.html">${t("menu.explore")}</button>
          <button type="button" class="nav" data-target="config">${t("menu.config")}<span class="chev" aria-hidden="true">›</span></button>
          <button type="button" class="nav" data-extern="https://github.com/jimmejardine/interactiveprimer/discussions">${t("menu.feedback")}<span class="chev" aria-hidden="true">↗</span></button>
        </div>
        <div class="menu-view view-config" hidden>
          <button type="button" class="back" data-back="root"><span aria-hidden="true">‹ </span>${t("menu.config")}</button>
          <button type="button" class="nav" data-target="progress">${t("menu.progress")}<span class="chev" aria-hidden="true">›</span></button>
          <button type="button" class="nav" data-target="theme">${t("menu.theme")}<span class="chev" aria-hidden="true">›</span></button>
          <button type="button" class="nav" data-target="lang">${t("menu.language")}<span class="chev" aria-hidden="true">›</span></button>
          <button type="button" class="nav" data-href="/offline.html">${t("menu.offline")}</button>
        </div>
        <div class="menu-view view-theme" hidden>
          <button type="button" class="back" data-back="config"><span aria-hidden="true">‹ </span>${t("menu.theme")}</button>
          <div class="choices" role="group" aria-label="${t("menu.theme")}">${themeButtons}</div>
        </div>
        <div class="menu-view view-lang" hidden>
          <button type="button" class="back" data-back="config"><span aria-hidden="true">‹ </span>${t("menu.language")}</button>
          <div class="choices" role="group" aria-label="${t("menu.language")}">${langButtons}</div>
        </div>
        <div class="menu-view view-progress" hidden>
          <button type="button" class="back" data-back="config"><span aria-hidden="true">‹ </span>${t("menu.progress")}</button>
          <p class="section-label">${t("progress.local")}</p>
          <div class="choices" role="group" aria-label="${t("progress.local")}">
            <button type="button" class="save">${t("menu.save")}</button>
            <button type="button" class="restore">${t("menu.restore")}</button>
            <button type="button" class="clear-local danger">${t("progress.clear")}</button>
          </div>
          <p class="status" role="status" aria-live="polite" hidden></p>
          <input type="file" class="file-input" accept=".gz,.json,application/gzip,application/json" />
          <div class="cloud-section">
            <p class="section-label">${t("progress.cloud")}</p>
            <div class="choices cloud-out">
              <button type="button" class="login">${t("account.login")}</button>
              <form class="email-form" hidden>
                <input type="email" class="email-input" autocomplete="email" inputmode="email" enterkeyhint="send" placeholder="you@example.com" aria-label="${t("account.login")}" />
              </form>
              <form class="code-form" hidden>
                <input type="text" class="code-input" maxlength="6" autocomplete="one-time-code" enterkeyhint="done" autocapitalize="characters" placeholder="ABCDEF" aria-label="${t("account.enterCode")}" />
              </form>
            </div>
            <div class="choices cloud-in" hidden>
              <p class="logged-in-as"></p>
              <button type="button" class="sync-now">${t("account.syncNow")}</button>
              <button type="button" class="logout">${t("account.logout")}</button>
              <button type="button" class="logout-all">${t("account.logoutAll")}</button>
              <button type="button" class="forget-me danger">${t("account.forgetMe")}</button>
            </div>
            <p class="cloud-status" role="status" aria-live="polite" hidden></p>
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

    const toggle = root.querySelector(".toggle") as HTMLButtonElement;
    const panel = root.querySelector(".panel") as HTMLElement;
    const themeEls = [...root.querySelectorAll(".theme")] as HTMLButtonElement[];
    const langEls = [...root.querySelectorAll(".lang")] as HTMLButtonElement[];

    const reflect = () => {
      const theme = getTheme();
      for (const b of themeEls) b.setAttribute("aria-pressed", String(b.dataset.themeId === theme));
      const locale = getLocale();
      for (const b of langEls) b.setAttribute("aria-pressed", String(b.dataset.localeId === locale));
    };
    reflect();

    // Drill-down navigation: a root list, then one sub-view per section.
    const menuViews: Record<string, HTMLElement> = {
      root: root.querySelector(".view-root") as HTMLElement,
      theme: root.querySelector(".view-theme") as HTMLElement,
      lang: root.querySelector(".view-lang") as HTMLElement,
      progress: root.querySelector(".view-progress") as HTMLElement,
      config: root.querySelector(".view-config") as HTMLElement,
    };
    const showView = (name: string) => {
      for (const [key, el] of Object.entries(menuViews)) el.hidden = key !== name;
    };

    const setOpen = (open: boolean) => {
      if (open) showView("root"); // always reopen at the top level
      panel.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      // On open, move keyboard focus into the panel (ARIA menu-button pattern). Closing focus is
      // handled at the call site (Escape returns to the toggle; outside-click/navigation don't).
      if (open) (panel.querySelector(".view-root .nav") as HTMLElement | null)?.focus();
    };

    toggle.addEventListener("click", () => setOpen(!panel.classList.contains("open")));

    for (const b of [...root.querySelectorAll(".nav")] as HTMLButtonElement[]) {
      if (b.dataset.target) b.addEventListener("click", () => showView(b.dataset.target as string));
      else if (b.dataset.href) b.addEventListener("click", () => { window.location.href = b.dataset.href as string; });
      else if (b.dataset.extern) b.addEventListener("click", () => {
        window.open(b.dataset.extern as string, "_blank", "noopener");
        setOpen(false);
      });
    }
    for (const b of [...root.querySelectorAll(".back")] as HTMLButtonElement[]) {
      b.addEventListener("click", () => showView(b.dataset.back || "root"));
    }

    for (const b of themeEls) {
      b.addEventListener("click", () => {
        applyTheme(b.dataset.themeId as ThemeId);
        reflect();
        setOpen(false);
      });
    }

    // Switching language persists the choice and reloads, so the page re-resolves its
    // translation overlay + chrome strings (applyLocale handles the reload).
    for (const b of langEls) {
      b.addEventListener("click", () => {
        applyLocale(b.dataset.localeId as LocaleId);
      });
    }

    // --- Save / restore progress -------------------------------------------------------
    const saveBtn = root.querySelector(".save") as HTMLButtonElement;
    const restoreBtn = root.querySelector(".restore") as HTMLButtonElement;
    const fileInput = root.querySelector(".file-input") as HTMLInputElement;
    const status = root.querySelector(".status") as HTMLElement;
    const backdrop = root.querySelector(".backdrop") as HTMLElement;
    const dialog = root.querySelector(".dialog") as HTMLElement;
    /** Releases the restore dialog's focus trap while it's open. */
    let releaseDialogTrap: (() => void) | null = null;

    const showStatus = (msg: string, isError = false) => {
      status.textContent = msg;
      status.classList.toggle("error", isError);
      status.hidden = false;
    };

    saveBtn.addEventListener("click", () => {
      void exportProgress();
      setOpen(false);
    });

    restoreBtn.addEventListener("click", () => fileInput.click());

    const viewChoice = root.querySelector(".view-choice") as HTMLElement;
    const viewConfirm = root.querySelector(".view-confirm") as HTMLElement;

    /** Entries awaiting a merge/overwrite choice in the dialog. */
    let pending: ProgressEntry[] | null = null;

    // Open the dialog on the first (merge/overwrite) view; overwrite then asks to confirm.
    const openDialog = () => {
      viewConfirm.hidden = true;
      viewChoice.hidden = false;
      backdrop.classList.add("open");
      releaseDialogTrap = trapFocus(dialog, {
        initial: root.querySelector(".merge") as HTMLElement | null,
      });
    };
    const closeDialog = () => {
      backdrop.classList.remove("open");
      pending = null;
      releaseDialogTrap?.();
      releaseDialogTrap = null;
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
        showStatus(t("progress.importError", { error: String((err as any)?.message ?? err) }), true);
      }
    });

    const finishRestore = (mode: "merge" | "overwrite") => {
      backdrop.classList.remove("open");
      releaseDialogTrap?.();
      releaseDialogTrap = null;
      if (!pending) return;
      applyProgress(pending, mode);
      pending = null;
      location.reload();
    };
    (root.querySelector(".merge") as HTMLButtonElement).addEventListener("click", () => finishRestore("merge"));
    // Overwrite erases everything, so step to a confirmation view rather than acting at once.
    (root.querySelector(".overwrite") as HTMLButtonElement).addEventListener("click", () => {
      viewChoice.hidden = true;
      viewConfirm.hidden = false;
      // Focus follows the revealed view (the button that was focused is now hidden).
      (root.querySelector(".confirm-overwrite") as HTMLButtonElement).focus();
    });
    (root.querySelector(".confirm-overwrite") as HTMLButtonElement).addEventListener(
      "click",
      () => finishRestore("overwrite"),
    );
    // Both views carry a Cancel button; either dismisses the whole dialog.
    for (const c of [...root.querySelectorAll(".cancel")] as HTMLButtonElement[]) {
      c.addEventListener("click", closeDialog);
    }

    // --- Clear local progress (Local section) ------------------------------------------
    (root.querySelector(".clear-local") as HTMLButtonElement).addEventListener("click", async () => {
      const msg = getUser() ? t("progress.clearConfirmSignedIn") : t("progress.clearConfirm");
      if (!(await confirmDialog({ message: msg, confirm: t("progress.clear"), cancel: t("progress.cancel") }))) return;
      clearLocalProgress();
      location.reload();
    });

    // --- Cloud sign-in (Cloud section) -------------------------------------------------
    initAccount(); // start (throttled) syncing if a session is already active on this device
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    const cloudOut = q(".cloud-out"), cloudIn = q(".cloud-in");
    const emailForm = q(".email-form"), codeForm = q(".code-form");
    const emailInput = q(".email-input") as HTMLInputElement;
    const codeInput = q(".code-input") as HTMLInputElement;
    const cloudStatus = q(".cloud-status");
    const loggedInAs = q(".logged-in-as");

    // A status line, shown centred + red (CSS) for a few seconds then cleared. Empty clears at once.
    const STATUS_CLEAR_MS = 3000;
    let statusTimer = 0;
    const cloudMsg = (msg: string) => {
      cloudStatus.textContent = msg;
      cloudStatus.hidden = !msg;
      clearTimeout(statusTimer);
      if (msg) statusTimer = window.setTimeout(() => { cloudStatus.textContent = ""; cloudStatus.hidden = true; }, STATUS_CLEAR_MS);
    };
    const renderCloud = () => {
      const user = getUser();
      cloudIn.hidden = !user;
      cloudOut.hidden = !!user;
      if (user) loggedInAs.textContent = t("account.loggedInAs", { email: user.email });
      else { emailForm.hidden = true; codeForm.hidden = true; }
      cloudMsg("");
    };
    renderCloud();

    q(".login").addEventListener("click", () => { emailForm.hidden = false; emailInput.focus(); });
    // Enter in the email field sends a code; submitting it again just re-sends (the built-in "resend").
    emailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = await requestCode(emailInput.value);
      if (!r.ok) { cloudMsg(t(r.error === "email" ? "account.badEmail" : "account.error")); return; }
      codeForm.hidden = false;
      cloudMsg(t("account.codeSent"));
      codeInput.focus();
    });
    // Enter in the code field verifies it.
    codeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = await submitCode(codeInput.value);
      if (!r.ok) { cloudMsg(t("account.badCode")); return; }
      codeInput.value = "";
      renderCloud();
    });
    q(".sync-now").addEventListener("click", async () => {
      cloudMsg(t("account.syncing"));
      await syncNow();
      cloudMsg(t("account.synced"));
    });
    q(".logout").addEventListener("click", () => void signOutAccount());
    q(".logout-all").addEventListener("click", async () => {
      if (await confirmDialog({ message: t("account.logoutAllConfirm"), confirm: t("account.logoutAll"), cancel: t("progress.cancel") })) await logoutAllDevices();
    });
    q(".forget-me").addEventListener("click", async () => {
      if (await confirmDialog({ message: t("account.forgetConfirm"), confirm: t("account.forgetMe"), cancel: t("progress.cancel") })) await deleteCloudData();
    });

    this.#onAuthChange = () => renderCloud();
    document.addEventListener("auth-change", this.#onAuthChange);

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
      else if (panel.classList.contains("open")) {
        setOpen(false);
        toggle.focus(); // keyboard dismissal returns focus to the trigger
      }
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
    if (this.#onAuthChange) document.removeEventListener("auth-change", this.#onAuthChange);
    this.#onThemeChange = this.#onKeydown = this.#onDocClick = this.#onCourseChange = this.#onAuthChange = null;
  }
}

if (!customElements.get("primer-menu")) {
  customElements.define("primer-menu", PrimerMenu);
}
