// @ts-check
/**
 * Feature flag + constants for the OPTIONAL cloud-sync backend (a Cloudflare Worker at `CLOUD_API`).
 * While `CLOUD_ENABLED` is false the whole feature is inert — the Cloud section of the Progress menu
 * is hidden and no `/api` request is ever made — so the site behaves exactly as it does today. Flip
 * it to `true` once the Worker is deployed (see worker/README.md).
 * @module
 */

/** Master switch. Keep false until the sync Worker + Cloudflare KV + Resend are set up. */
export const CLOUD_ENABLED = true;

/** Base path of the sync Worker. "/api" is same-origin in production; a local dev URL works too. */
export const CLOUD_API = "/api";

/** localStorage flag: "1" while a cloud session is active on this device (the httpOnly cookie is the
 *  real credential; this is just a UI/sync hint JS can read). Owned by js/account.js. */
export const CLOUD_FLAG = "primer:cloud";

/** localStorage key holding the user's OWN email, for the "Logged in as …" display only. Never sent
 *  anywhere except the sign-in requests; the server never stores it. */
export const CLOUD_EMAIL = "primer:cloud:email";
