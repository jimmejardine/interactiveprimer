// scripts/creator-videos/prep.mjs — generalised prefilter + batch, for any creator catalogue.
//   node scripts/creator-videos/prep.mjs --videos scripts/creator-videos/work/reducible-videos.tsv --source Reducible --subjects computer-science,mathematics
//   ... --pilot   (a ~24-concept spread for calibration)   ... --batch 80
// Reads a "<id>\t<title>" TSV (literal \t), scores every in-scope concept against it by rarity-weighted
// title-token overlap, and writes scripts/creator-videos/work/<slug>-candidates.json + scripts/creator-videos/work/<slug>-batches/batch-NN.json.
import fs from "fs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const VIDEOS = arg("--videos");
const SOURCE = arg("--source");
const SUBJECTS = (arg("--subjects", "mathematics,physics,applied-mathematics,computer-science")).split(",");
const K = +arg("--batch-k", 8);
const BATCH = +arg("--batch", 80);
if (!VIDEOS || !SOURCE) { console.error("need --videos and --source"); process.exit(1); }
const slug = SOURCE.toLowerCase().replace(/[^a-z0-9]/g, "");

const STOP = new Set(
  ("the a an of to in on for and or nor with without your you is are be am was were as at by from into it its this" +
    " that these those how what why when where which who whom introduction intro basics basic part parts video" +
    " lesson tutorial example examples using use used find finding solve solving get getting understand learn one" +
    " two three first second overview about more numberphile computerphile reducible veritasium academy khan").split(/\s+/),
);
const tokens = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

const rows = fs.readFileSync(VIDEOS, "utf8").split(/\r?\n/).filter(Boolean).map((l) => {
  const i = l.indexOf("\\t");
  const id = i < 0 ? l : l.slice(0, i);
  const title = i < 0 ? "" : l.slice(i + 2);
  return { id, title, tok: tokens(title) };
}).filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id) && v.tok.length);
console.error(`${SOURCE}: ${rows.length} videos`);

const df = new Map();
for (const v of rows) for (const t of new Set(v.tok)) df.set(t, (df.get(t) || 0) + 1);
const N = rows.length;
const idf = (t) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;
const postings = new Map();
rows.forEach((v, vi) => { for (const t of new Set(v.tok)) (postings.get(t) || postings.set(t, []).get(t)).push(vi); });

const g = JSON.parse(fs.readFileSync("dist/graph.json", "utf8"));
const C = g.concepts || g.nodes || [];
const isHub = (id) => { const p = id.split("/"); return p.length >= 2 && p.at(-1) === p.at(-2); };
let concepts = C.filter((c) => {
  const top = c.id.split("/")[0];
  if (!SUBJECTS.includes(top) || c.id.includes("/courses/") || top === "people" || c.id === "root") return false;
  if (isHub(c.id)) return false; // NOTE: no level cap; do NOT exclude pages that already have a video (we append)
  return true;
});
if (has("--pilot")) {
  const bySub = {};
  for (const c of concepts) (bySub[c.id.split("/")[0]] ||= []).push(c);
  concepts = Object.values(bySub).flatMap((a) => a.filter((_, i) => i % Math.ceil(a.length / 8) === 0).slice(0, 8));
}
console.error(`concepts in scope: ${concepts.length}`);

const out = concepts.map((c) => {
  const pathTok = c.id.split("/").slice(1, -1).flatMap((s) => tokens(s.replace(/-/g, " ")));
  const ctok = [...new Set([...tokens(c.title), ...pathTok])];
  const score = new Map();
  for (const t of ctok) for (const vi of postings.get(t) || []) score.set(vi, (score.get(vi) || 0) + idf(t));
  const top = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, K)
    .map(([vi, s]) => ({ id: rows[vi].id, title: rows[vi].title, score: +s.toFixed(2) }));
  return { conceptId: c.id, conceptTitle: c.title, candidates: top };
}).filter((o) => o.candidates.length && o.candidates[0].score >= +arg("--floor", 0)); // ≥1 candidate above the score floor
out.sort((a, b) => b.candidates[0].score - a.candidates[0].score);
const TOP = +arg("--top", 0);
if (TOP) out.length = Math.min(out.length, TOP); // keep only the top-N concepts by best-candidate score (bounds fan-out)

fs.writeFileSync(`scripts/creator-videos/work/${slug}-candidates.json`, JSON.stringify(out, null, 2));
const bdir = `scripts/creator-videos/work/${slug}-batches`;
fs.rmSync(bdir, { recursive: true, force: true });
fs.mkdirSync(bdir, { recursive: true });
fs.mkdirSync(`scripts/creator-videos/work/${slug}-out`, { recursive: true });
let n = 0;
for (let i = 0; i < out.length; i += BATCH) fs.writeFileSync(`${bdir}/batch-${String(++n).padStart(2, "0")}.json`, JSON.stringify(out.slice(i, i + BATCH)));
console.error(`wrote scripts/creator-videos/work/${slug}-candidates.json (${out.length} concepts w/ candidates) → ${n} batch(es) in ${bdir}`);
