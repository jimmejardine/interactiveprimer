// Interactive Primer — cloud sync Worker (Cloudflare, ESM module Worker).
//
// Optional, privacy-light sync of a learner's star ratings across devices. Auth is passwordless:
// the learner enters their email, receives a 6-character one-time code, and gets a signed session
// cookie back. Progress is stored per user in Workers KV and reconciled on write with the SAME
// merge the browser uses (imported from the site's js/progress-core.js — one source of truth for
// how two snapshots reconcile). There is NO build step for the site; this Worker is a separate
// deploy (wrangler bundles this relative import).

import { mergeProgress, MAX_STARS } from "../../js/progress-core.js";

// ---------------------------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------------------------

const OTP_TTL = 600; // one-time code lifetime, seconds (10 min)
const OTP_MAX_ATTEMPTS = 5; // wrong tries before the code is burned
const RL_TTL = 600; // rate-limit window, seconds (10 min)
const RL_MAX = 5; // max code requests per window
const SESSION_MS = 90 * 24 * 3600 * 1000; // session lifetime, 90 days
const SESSION_MAX_AGE = 90 * 24 * 3600; // same, in seconds, for the cookie
const COOKIE_NAME = "psess";
// Unambiguous code alphabet: A–Z minus I and O (24 letters) — no look-alikes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LEN = 6;

// ---------------------------------------------------------------------------------------------
// Worker entry
// ---------------------------------------------------------------------------------------------

export default {
  /**
   * @param {Request} request
   * @param {{ PROGRESS: KVNamespace, AUTH_SECRET: string, RESEND_API_KEY: string, EMAIL_FROM?: string, SITE_ORIGIN?: string }} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);

    // CORS preflight — answer every OPTIONS with the shared headers.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/"; // strip trailing slash

    try {
      const res = await route(path, request, env, ctx);
      return withCors(res, cors);
    } catch (err) {
      // Never leak a stack trace to the client.
      console.error("worker error:", err && err.stack ? err.stack : err);
      return withCors(json({ ok: false, error: "server_error" }, 500), cors);
    }
  },
};

/**
 * Dispatch by method + path. Each handler returns a Response.
 * @param {string} path
 * @param {Request} request
 * @param {any} env
 * @param {ExecutionContext} ctx
 */
async function route(path, request, env, ctx) {
  const m = request.method;
  if (path === "/api/auth/request" && m === "POST") return authRequest(request, env, ctx);
  if (path === "/api/auth/verify" && m === "POST") return authVerify(request, env);
  if (path === "/api/auth/logout" && m === "POST") return authLogout();
  if (path === "/api/auth/logout-all" && m === "POST") return authLogoutAll(request, env);
  if (path === "/api/progress" && m === "GET") return progressGet(request, env);
  if (path === "/api/progress" && m === "PUT") return progressPut(request, env);
  if (path === "/api/progress" && m === "DELETE") return progressDelete(request, env);
  return json({ ok: false, error: "not_found" }, 404);
}

// ---------------------------------------------------------------------------------------------
// Endpoint handlers
// ---------------------------------------------------------------------------------------------

/** POST /api/auth/request { email } — issue a one-time code by email. Always answers generically. */
async function authRequest(request, env, ctx) {
  const body = await readJson(request);
  const email = normalizeEmail(body && body.email);
  if (!email) return json({ ok: false, error: "bad_request" }, 400);

  const uid = await deriveUid(email, env.AUTH_SECRET);

  // Rate limit BY uid (a deterministic function of the email) AND by IP, whichever trips first.
  const ip = request.headers.get("CF-Connecting-IP") || "noip";
  if ((await bump(env, `rl:${uid}`)) > RL_MAX || (await bump(env, `rl:${ip}`)) > RL_MAX) {
    // Still generic — do not confirm the address exists; just refuse politely.
    return json({ ok: true }, 200);
  }

  const code = genCode();
  const codeHash = await sha256Hex(code + uid);
  await env.PROGRESS.put(`otp:${uid}`, JSON.stringify({ codeHash, attempts: 0 }), {
    expirationTtl: OTP_TTL,
  });

  // Send in the background so the response isn't blocked on Resend; failures are logged, not leaked.
  ctx.waitUntil(sendCode(env, email, code).catch((e) => console.error("sendCode failed:", e)));

  // Generic success: never reveal whether the email is known.
  return json({ ok: true }, 200);
}

/** POST /api/auth/verify { email, code } — check the code, mint a session. */
async function authVerify(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body && body.email);
  const code = String((body && body.code) || "")
    .trim()
    .toUpperCase();
  if (!email || !code) return json({ ok: false, error: "bad_request" }, 400);

  const uid = await deriveUid(email, env.AUTH_SECRET);
  const otpRaw = await env.PROGRESS.get(`otp:${uid}`);
  if (!otpRaw) return json({ ok: false, error: "invalid_code" }, 401);

  const otp = safeParse(otpRaw) || { codeHash: "", attempts: 0 };
  const candidate = await sha256Hex(code + uid);

  if (!timingSafeEqual(candidate, otp.codeHash || "")) {
    const attempts = (otp.attempts || 0) + 1;
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await env.PROGRESS.delete(`otp:${uid}`); // burn after too many tries
    } else {
      // Preserve the remaining TTL as best we can (KV can't read it back) — re-store with full TTL.
      await env.PROGRESS.put(`otp:${uid}`, JSON.stringify({ ...otp, attempts }), {
        expirationTtl: OTP_TTL,
      });
    }
    return json({ ok: false, error: "invalid_code" }, 401);
  }

  // Correct code. Load or create the user doc.
  const now = Date.now();
  let doc = safeParse(await env.PROGRESS.get(uid));
  if (!doc) {
    doc = { salt: randomHex(32), saltIssued: now, version: 1, course: "", updatedAt: now, scores: {} };
    await env.PROGRESS.put(uid, JSON.stringify(doc));
  } else if (!doc.salt) {
    // Existing doc without a salt (pre-salt data): mint one now.
    doc.salt = randomHex(32);
    doc.saltIssued = now;
    await env.PROGRESS.put(uid, JSON.stringify(doc));
  }
  // Otherwise ADOPT the existing salt so this device joins other logged-in devices.

  await env.PROGRESS.delete(`otp:${uid}`); // one-time: consume it

  const cookie = await buildSession(env, { uid, salt: doc.salt });
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}

/** POST /api/auth/logout — drop this device's session cookie. */
function authLogout() {
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
}

/** POST /api/auth/logout-all — rotate the salt so EVERY existing session is invalidated. */
async function authLogoutAll(request, env) {
  const sess = await authUid(request, env);
  if (!sess) return json({ ok: false, error: "unauthorized" }, 401);
  const doc = safeParse(await env.PROGRESS.get(sess.uid));
  if (!doc) return json({ ok: false, error: "unauthorized" }, 401);
  if (!timingSafeEqual(sess.salt, doc.salt || "")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  doc.salt = randomHex(32);
  doc.saltIssued = Date.now();
  await env.PROGRESS.put(sess.uid, JSON.stringify(doc));
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
}

/** GET /api/progress — return this user's entries + course. */
async function progressGet(request, env) {
  const doc = await requireDoc(request, env);
  if (!doc) return json({ ok: false, error: "unauthorized" }, 401);
  return json({ ok: true, entries: fromScores(doc.scores), course: doc.course || "" }, 200);
}

/** PUT /api/progress { entries, course } — merge the incoming snapshot into the stored one. */
async function progressPut(request, env) {
  const ctxDoc = await requireDoc(request, env, true);
  if (!ctxDoc) return json({ ok: false, error: "unauthorized" }, 401);
  const { uid, doc } = ctxDoc;

  const body = await readJson(request);
  const incoming = sanitizeEntries(body && body.entries);
  const merged = mergeProgress(fromScores(doc.scores), incoming, "merge");

  const incomingCourse = typeof (body && body.course) === "string" ? body.course.trim() : "";
  const course = incomingCourse || doc.course || "";

  const next = { ...doc, scores: toScores(merged), course, updatedAt: Date.now() };
  await env.PROGRESS.put(uid, JSON.stringify(next));
  return json({ ok: true, entries: merged, course }, 200);
}

/** DELETE /api/progress — full erasure ("Forget me"). Removes the doc and drops the cookie. */
async function progressDelete(request, env) {
  const sess = await authUid(request, env);
  if (!sess) return json({ ok: false, error: "unauthorized" }, 401);
  // No salt re-check needed: we're deleting everything either way, but confirm the doc still matches
  // so a stale cookie can't wipe a re-created account.
  const doc = safeParse(await env.PROGRESS.get(sess.uid));
  if (doc && !timingSafeEqual(sess.salt, doc.salt || "")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  await env.PROGRESS.delete(sess.uid);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
}

// ---------------------------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------------------------

/**
 * Verify the session cookie: valid signature + not expired. Returns { uid, salt } or null.
 * Does NOT touch KV — the endpoint then loads the doc and checks the salt matches (so a rotated
 * salt invalidates the session).
 * @param {Request} request
 * @param {any} env
 * @returns {Promise<{ uid: string, salt: string } | null>}
 */
async function authUid(request, env) {
  const raw = getCookie(request, COOKIE_NAME);
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot < 0) return null;
  const payloadB64 = raw.slice(0, dot);
  const sigB64 = raw.slice(dot + 1);

  let payloadJson;
  try {
    payloadJson = utf8Decode(b64urlDecode(payloadB64));
  } catch {
    return null;
  }
  const expectedSig = b64urlEncode(await hmacSha256(payloadJson, env.AUTH_SECRET));
  if (!timingSafeEqual(sigB64, expectedSig)) return null; // constant-time signature check

  const payload = safeParse(payloadJson);
  if (!payload || typeof payload.uid !== "string" || typeof payload.salt !== "string") return null;
  if (!payload.exp || payload.exp <= Date.now()) return null;
  return { uid: payload.uid, salt: payload.salt };
}

/**
 * Authenticate AND load the user's doc, enforcing cookie.salt === doc.salt.
 * @param {Request} request
 * @param {any} env
 * @param {boolean} [withUid] when true, resolves to { uid, doc } instead of just doc
 * @returns {Promise<any>} doc | { uid, doc } | null
 */
async function requireDoc(request, env, withUid = false) {
  const sess = await authUid(request, env);
  if (!sess) return null;
  const doc = safeParse(await env.PROGRESS.get(sess.uid));
  if (!doc) return null;
  if (!timingSafeEqual(sess.salt, doc.salt || "")) return null; // salt rotated → session dead
  return withUid ? { uid: sess.uid, doc } : doc;
}

/**
 * Build the signed session cookie string. value = b64url(payload) . b64url(HMAC(payload)).
 * @param {any} env
 * @param {{ uid: string, salt: string }} data
 */
async function buildSession(env, data) {
  const payload = JSON.stringify({ uid: data.uid, salt: data.salt, exp: Date.now() + SESSION_MS });
  const value = b64urlEncode(utf8Encode(payload)) + "." + b64urlEncode(await hmacSha256(payload, env.AUTH_SECRET));
  return `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

/** Expire the session cookie. */
function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// ---------------------------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------------------------

/**
 * Increment a short-lived counter in KV and return the new value. Best-effort (KV is eventually
 * consistent) — good enough to blunt abuse of the code-request endpoint.
 * @param {any} env
 * @param {string} key
 * @returns {Promise<number>}
 */
async function bump(env, key) {
  const cur = Number((await env.PROGRESS.get(key)) || 0);
  const next = cur + 1;
  await env.PROGRESS.put(key, String(next), { expirationTtl: RL_TTL });
  return next;
}

// ---------------------------------------------------------------------------------------------
// Email (Resend)
// ---------------------------------------------------------------------------------------------

/**
 * Email the 6-char sign-in code via Resend as a simple inline-HTML message.
 * @param {any} env
 * @param {string} email  normalized recipient
 * @param {string} code   the 6-char code
 */
async function sendCode(env, email, code) {
  const from = env.EMAIL_FROM || "InteractivePrimer.com <login@interactiveprimer.com>";
  const html = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size:16px; color:#111;">
      <p>Your Interactive Primer sign-in code is:</p>
      <p style="font-size:28px; font-weight:700; letter-spacing:4px; margin:16px 0;">${code}</p>
      <p style="color:#555;">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
    </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${code} is your InteractivePrimer.com sign-in code`,
      html,
      text: `Your Interactive Primer sign-in code is: ${code}\n\nIt expires in 10 minutes.`,
    }),
  });
  if (!res.ok) throw new Error(`Resend send failed: ${res.status} ${await safeText(res)}`);
}

// ---------------------------------------------------------------------------------------------
// Scores <-> entries mapping
// ---------------------------------------------------------------------------------------------

/**
 * Stored form → entry array. scores: { id: [stars, first, last] }.
 * @param {Record<string, [number, string, string]>} scores
 * @returns {import("../../js/progress-core.js").ProgressEntry[]}
 */
function fromScores(scores) {
  if (!scores || typeof scores !== "object") return [];
  const out = [];
  for (const [id, v] of Object.entries(scores)) {
    if (!Array.isArray(v)) continue;
    out.push({ id, stars: Number(v[0]) || 0, first: v[1] || "", last: v[2] || "" });
  }
  return out;
}

/**
 * Entry array → stored form.
 * @param {import("../../js/progress-core.js").ProgressEntry[]} entries
 * @returns {Record<string, [number, string, string]>}
 */
function toScores(entries) {
  const out = {};
  for (const e of entries) out[e.id] = [e.stars, e.first || "", e.last || ""];
  return out;
}

/**
 * Sanitize an incoming entries array: keep only well-formed { id, stars, first, last }, clamp
 * stars to 0..MAX_STARS, drop the rest. Never throws.
 * @param {any} arr
 * @returns {import("../../js/progress-core.js").ProgressEntry[]}
 */
function sanitizeEntries(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const e of arr) {
    if (!e || typeof e.id !== "string" || !e.id) continue;
    const stars = Number(e.stars);
    if (!Number.isFinite(stars) || stars < 0 || stars > MAX_STARS) continue;
    out.push({
      id: e.id,
      stars: Math.round(stars),
      first: typeof e.first === "string" ? e.first : "",
      last: typeof e.last === "string" ? e.last : "",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Crypto + encoding helpers (Web Crypto — available in Workers)
// ---------------------------------------------------------------------------------------------

/** uid = HMAC-SHA256(normalizedEmail, AUTH_SECRET), hex. Stable while AUTH_SECRET is fixed. */
async function deriveUid(normalizedEmail, secret) {
  return toHex(await hmacSha256(normalizedEmail, secret));
}

/**
 * HMAC-SHA256 of `msg` with `key`, returned as a Uint8Array.
 * @param {string} msg
 * @param {string} key
 * @returns {Promise<Uint8Array>}
 */
async function hmacSha256(msg, key) {
  const ck = await crypto.subtle.importKey(
    "raw",
    utf8Encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", ck, utf8Encode(msg));
  return new Uint8Array(sig);
}

/** SHA-256 of a string, hex. */
async function sha256Hex(msg) {
  const buf = await crypto.subtle.digest("SHA-256", utf8Encode(msg));
  return toHex(new Uint8Array(buf));
}

/** Constant-time string compare. Compares over the full length, accumulating any difference. */
function timingSafeEqual(a, b) {
  a = String(a);
  b = String(b);
  // Fold length difference into the result but keep iterating a fixed number of chars.
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** n random bytes as a hex string (so randomHex(32) → 64 hex chars). */
function randomHex(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** A 6-char code from the unambiguous alphabet, using rejection-free modulo over random bytes. */
function genCode() {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** Uint8Array → lowercase hex. */
function toHex(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}

const _enc = new TextEncoder();
const _dec = new TextDecoder();
/** @param {string} s @returns {Uint8Array} */
function utf8Encode(s) {
  return _enc.encode(s);
}
/** @param {Uint8Array} b @returns {string} */
function utf8Decode(b) {
  return _dec.decode(b);
}

/** Bytes → base64url (no padding). */
function b64urlEncode(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url → bytes. */
function b64urlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------------------------

/** Normalize an email: trim + lowercase; returns "" if not a plausible address. */
function normalizeEmail(v) {
  if (typeof v !== "string") return "";
  const e = v.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
}

/** Parse a JSON request body, tolerating garbage (→ null). */
async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** JSON.parse that never throws. */
function safeParse(s) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Read a Response body as text without throwing. */
async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/** Build a JSON Response with optional extra headers. */
function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

/** Read one cookie value from the request. */
function getCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------------------------

/**
 * CORS headers. Prod is same-origin (site + Worker on interactiveprimer.com) so these are inert
 * there; for local dev the site is on another origin — reflect it when it matches SITE_ORIGIN.
 * @param {Request} request
 * @param {any} env
 * @returns {Record<string,string>}
 */
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
  // Reflect the origin only when it matches the configured dev origin (credentials + "*" is illegal).
  if (origin && env.SITE_ORIGIN && origin === env.SITE_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/** Merge CORS headers onto an existing Response. */
function withCors(res, cors) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
