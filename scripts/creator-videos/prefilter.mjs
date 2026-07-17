// scripts/creator-videos/prefilter.mjs — Stage 2 of the Khan→concept pipeline.
// For every Khan-coverable concept, find the top-K candidate Khan videos by rarity-weighted title
// token overlap (a cheap lexical prefilter). The fuzzy "is this actually a good fit?" judgement is
// done afterwards by an LLM over just these candidates. Output: scripts/creator-videos/work/candidates.json.
//
//   node scripts/creator-videos/prefilter.mjs           # all eligible concepts
//   node scripts/creator-videos/prefilter.mjs pilot     # a ~40-concept spread across subjects, for calibration
import fs from "fs";

const K = 8; // candidates kept per concept
const MAX_LEVEL = 20; // Khan covers school → early-undergrad; skip the advanced tail
const SUBJECTS = ["mathematics", "physics", "applied-mathematics", "computer-science"];

const STOP = new Set(
  ("the a an of to in on for and or nor with without your you is are be am was were as at by from into it its" +
    " this that these those how what why when where which who whom introduction intro basics basic part parts" +
    " khan academy video lesson tutorial example examples using use used find finding solve solving get getting" +
    " understand understanding learn one two three first second overview about more you're we're let's").split(/\s+/),
);
/** Tokenize a title/label into significant lowercase words (pipes → spaces; drop stopwords + short words). */
const tokens = (s) =>
  String(s)
    .toLowerCase()
    .replace(/\bkhan academy\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

// --- Khan catalogue (id \t title) ---
const rows = fs
  .readFileSync("scripts/creator-videos/work/khan-videos.tsv", "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((l) => {
    const i = l.indexOf("\\t"); // yt-dlp --print emitted a LITERAL backslash-t, not a tab char
    return { id: l.slice(0, i), title: l.slice(i + 2), tok: tokens(l.slice(i + 2)) };
  })
  .filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id) && v.tok.length);
console.error(`videos: ${rows.length}`);

// IDF over the video corpus, so distinctive words (e.g. "logarithm") outweigh common ones ("number").
const df = new Map();
for (const v of rows) for (const t of new Set(v.tok)) df.set(t, (df.get(t) || 0) + 1);
const N = rows.length;
const idf = (t) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;
// Postings list: token → video indices, so we only score videos that share a word with the concept.
const postings = new Map();
rows.forEach((v, vi) => { for (const t of new Set(v.tok)) (postings.get(t) || postings.set(t, []).get(t)).push(vi); });

// --- concepts ---
const g = JSON.parse(fs.readFileSync("dist/graph.json", "utf8"));
const C = g.concepts || g.nodes || [];
const isHub = (id) => { const p = id.split("/"); return p.length >= 2 && p.at(-1) === p.at(-2); };
const hasVideo = (id) => { try { return fs.readFileSync(`concepts/${id}.html`, "utf8").includes("<primer-video"); } catch { return false; } };

let concepts = C.filter((c) => {
  const top = c.id.split("/")[0];
  if (!SUBJECTS.includes(top) || c.id.includes("/courses/") || top === "people" || c.id === "root") return false;
  if (isHub(c.id) || (typeof c.level === "number" && c.level > MAX_LEVEL)) return false;
  if (hasVideo(c.id)) return false;
  return true;
});

if (process.argv[2] === "pilot") {
  // ~10 per subject, spread through the list, for a representative calibration sample.
  const bySub = {};
  for (const c of concepts) (bySub[c.id.split("/")[0]] ||= []).push(c);
  concepts = Object.values(bySub).flatMap((arr) => arr.filter((_, i) => i % Math.ceil(arr.length / 10) === 0).slice(0, 10));
}
console.error(`concepts to match: ${concepts.length}`);

// --- score + top-K ---
const out = concepts.map((c) => {
  // concept tokens: the title + the distinctive path segments (topic context, e.g. "quadratics").
  const pathTok = c.id.split("/").slice(1, -1).flatMap((s) => tokens(s.replace(/-/g, " ")));
  const ctok = [...new Set([...tokens(c.title), ...pathTok])];
  const score = new Map();
  for (const t of ctok) for (const vi of postings.get(t) || []) score.set(vi, (score.get(vi) || 0) + idf(t));
  const top = [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, K)
    .map(([vi, s]) => ({ id: rows[vi].id, title: rows[vi].title, score: +s.toFixed(2) }));
  return { conceptId: c.id, conceptTitle: c.title, level: c.level ?? null, candidates: top };
});

fs.writeFileSync("scripts/creator-videos/work/candidates.json", JSON.stringify(out, null, 2));
const withCands = out.filter((o) => o.candidates.length).length;
console.error(`wrote scripts/creator-videos/work/candidates.json — ${out.length} concepts (${withCands} with ≥1 candidate)`);
