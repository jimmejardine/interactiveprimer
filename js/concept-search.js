// @ts-check
/**
 * Name search over the concept list for the graph explorer — pure and DOM-free, so it's
 * unit-testable. Ranks **full-string (prefix) matches first, then substring matches** (an exact
 * title beats both), case-insensitively.
 * @module
 */

/** @typedef {{ id: string, title: string }} SearchItem */

/**
 * The best `limit` concepts whose title matches `query`, ranked exact → prefix → substring, then
 * alphabetically. An empty/whitespace query returns `[]`.
 * @param {SearchItem[]} items
 * @param {string} query
 * @param {number} [limit]
 * @returns {SearchItem[]}
 */
export function searchConcepts(items, query, limit = 10) {
  const q = String(query).trim().toLowerCase();
  if (!q) return [];
  /** @type {{ it: SearchItem, score: number }[]} */
  const scored = [];
  for (const it of items) {
    const t = String(it.title).toLowerCase();
    let score;
    if (t === q) score = 0; // exact title
    else if (t.startsWith(q)) score = 1; // full-string (prefix) match
    else if (t.includes(q)) score = 2; // substring match
    else continue;
    scored.push({ it, score });
  }
  scored.sort((a, b) => a.score - b.score || a.it.title.localeCompare(b.it.title));
  return scored.slice(0, Math.max(0, limit)).map((s) => s.it);
}
