// @ts-check
/**
 * YouTube URL parsing — pure helpers with no DOM dependency, so they're unit-testable in
 * Node and reusable. Used by js/components/primer-video.js.
 * @module
 */

/**
 * Extract the 11-character YouTube video id from a URL or a bare id, or null if none.
 * Handles watch?v=, youtu.be/, /embed/, /shorts/, /v/, /live/ (with or without scheme),
 * tolerating extra query params (&t=, ?si=…).
 * @param {string} src
 * @returns {string | null}
 */
export function youtubeId(src) {
  if (typeof src !== "string") return null;
  const s = src.trim();
  if (!s) return null;

  const ID = /^[A-Za-z0-9_-]{11}$/;
  if (ID.test(s)) return s; // a bare video id

  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return ID.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && ID.test(v)) return v;
    const m = url.pathname.match(/^\/(?:embed|shorts|v|live)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Optional start time (whole seconds) from a YouTube URL's `start`/`t` param, e.g. `t=90`
 * or `t=1m30s`. Returns 0 when absent/unparseable.
 * @param {string} src
 * @returns {number}
 */
export function startSeconds(src) {
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(src) ? src : `https://${src}`);
  } catch {
    return 0;
  }
  const raw = url.searchParams.get("start") ?? url.searchParams.get("t");
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)m)?(?:(\d+)s)?$/);
  if (m && (m[1] || m[2])) return Number(m[1] || 0) * 60 + Number(m[2] || 0);
  return 0;
}
