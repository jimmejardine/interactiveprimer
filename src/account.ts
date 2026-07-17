/**
 * Optional cloud account state: a passwordless **6-character emailed passcode** sign-in against the
 * sync Worker (js/cloud-config.js `CLOUD_API`). Modelled on js/course.js / js/theme.js — it owns the
 * signed-in flag + the user's own email (for display only), and broadcasts an `auth-change` event so
 * the Progress menu re-renders. The real credential is the Worker's httpOnly session cookie, which JS
 * can't read; the localStorage flag is just a hint. Sync itself lives in js/cloud-sync.js.
 *
 * GDPR: the email is sent only on the sign-in requests and is never stored server-side (the server
 * keys everything by `uid = HMAC(email)`); this device keeps the email locally purely to show
 * "Logged in as …". "Forget me" deletes the cloud record entirely.
 * @module
 */

import { CLOUD_API, CLOUD_FLAG, CLOUD_EMAIL } from "./cloud-config.ts";
import { initSync, onSignIn, stopSync } from "./cloud-sync.ts";
import { safeGet, safeSet, safeRemove } from "./storage.ts";

async function api(path: string, opts?: RequestInit) {
  return fetch(`${CLOUD_API}${path}`, { credentials: "include", ...opts });
}

/** The signed-in user, or null. Only the email (shown as "Logged in as …") — no other identity. */
export function getUser() {
  if (safeGet(CLOUD_FLAG) !== "1") return null;
  return { email: safeGet(CLOUD_EMAIL) || "" };
}

function broadcast() {
  document.dispatchEvent(new CustomEvent("auth-change", { detail: { user: getUser() } }));
}

function clearSession() {
  safeRemove(CLOUD_FLAG);
  safeRemove(CLOUD_EMAIL);
  stopSync();
  broadcast();
}

/**
 * Step 1 of sign-in: email a fresh passcode. Stashes the email locally (for the verify step + the
 * "Logged in as" display).
 */
export async function requestCode(email: string): Promise<{ ok: boolean; error?: string }> {
  const addr = (email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return { ok: false, error: "email" };
  safeSet(CLOUD_EMAIL, addr);
  try {
    const res = await api("/auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr }),
    });
    return res.ok ? { ok: true } : { ok: false, error: "network" };
  } catch {
    return { ok: false, error: "network" };
  }
}

/**
 * Step 2 of sign-in: submit the typed code. On success sets the session flag and kicks off an
 * interactive sync (which may prompt to merge this device's local progress).
 */
export async function submitCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const email = safeGet(CLOUD_EMAIL) || "";
  try {
    const res = await api("/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code: (code || "").trim().toUpperCase() }),
    });
    if (!res.ok) return { ok: false, error: "code" };
    safeSet(CLOUD_FLAG, "1");
    broadcast();
    await onSignIn({ interactive: true });
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Log out THIS device only (the cloud record and other devices are untouched). */
export async function signOutAccount() {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    /* clear locally regardless */
  }
  clearSession();
}

/** Log out EVERY device: rotate the server-side salt so all existing sessions are invalidated. */
export async function logoutAllDevices() {
  try {
    await api("/auth/logout-all", { method: "POST" });
  } catch {
    /* clear locally regardless */
  }
  clearSession();
}

/** "Forget me" — delete the entire cloud record (GDPR erasure). Local progress is left intact. */
export async function deleteCloudData() {
  try {
    await api("/progress", { method: "DELETE" });
  } catch {
    /* clear locally regardless */
  }
  clearSession();
}

/** Wire up on page load: if a session is active, start (throttled) syncing. Idempotent. */
export function initAccount() {
  if ((window as any).__primerAccountInit) return;
  (window as any).__primerAccountInit = true;
  if (getUser()) initSync();
}
