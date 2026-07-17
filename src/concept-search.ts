/**
 * Name search over the concept list for the graph explorer — pure and DOM-free, so it's
 * unit-testable. Ranks **full-string (prefix) matches first, then substring matches** (an exact
 * title beats both), case-insensitively.
 * @module
 */

export type SearchItem = { id: string, title: string, course?: boolean };

/**
 * The best `limit` concepts whose title matches `query`, ranked exact → prefix → substring, then
 * alphabetically. An empty/whitespace query returns `[]`.
 */
export function searchConcepts(items: SearchItem[], query: string, limit: number = 10): SearchItem[] {
  const q = String(query).trim().toLowerCase();
  if (!q) return [];
  const scored: { it: SearchItem, score: number }[] = [];
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
