/**
 * Save / restore learner progress. The base Primer has no server, so a learner's confidence
 * scores live only in this browser's localStorage. This module turns that into a portable
 * file: **save** downloads a gzip-compressed JSON snapshot of every `{ id, stars, first, last }`
 * score, and **restore** reads one back — either **merging** it into the local scores
 * (per concept, the more-recently-updated score wins) or **overwriting** them wholesale.
 *
 * The merge/validate core is pure (DOM-free) and now lives in src/progress-core.ts — shared with the
 * optional cloud-sync Worker so both reconcile snapshots identically — and is re-exported here for
 * existing importers. The save/restore/clear IO goes through src/confidence-store.ts and src/course.ts.
 * @module
 */

import { allEntries, writeEntry, clearAll, todayISO } from "./confidence-store.ts";
import { getCurrentCourse, clearCourse } from "./course.ts";
import { mergeProgress, validateImport, FILE_TYPE, FILE_VERSION } from "./progress-core.ts";
import type { ProgressEntry } from "./progress-core.ts";

// Re-export the pure core so existing importers (tests, the menu, cloud-sync) keep getting these
// from src/progress.ts.
export { mergeProgress, validateImport, FILE_TYPE, FILE_VERSION };

export type { ProgressEntry } from "./progress-core.ts";

// ---- browser IO ------------------------------------------------------------------------

export function collectProgress(): { type: string; version: number; exported: string; course: string; entries: ProgressEntry[] } {
  return {
    type: FILE_TYPE,
    version: FILE_VERSION,
    exported: todayISO(),
    course: getCurrentCourse(), // the learner's current course id, "" if none
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
 */
async function gzip(text: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decompress imported bytes: gzip (magic `1f 8b`) → DecompressionStream, else treat as UTF-8.
 */
async function gunzip(bytes: Uint8Array): Promise<string> {
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip || typeof DecompressionStream === "undefined") {
    return new TextDecoder().decode(bytes);
  }
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** Snapshot local progress, gzip it, and trigger a download. */
export async function exportProgress() {
  const json = JSON.stringify(collectProgress());
  const blob = new Blob([(await gzip(json)) as BlobPart], { type: "application/gzip" });
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
 * Read + validate a picked progress file into its entries and current-course id (throws on a
 * bad/corrupt file). `course` is "" when the file predates courses or carried none.
 */
export async function readProgressFile(file: File): Promise<{ entries: ProgressEntry[]; course: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = await gunzip(bytes);
  const obj = JSON.parse(text);
  const entries = validateImport(obj);
  const course = typeof obj?.course === "string" ? obj.course : "";
  return { entries, course };
}

/**
 * Apply imported entries to localStorage. `overwrite` clears all local scores first; both
 * modes then merge per the rules in `mergeProgress` and write each resulting tuple verbatim
 * (preserving its first/last stamps).
 */
export function applyProgress(entries: ProgressEntry[], mode: "merge" | "overwrite") {
  const merged = mergeProgress(allEntries(), entries, mode);
  if (mode === "overwrite") clearAll();
  for (const e of merged) writeEntry(e.id, e.stars, e.first, e.last);
}

/**
 * Wipe this browser's learner progress: every confidence score and the current course. Local only —
 * a cloud copy (if signed in) is untouched (use "Forget me" to erase that). The caller repaints.
 */
export function clearLocalProgress() {
  clearAll();
  clearCourse();
}
