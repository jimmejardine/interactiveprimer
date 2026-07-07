// @ts-check
/**
 * The client half of optional cloud sync. Keeps this browser's localStorage progress reconciled with
 * the per-user record held by the sync Worker (js/cloud-config.js `CLOUD_API`), reusing the existing
 * progress machinery (js/progress.js). Auth/session lives in js/account.js; this module only moves
 * PROGRESS in and out and paints the UI.
 *
 * Cost-shaped (see the design): **pull** (read) is throttled to ≤ once per 6 h per device on load
 * (forced on first sign-in and "Sync now"); **push** (write) is coalesced to ≤ once per 15 min and
 * only fires when something changed, sending the full local set (the Worker merges server-side, so a
 * push can't clobber another device's untouched concepts). A dirty flag persists in localStorage so a
 * change made just before a page navigation isn't lost — it flushes on `pagehide` or the next load.
 *
 * The throttle/diff logic is factored into pure, unit-tested helpers (js/cloud-sync — the `shouldPull`
 * / `shouldPush` / `changedEntries` / `reconcileCourse` exports); the network + localStorage IO is the
 * thin shell below.
 * @module
 */

import { CLOUD_API, CLOUD_FLAG } from "./cloud-config.js";
import { allEntries } from "./confidence-store.js";
import { applyProgress, hasExistingProgress } from "./progress.js";
import { getCurrentCourse, setCurrentCourse } from "./course.js";
import { confirmDialog } from "./confirm-dialog.js";
import { t } from "./i18n.js";
import {
  PULL_TTL_MS,
  WRITE_TTL_MS,
  shouldPull,
  shouldPush,
  changedEntries,
  reconcileCourse,
} from "./cloud-sync-core.js";

/** @typedef {import("./progress-core.js").ProgressEntry} ProgressEntry */

// The pure throttle/diff helpers live in js/cloud-sync-core.js (unit-tested); re-export for the API.
export {
  PULL_TTL_MS,
  WRITE_TTL_MS,
  shouldPull,
  shouldPush,
  changedEntries,
  reconcileCourse,
} from "./cloud-sync-core.js";

// ---- localStorage bookkeeping ----------------------------------------------------------

const LAST_PULL = "primer:cloud:pull";
const LAST_PUSH = "primer:cloud:push";
const DIRTY = "primer:cloud:dirty"; // JSON { ids: string[], course: boolean }

const readNum = (/** @type {string} */ k) => {
  try {
    return Number(localStorage.getItem(k)) || 0;
  } catch {
    return 0;
  }
};
const writeNum = (/** @type {string} */ k, /** @type {number} */ v) => {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    /* best-effort */
  }
};
/** @returns {{ ids: string[], course: boolean }} */
const readDirty = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(DIRTY) || "");
    return { ids: Array.isArray(raw?.ids) ? raw.ids : [], course: !!raw?.course };
  } catch {
    return { ids: [], course: false };
  }
};
const writeDirty = (/** @type {{ids:string[],course:boolean}} */ d) => {
  try {
    if (!d.ids.length && !d.course) localStorage.removeItem(DIRTY);
    else localStorage.setItem(DIRTY, JSON.stringify({ ids: [...new Set(d.ids)], course: d.course }));
  } catch {
    /* best-effort */
  }
};
const dirtyCount = (/** @type {{ids:string[],course:boolean}} */ d) => d.ids.length + (d.course ? 1 : 0);

const signedIn = () => {
  try {
    return localStorage.getItem(CLOUD_FLAG) === "1";
  } catch {
    return false;
  }
};

// ---- network -----------------------------------------------------------------------------

/** @param {string} path @param {RequestInit} [opts] */
async function api(path, opts) {
  return fetch(`${CLOUD_API}${path}`, { credentials: "include", ...opts });
}

/** Apply a set of cloud entries into localStorage and repaint every changed surface, without our own
 *  dirty-tracking mistaking it for a local edit. @param {ProgressEntry[]} entries @param {string} course @param {"merge"|"overwrite"} mode */
function applyFromCloud(entries, course, mode) {
  const before = allEntries();
  suppressDirty = true;
  try {
    applyProgress(entries, mode);
    const target = reconcileCourse(getCurrentCourse(), course);
    if (target !== getCurrentCourse()) setCurrentCourse(target); // fires course-change (repaints menu/graph)
  } finally {
    suppressDirty = false;
  }
  const after = allEntries();
  for (const c of changedEntries(before, after)) {
    document.dispatchEvent(
      new CustomEvent("confidence-change", { detail: { conceptId: c.id, value: c.stars } }),
    );
  }
}

let pulling = false;
/** Pull the cloud record and merge it into local (throttled unless `force`). @param {{force?:boolean}} [opts] */
export async function pullMerge({ force = false } = {}) {
  if (!signedIn() || pulling) return;
  if (!force && !shouldPull(readNum(LAST_PULL), Date.now(), PULL_TTL_MS)) return;
  pulling = true;
  try {
    const res = await api("/progress", { method: "GET" });
    if (!res.ok) return;
    const doc = await res.json();
    applyFromCloud(Array.isArray(doc?.entries) ? doc.entries : [], String(doc?.course || ""), "merge");
    writeNum(LAST_PULL, Date.now());
  } catch {
    /* offline / transient — try again next window */
  } finally {
    pulling = false;
  }
}

let pushing = false;
/** Push the full local set up; the Worker merges and returns the reconciled record, which we apply
 *  back (so a push doubles as a light pull). @param {{keepalive?:boolean}} [opts] */
export async function pushNow({ keepalive = false } = {}) {
  if (!signedIn() || pushing) return;
  pushing = true;
  try {
    const body = JSON.stringify({ entries: allEntries(), course: getCurrentCourse() });
    const res = await api("/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive,
    });
    if (!res.ok) return;
    writeDirty({ ids: [], course: false });
    writeNum(LAST_PUSH, Date.now());
    if (!keepalive) {
      const doc = await res.json();
      applyFromCloud(Array.isArray(doc?.entries) ? doc.entries : [], String(doc?.course || ""), "merge");
    }
  } catch {
    /* keep the dirty flag; retry next window / load */
  } finally {
    pushing = false;
  }
}

let pushTimer = 0;
/** Push now if the write window has elapsed, else arm a timer for the remainder. */
function schedulePush() {
  const d = readDirty();
  const now = Date.now();
  if (shouldPush(dirtyCount(d), readNum(LAST_PUSH), now, WRITE_TTL_MS)) {
    void pushNow();
    return;
  }
  if (pushTimer) clearTimeout(pushTimer);
  const wait = Math.max(0, WRITE_TTL_MS - (now - readNum(LAST_PUSH)));
  pushTimer = window.setTimeout(() => {
    pushTimer = 0;
    if (dirtyCount(readDirty()) > 0) void pushNow();
  }, wait);
}

let suppressDirty = false;
/** @param {string} id */
function markConceptDirty(id) {
  if (suppressDirty || !signedIn()) return;
  const d = readDirty();
  d.ids.push(id);
  writeDirty(d);
  schedulePush();
}
function markCourseDirty() {
  if (suppressDirty || !signedIn()) return;
  const d = readDirty();
  d.course = true;
  writeDirty(d);
  schedulePush();
}

// ---- lifecycle ---------------------------------------------------------------------------

let wired = false;
/** Wire the change/flush listeners once (idempotent). */
function wireListeners() {
  if (wired) return;
  wired = true;
  document.addEventListener("confidence-change", (e) => {
    const id = /** @type {any} */ (e).detail?.conceptId;
    if (typeof id === "string") markConceptDirty(id);
  });
  document.addEventListener("course-change", () => markCourseDirty());
  // Best-effort flush of a pending push when the page is hidden/unloaded (keepalive lets it outlive
  // the navigation); the dirty flag persists regardless, so the next load pushes if this didn't land.
  const flush = () => {
    if (signedIn() && dirtyCount(readDirty()) > 0) void pushNow({ keepalive: true });
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** Called once per load by js/account.js when a session is active: wire up, throttled-pull, and push
 *  anything still dirty from a previous page. */
export function initSync() {
  if (!signedIn()) return;
  wireListeners();
  void pullMerge();
  if (dirtyCount(readDirty()) > 0) schedulePush();
}

/** Force an immediate pull ("Sync now" button). */
export function syncNow() {
  return pullMerge({ force: true });
}

/**
 * Called by js/account.js right after a successful sign-in. On an INTERACTIVE sign-in with existing
 * local progress, ask the user whether to merge it into the account or use only the account's copy.
 * @param {{interactive?:boolean}} [opts]
 */
export async function onSignIn({ interactive = false } = {}) {
  if (!signedIn()) return;
  wireListeners();
  if (interactive && hasExistingProgress()) {
    let cloud = { entries: /** @type {ProgressEntry[]} */ ([]), course: "" };
    try {
      const res = await api("/progress", { method: "GET" });
      if (res.ok) {
        const doc = await res.json();
        cloud = { entries: Array.isArray(doc?.entries) ? doc.entries : [], course: String(doc?.course || "") };
      }
    } catch {
      /* offline — treat as empty cloud; the merge below is then a no-op download */
    }
    const merge = await confirmDialog({
      message: t("account.mergePrompt"),
      confirm: t("account.merge"),
      cancel: t("account.useCloudOnly"),
    });
    applyFromCloud(cloud.entries, cloud.course, merge ? "merge" : "overwrite");
    writeNum(LAST_PULL, Date.now());
    if (merge) await pushNow(); // send the union (this device's local-only entries) up
  } else {
    await pullMerge({ force: true });
  }
}

/** Called on log out / forget-me: drop any pending push + timers (local progress is left intact). */
export function stopSync() {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = 0;
  }
  writeDirty({ ids: [], course: false });
}
