// @ts-check
/**
 * Constants for the cloud-sync backend (a Cloudflare Worker at `CLOUD_API`). The client talks to it
 * with plain `fetch` — no SDK.
 * @module
 */

/** Base path of the sync Worker. "/api" is same-origin in production. */
export const CLOUD_API = "/api";

/** localStorage flag: "1" while a cloud session is active on this device (the httpOnly cookie is the
 *  real credential; this is just a UI/sync hint JS can read). Owned by js/account.js. */
export const CLOUD_FLAG = "primer:cloud";

/** localStorage key holding the user's OWN email, for the "Logged in as …" display only. Never sent
 *  anywhere except the sign-in requests; the server never stores it. */
export const CLOUD_EMAIL = "primer:cloud:email";
