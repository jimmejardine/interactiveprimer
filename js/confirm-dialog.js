// @ts-check
/**
 * A small promise-based confirm modal — the app's custom equivalent of `window.confirm`, styled
 * with the theme tokens (like the menu's restore dialog). Used for the "change course?" prompt and
 * the progress-import course clash. Resolves `true` on confirm, `false` on cancel / Esc / backdrop.
 * @module
 */

import { trapFocus } from "./focus-trap.js";

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.id = "confirm-dialog-style";
  style.textContent = `
    .confirm-backdrop {
      position: fixed; inset: 0; z-index: 1200;
      background: rgba(0,0,0,0.35);
      display: grid; place-items: center;
    }
    .confirm-dialog {
      background: var(--primer-surface, #fff);
      border: 1px solid var(--primer-border, #ddd);
      border-radius: var(--primer-radius, 0.6rem);
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      padding: 1.25rem; max-width: 24rem; margin: 1rem;
      color: var(--primer-ink, #111);
      font-family: var(--primer-font-ui, system-ui, sans-serif);
    }
    .confirm-dialog p { margin: 0 0 1rem; font-size: 0.95rem; }
    .confirm-dialog .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
    .confirm-dialog button {
      font: inherit; font-size: 0.9rem; cursor: pointer;
      padding: 0.45rem 0.9rem; border-radius: var(--primer-radius, 0.5rem);
      border: 1px solid var(--primer-border, #ccc);
      background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
    }
    .confirm-dialog button.primary {
      background: var(--primer-accent, #4d5bd1); color: #fff; border-color: transparent;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Show a confirm modal and resolve to the user's choice.
 * @param {{ message: string, confirm?: string, cancel?: string }} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ message, confirm = "OK", cancel = "Cancel" }) {
  injectStyles();
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "confirm-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");

    const dialog = document.createElement("div");
    dialog.className = "confirm-dialog";
    const p = document.createElement("p");
    p.textContent = message;
    const actions = document.createElement("div");
    actions.className = "actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = cancel;
    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "primary";
    okBtn.textContent = confirm;
    actions.append(cancelBtn, okBtn);
    dialog.append(p, actions);
    backdrop.appendChild(dialog);

    /** @type {(() => void) | null} */
    let releaseTrap = null;
    /** @param {boolean} result */
    const close = (result) => {
      document.removeEventListener("keydown", onKey);
      releaseTrap?.();
      backdrop.remove();
      resolve(result);
    };
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
    };
    cancelBtn.addEventListener("click", () => close(false));
    okBtn.addEventListener("click", () => close(true));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(false);
    });
    document.addEventListener("keydown", onKey);

    document.body.appendChild(backdrop);
    // Trap focus in the dialog (starting on OK) and restore it to the trigger on close.
    releaseTrap = trapFocus(dialog, { initial: okBtn });
  });
}
