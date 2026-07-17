// scripts/creator-videos/inject2.mjs — generalised multi-source injector (append-aware, dedup, capped).
//   node scripts/creator-videos/inject2.mjs --source Reducible --videos scripts/creator-videos/work/reducible-videos.tsv [--dry] [--cap 3]
// Merges scripts/creator-videos/work/<slug>-out/batch-*.json, then for each concept's HIGH matches: adds up to `cap` total
// <primer-video> per page, appending into an existing "See it explained" card when present (so creator
// videos sit alongside a Khan one), skipping ids already on the page.
import fs from "fs";
import path from "path";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry");
const SOURCE = arg("--source");
const VIDEOS = arg("--videos");
const CAP = +arg("--cap", 3);
if (!SOURCE || !VIDEOS) { console.error("need --source and --videos"); process.exit(1); }
const slug = SOURCE.toLowerCase().replace(/[^a-z0-9]/g, "");

const validIds = new Set(
  fs.readFileSync(VIDEOS, "utf8").split(/\r?\n/).filter(Boolean)
    .map((l) => { const i = l.indexOf("\\t"); return i < 0 ? l : l.slice(0, i); })
    .filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)),
);

const outDir = `scripts/creator-videos/work/${slug}-out`;
const merged = [];
for (const f of fs.readdirSync(outDir).filter((f) => /^batch-\d+\.json$/.test(f)).sort()) {
  try { const a = JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8")); if (Array.isArray(a)) merged.push(...a); }
  catch (e) { console.error(`! ${f}: ${e.message}`); }
}
if (!DRY) fs.writeFileSync(`scripts/creator-videos/work/${slug}-matches.json`, JSON.stringify(merged, null, 2));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const SUFFIX = /\s*[-–—|]\s*(Numberphile|Computerphile|Reducible|Veritasium|3Blue1Brown|Khan Academy)\s*$/i;
const caption = (title) => {
  let t = String(title).split("|")[0].trim().replace(SUFFIX, "").trim();
  return `${esc(t)} — ${SOURCE}`;
};
const tag = (m) => `      <primer-video src="${m.videoId}" caption="${caption(m.title)}"></primer-video>`;

let added = 0, pagesTouched = 0, appended = 0, newCards = 0, skippedFull = 0, skippedDup = 0, badId = 0, noFile = 0;
const mediumRows = [];

for (const c of merged) {
  const ms = Array.isArray(c.matches) ? c.matches : [];
  for (const m of ms) if (m.confidence === "medium") mediumRows.push(`| ${c.conceptId} | ${m.videoId} | ${esc(m.title)} | ${esc(m.reason || "")} |`);
  let highs = ms.filter((m) => m.confidence === "high");
  for (const m of highs) if (!validIds.has(m.videoId)) badId++;
  highs = highs.filter((m) => validIds.has(m.videoId));
  if (!highs.length) continue;

  const file = `concepts/${c.conceptId}.html`;
  let html;
  try { html = fs.readFileSync(file, "utf8"); } catch { noFile++; continue; }

  const onPage = new Set([...html.matchAll(/<primer-video\s+src="([^"]+)"/g)].map((m) => m[1]));
  const room = CAP - onPage.size;
  if (room <= 0) { skippedFull++; continue; }
  const pick = [];
  for (const m of highs) {
    if (pick.length >= room) break;
    if (onPage.has(m.videoId) || pick.some((p) => p.videoId === m.videoId)) { skippedDup++; continue; }
    pick.push(m);
  }
  if (!pick.length) continue;

  const block = pick.map(tag).join("\n") + "\n";
  const hIdx = html.indexOf("<h2>See it explained</h2>");
  let next;
  if (hIdx !== -1) { // append into the existing "See it explained" card, before its </primer-card>
    const close = html.indexOf("</primer-card>", hIdx);
    const lineStart = html.lastIndexOf("\n", close) + 1;
    next = html.slice(0, lineStart) + block + html.slice(lineStart);
    appended++;
  } else { // fresh card before the quiz, else before </body>
    const card = `\n    <primer-card>\n      <h2>See it explained</h2>\n${block}    </primer-card>\n`;
    const quiz = html.search(/<primer-quiz\b/);
    if (quiz !== -1) { const ls = html.lastIndexOf("\n", quiz) + 1; next = html.slice(0, ls) + card + "\n" + html.slice(ls); }
    else if (html.includes("</body>")) next = html.replace("</body>", `${card}  </body>`);
    else continue;
    newCards++;
  }
  if (!DRY) fs.writeFileSync(file, next);
  added += pick.length; pagesTouched++;
}

if (!DRY) fs.writeFileSync(`scripts/creator-videos/work/${slug}-review-medium.md`,
  `# ${SOURCE} — MEDIUM-confidence matches (not injected)\n\n| Concept | Video id | Title | Why |\n|---|---|---|---|\n${mediumRows.join("\n")}\n`);

console.log(JSON.stringify({ source: SOURCE, concepts: merged.length, videosAdded: added, pagesTouched, appendedToExistingCard: appended, newCards, skippedPageFull: skippedFull, skippedDuplicate: skippedDup, invalidHighIds: badId, missingPage: noFile, mediumForReview: mediumRows.length, dryRun: DRY }, null, 2));
