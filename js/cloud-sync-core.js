// @ts-check
/**
 * Pure, DOM-free helpers for cloud sync: the read/write throttle decisions, the post-pull diff, and
 * the course reconcile. Split out of js/cloud-sync.js so they unit-test in node:test without the
 * browser dependencies (localStorage/document/i18n) the rest of that module pulls in.
 * @module
 */

export const PULL_TTL_MS = 6 * 60 * 60 * 1000; // read ≤ once / 6 h per device
export const WRITE_TTL_MS = 15 * 60 * 1000; // write ≤ once / 15 min

/**
 * Should we hit the network for a pull? True when we've never pulled or the TTL has elapsed.
 * @param {number} lastPull epoch ms of the last successful pull (0 / NaN = never)
 * @param {number} now epoch ms
 * @param {number} ttl throttle window in ms
 */
export function shouldPull(lastPull, now, ttl) {
  return !Number.isFinite(lastPull) || lastPull <= 0 || now - lastPull >= ttl;
}

/**
 * Should we push now? Only when there is pending local change AND the write window has elapsed.
 * @param {number} dirtyCount number of pending changes (ids + course)
 * @param {number} lastPush epoch ms of the last successful push (0 = never)
 * @param {number} now epoch ms
 * @param {number} ttl throttle window in ms
 */
export function shouldPush(dirtyCount, lastPush, now, ttl) {
  return dirtyCount > 0 && (!lastPush || now - lastPush >= ttl);
}

/**
 * The ids whose star value differs between two snapshots (added, changed, or removed → 0). Used to
 * fire one `confidence-change` per changed id after a pull so the explorers/refs/star-row repaint.
 * @param {Array<{id:string,stars:number}>} before
 * @param {Array<{id:string,stars:number}>} after
 * @returns {Array<{id:string,stars:number}>}
 */
export function changedEntries(before, after) {
  const b = new Map(before.map((e) => [e.id, e.stars]));
  const a = new Map(after.map((e) => [e.id, e.stars]));
  /** @type {Array<{id:string,stars:number}>} */
  const out = [];
  for (const [id, stars] of a) if (b.get(id) !== stars) out.push({ id, stars });
  for (const [id] of b) if (!a.has(id)) out.push({ id, stars: 0 }); // removed → unrated
  return out;
}

/**
 * Reconcile the single "current course" value on a pull: the shared cloud value wins when set, else
 * keep local. (A local course change also pushes up, so devices converge.)
 * @param {string} local
 * @param {string} cloud
 */
export function reconcileCourse(local, cloud) {
  return cloud || local;
}
