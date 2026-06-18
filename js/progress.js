// @ts-check
/**
 * Save / restore learner progress. The Primer has no server, so a learner's confidence
 * scores live only in this browser's localStorage. This module turns that into a portable
 * file: **save** downloads a gzip-compressed JSON snapshot of every `{ id, stars, first, last }`
 * score, and **restore** reads one back — either **merging** it into the local scores
 * (per concept, the more-recently-updated score wins) or **overwriting** them wholesale.
 *
 * The merge/validate core is pure (DOM-free) so it's unit-tested directly; the save/restore
 * IO goes through js/confidence-store.js for all localStorage access.
 * @module
 */

import {
  allEntries,
  writeEntry,
  clearAll,
  todayISO,
  MAX_STARS,
} from "./confidence-store.js";

/** @typedef {{ id: string, stars: number, first: string, last: string }} ProgressEntry */

/** Marker + version stamped into an exported file, so restore can sanity-check it. */
export const FILE_TYPE = "primer-progress";
export const FILE_VERSION = 1;

// ---- pure core (DOM-free, unit-tested) -------------------------------------------------

/**
 * Combine two progress snapshots.
 * - `overwrite` → `incoming` replaces everything (the caller wipes local scores first).
 * - `merge` → union by id; for an id in both, the score (`stars`) comes from whichever side has
 *   the later `last` date (an empty date is oldest; on a tie, `incoming` wins as the deliberate
 *   import), while the dates span both: `first` = the earliest first-rated date and `last` =
 *   the latest updated date of the two.
 * @param {ProgressEntry[]} existing
 * @param {ProgressEntry[]} incoming
 * @param {"merge" | "overwrite"} mode
 * @returns {ProgressEntry[]}
 */
export function mergeProgress(existing, incoming, mode) {
  if (mode === "overwrite") return incoming.slice();
  /** @type {Map<string, ProgressEntry>} */
  const byId = new Map();
  for (const e of existing) byId.set(e.id, e);
  for (const inc of incoming) {
    const cur = byId.get(inc.id);
    if (!cur) {
      byId.set(inc.id, inc);
      continue;
    }
    const winner = inc.last >= cur.last ? inc : cur; // later `last` wins its stars; tie → incoming
    byId.set(inc.id, {
      id: inc.id,
      stars: winner.stars,
      first: minDate(cur.first, inc.first), // earliest first-rated date across both
      last: maxDate(cur.last, inc.last), // latest updated date across both
    });
  }
  return [...byId.values()];
}

/**
 * The earliest of two ISO dates, ignoring empty strings. Returns "" only if both are empty.
 * @param {string} a
 * @param {string} b
 */
function minDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

/**
 * The latest of two ISO dates, ignoring empty strings. Returns "" only if both are empty.
 * @param {string} a
 * @param {string} b
 */
function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * Validate a parsed import object and return its clean entries, or throw on a bad shape.
 * Tolerates missing dates (→ ""); rejects a wrong type/version or malformed entries.
 * @param {any} obj
 * @returns {ProgressEntry[]}
 */
export function validateImport(obj) {
  if (!obj || typeof obj !== "object" || obj.type !== FILE_TYPE) {
    throw new Error("Not a Primer progress file.");
  }
  if (!Array.isArray(obj.entries)) throw new Error("Progress file has no entries.");
  return obj.entries.map((/** @type {any} */ e, /** @type {number} */ i) => {
    if (!e || typeof e.id !== "string" || !e.id) {
      throw new Error(`Entry ${i} has no id.`);
    }
    const stars = Number(e.stars);
    if (!Number.isFinite(stars) || stars < 0 || stars > MAX_STARS) {
      throw new Error(`Entry "${e.id}" has an invalid score.`);
    }
    return {
      id: e.id,
      stars: Math.round(stars),
      first: typeof e.first === "string" ? e.first : "",
      last: typeof e.last === "string" ? e.last : "",
    };
  });
}

// ---- browser IO ------------------------------------------------------------------------

/** @returns {{ type: string, version: number, exported: string, entries: ProgressEntry[] }} */
export function collectProgress() {
  return {
    type: FILE_TYPE,
    version: FILE_VERSION,
    exported: todayISO(),
    entries: allEntries(),
  };
}

/** True if any confidence score exists locally (→ a restore must ask merge vs overwrite). */
export function hasExistingProgress() {
  return allEntries().length > 0;
}

/**
 * gzip a string to bytes via CompressionStream, falling back to the raw UTF-8 bytes when the
 * API is unavailable (older browsers). `readProgressFile` sniffs the gzip magic either way.
 * @param {string} text
 * @returns {Promise<Uint8Array>}
 */
async function gzip(text) {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decompress imported bytes: gzip (magic `1f 8b`) → DecompressionStream, else treat as UTF-8.
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
async function gunzip(bytes) {
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip || typeof DecompressionStream === "undefined") {
    return new TextDecoder().decode(bytes);
  }
  const stream = new Blob([/** @type {BlobPart} */ (bytes)])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** Snapshot local progress, gzip it, and trigger a download. */
export async function exportProgress() {
  const json = JSON.stringify(collectProgress());
  const blob = new Blob([/** @type {BlobPart} */ (await gzip(json))], { type: "application/gzip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `primer-progress-${todayISO()}.json.gz`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Read + validate a picked progress file into its entries (throws on a bad/corrupt file).
 * @param {File} file
 * @returns {Promise<ProgressEntry[]>}
 */
export async function readProgressFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = await gunzip(bytes);
  return validateImport(JSON.parse(text));
}

/**
 * Apply imported entries to localStorage. `overwrite` clears all local scores first; both
 * modes then merge per the rules in `mergeProgress` and write each resulting tuple verbatim
 * (preserving its first/last dates).
 * @param {ProgressEntry[]} entries
 * @param {"merge" | "overwrite"} mode
 */
export function applyProgress(entries, mode) {
  const merged = mergeProgress(allEntries(), entries, mode);
  if (mode === "overwrite") clearAll();
  for (const e of merged) writeEntry(e.id, e.stars, e.first, e.last);
}
