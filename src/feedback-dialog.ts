/**
 * The page-feedback dialog — opened from the menu's "Feedback" item. A small themed modal with a
 * textarea; Submit POSTs `{ page, url, message }` to the sync Worker's `/api/feedback` endpoint
 * (anonymous — the Worker tags the anonymous uid itself when a session cookie is present). Below
 * the actions sits a link to the GitHub discussions board, the previous behaviour of the menu item,
 * kept as the "talk about it" path.
 * @module
 */

import { trapFocus } from "./focus-trap.ts";
import { t } from "./i18n.ts";
import { CLOUD_API } from "./cloud-config.ts";

const DISCUSSIONS_URL = "https://github.com/jimmejardine/interactiveprimer/discussions";
const MSG_MIN = 4;
const MSG_MAX = 2000;
const CLOSE_AFTER_THANKS_MS = 1400;

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.id = "feedback-dialog-style";
  style.textContent = `
    .feedback-backdrop {
      position: fixed; inset: 0; z-index: 1200;
      background: rgba(0,0,0,0.35);
      display: grid; place-items: center;
    }
    .feedback-dialog {
      background: var(--primer-surface, #fff);
      border: 1px solid var(--primer-border, #ddd);
      border-radius: var(--primer-radius, 0.6rem);
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      padding: 1.25rem; width: min(28rem, calc(100vw - 2rem)); margin: 1rem;
      color: var(--primer-ink, #111);
      font-family: var(--primer-font-ui, system-ui, sans-serif);
    }
    .feedback-dialog h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
    .feedback-dialog textarea {
      font: inherit; font-size: 0.95rem; width: 100%; box-sizing: border-box;
      min-height: 7rem; resize: vertical; padding: 0.5rem 0.6rem;
      border: 1px solid var(--primer-border, #ccc); border-radius: var(--primer-radius, 0.5rem);
      background: var(--primer-bg, #fff); color: var(--primer-ink, #111);
    }
    .feedback-dialog .status { min-height: 1.2rem; margin: 0.4rem 0 0.4rem; font-size: 0.85rem; }
    .feedback-dialog .status.error { color: var(--primer-danger, #b3261e); }
    .feedback-dialog .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
    .feedback-dialog button {
      font: inherit; font-size: 0.9rem; cursor: pointer;
      padding: 0.45rem 0.9rem; border-radius: var(--primer-radius, 0.5rem);
      border: 1px solid var(--primer-border, #ccc);
      background: var(--primer-surface, #fff); color: var(--primer-ink, #111);
    }
    .feedback-dialog button.primary {
      background: var(--primer-accent, #4d5bd1); color: #fff; border-color: transparent;
    }
    .feedback-dialog button:disabled { opacity: 0.5; cursor: default; }
    .feedback-dialog .discuss { margin: 0.9rem 0 0; font-size: 0.85rem; text-align: right; }
    .feedback-dialog .discuss a { color: var(--primer-accent, #4d5bd1); }
    .feedback-dialog .thanks { margin: 0.5rem 0; font-size: 0.95rem; }
  `;
  document.head.appendChild(style);
}

/** The id this feedback is about: concept id on concept pages, the pathname otherwise. */
function currentPageId(): string {
  const path = location.pathname;
  const m = /^\/concepts\/(.+)\.html$/.exec(path);
  const raw = m ? m[1] : path === "/" ? "index" : path.replace(/^\//, "");
  // The Worker rejects anything outside [a-z0-9._/-]; normalise rather than fail.
  return raw.toLowerCase().replace(/[^a-z0-9._/-]/g, "-").slice(0, 200) || "index";
}

/** Open the feedback dialog. Resolves when the dialog has closed (however it closed). */
export function openFeedbackDialog(): Promise<void> {
  injectStyles();
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "feedback-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", t("feedback.title"));

    const dialog = document.createElement("div");
    dialog.className = "feedback-dialog";

    const title = document.createElement("h2");
    title.textContent = t("feedback.title");

    const textarea = document.createElement("textarea");
    textarea.placeholder = t("feedback.placeholder");
    textarea.maxLength = MSG_MAX;

    const status = document.createElement("p");
    status.className = "status";
    status.setAttribute("role", "status");

    const actions = document.createElement("div");
    actions.className = "actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = t("feedback.cancel");
    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = "primary";
    submitBtn.textContent = t("feedback.submit");
    submitBtn.disabled = true;
    actions.append(cancelBtn, submitBtn);

    const discuss = document.createElement("p");
    discuss.className = "discuss";
    const discussLink = document.createElement("a");
    discussLink.href = DISCUSSIONS_URL;
    discussLink.target = "_blank";
    discussLink.rel = "noopener";
    discussLink.textContent = `${t("feedback.discussLink")} ↗`;
    discuss.appendChild(discussLink);

    dialog.append(title, textarea, status, actions, discuss);
    backdrop.appendChild(dialog);

    let releaseTrap: (() => void) | null = null;
    let sending = false;
    const close = () => {
      document.removeEventListener("keydown", onKey);
      releaseTrap?.();
      backdrop.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) close();
    };

    textarea.addEventListener("input", () => {
      submitBtn.disabled = sending || textarea.value.trim().length < MSG_MIN;
    });

    const submit = async () => {
      const message = textarea.value.trim();
      if (sending || message.length < MSG_MIN) return;
      sending = true;
      submitBtn.disabled = true;
      cancelBtn.disabled = true;
      status.className = "status";
      status.textContent = "";
      try {
        const res = await fetch(`${CLOUD_API}/feedback`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: currentPageId(), url: location.href, message }),
        });
        if (!res.ok) throw new Error(String(res.status));
        // Success: swap the form for a brief thanks, then close.
        const thanks = document.createElement("p");
        thanks.className = "thanks";
        thanks.textContent = t("feedback.sent");
        textarea.remove();
        status.remove();
        actions.remove();
        dialog.insertBefore(thanks, discuss);
        setTimeout(close, CLOSE_AFTER_THANKS_MS);
      } catch {
        // Keep the text so the learner can retry (or copy it to the discussion board).
        sending = false;
        submitBtn.disabled = textarea.value.trim().length < MSG_MIN;
        cancelBtn.disabled = false;
        status.className = "status error";
        status.textContent = t("feedback.error");
      }
    };

    cancelBtn.addEventListener("click", close);
    submitBtn.addEventListener("click", () => void submit());
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop && !sending) close();
    });
    document.addEventListener("keydown", onKey);

    document.body.appendChild(backdrop);
    releaseTrap = trapFocus(dialog, { initial: textarea });
  });
}
