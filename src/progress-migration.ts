/**
 * Startup progress migration: recover confidence scores stranded by a moved concept.
 *
 * A score lives in localStorage under `primer:confidence:<id>`, where `<id>` is the concept's path
 * under `concepts/`. Move a concept in the tree and its id changes, so the old score orphans — the
 * stars vanish from the relocated lesson. At startup we re-key each orphan to its new home, but only
 * when it's unambiguous: match on the **last path segment** (the leaf, after the final `/`); if
 * exactly one current concept shares that leaf, switch the key; otherwise leave the orphan for a
 * future migration (a later move might disambiguate it).
 *
 * The planning is a pure function (unit-tested); the runner does the localStorage IO, reusing the
 * confidence store + the progress merge logic so a collision with an already-rated new id keeps the
 * best score and spans both dates.
 * @module
 */

import { loadGraph } from "./graph-data.ts";
import { allEntries, readEntry, writeEntry, removeEntry } from "./confidence-store.ts";
import { mergeProgress } from "./progress.ts";

/** The last path segment of a concept id (its "leaf"). */
function leaf(id: string) {
  return id.split("/").pop() ?? id;
}

/**
 * Plan which orphaned stored ids can be re-keyed to a current concept. Pure (no IO), so it's
 * unit-testable: given the ids the learner has scores under and the ids that currently exist in the
 * graph, return the unambiguous `{ from, to }` re-keys. An orphan is a `storedId` absent from
 * `existingIds`; it migrates only when its leaf matches **exactly one** existing concept. Zero or
 * multiple leaf matches → no op (left untouched).
 * @param storedIds   Ids the learner has confidence scores under.
 * @param existingIds Concept ids in the current graph.
 */
export function planMigration(storedIds: string[], existingIds: string[]): { from: string; to: string }[] {
  const existing = new Set(existingIds);
  /** leaf → existing ids ending in it */
  const byLeaf: Map<string, string[]> = new Map();
  for (const id of existingIds) {
    const k = leaf(id);
    const list = byLeaf.get(k);
    if (list) list.push(id);
    else byLeaf.set(k, [id]);
  }

  const ops: { from: string; to: string }[] = [];
  for (const id of storedIds) {
    if (existing.has(id)) continue; // still a real concept → nothing to do
    const matches = byLeaf.get(leaf(id));
    if (matches && matches.length === 1) ops.push({ from: id, to: matches[0] });
  }
  return ops;
}

/**
 * Run the migration once per page load (guarded), re-keying any unambiguously-moved confidence
 * scores. Never throws — a failure here must not break page load.
 */
export async function runProgressMigration(): Promise<void> {
  const w = window as any;
  if (w.__primerMigrationRan) return;
  w.__primerMigrationRan = true;

  try {
    const entries = allEntries();
    if (entries.length === 0) return; // no scores → nothing to migrate

    const { byId } = await loadGraph();
    const ops = planMigration(
      entries.map((e) => e.id),
      [...byId.keys()],
    );
    if (ops.length === 0) return;

    const orphanById = new Map(entries.map((e) => [e.id, e]));
    for (const { from, to } of ops) {
      const orphan = orphanById.get(from);
      if (!orphan) continue;
      // Read the target NOW (not from the start snapshot) so two orphans sharing one leaf accumulate.
      const current = readEntry(to);
      const [merged] = mergeProgress(
        current ? [{ id: to, ...current }] : [],
        [{ id: to, stars: orphan.stars, first: orphan.first, last: orphan.last }],
        "merge",
      );
      writeEntry(merged.id, merged.stars, merged.first, merged.last);
      removeEntry(from);
    }
    console.info(`primer: migrated ${ops.length} moved concept score(s).`);
  } catch {
    /* graph unavailable / localStorage blocked — leave scores as-is */
  }
}
