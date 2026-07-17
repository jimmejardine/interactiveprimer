// scripts/creator-videos/inject.mjs — Stage 4: merge agent outputs → inject high-confidence Khan videos into pages.
//   node scripts/creator-videos/inject.mjs --dry   # report only, write nothing
//   node scripts/creator-videos/inject.mjs         # merge, inject, write scripts/creator-videos/work/matches.json + scripts/creator-videos/work/review-medium.md
import fs from "fs";
import path from "path";

const DRY = process.argv.includes("--dry");
const MAX_PER = 3;

// Valid Khan ids (guard against any invented id).
const validIds = new Set(
  fs.readFileSync("scripts/creator-videos/work/khan-videos.tsv", "utf8").split(/\r?\n/).filter(Boolean)
    .map((l) => l.slice(0, l.indexOf("\\t"))).filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)),
);

// Merge every scripts/creator-videos/work/out/batch-*.json.
const outDir = "scripts/creator-videos/work/out";
const merged = [];
for (const f of fs.readdirSync(outDir).filter((f) => /^batch-\d+\.json$/.test(f)).sort()) {
  try {
    const arr = JSON.parse(fs.readFileSync(path.join(outDir, f), "utf8"));
    if (Array.isArray(arr)) merged.push(...arr);
    else console.error(`! ${f}: not an array, skipped`);
  } catch (e) { console.error(`! ${f}: ${e.message}`); }
}
if (!DRY) fs.writeFileSync("scripts/creator-videos/work/matches.json", JSON.stringify(merged, null, 2));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// "Integrating factors 1 | First order differential equations | Khan Academy" → "Integrating factors 1 — Khan Academy"
const caption = (title) => `${esc(String(title).split("|")[0].trim())} — Khan Academy`;

let injected = 0, skipped = 0, badId = 0, noFile = 0, highConcepts = 0;
const mediumRows = [];

for (const c of merged) {
  const ms = Array.isArray(c.matches) ? c.matches : [];
  const highs = ms.filter((m) => m.confidence === "high" && validIds.has(m.videoId)).slice(0, MAX_PER);
  for (const m of ms) if (m.confidence === "high" && !validIds.has(m.videoId)) badId++;
  for (const m of ms) if (m.confidence === "medium") mediumRows.push(`| ${c.conceptId} | ${m.videoId} | ${esc(m.title)} | ${esc(m.reason || "")} |`);
  if (!highs.length) continue;
  highConcepts++;

  const file = `concepts/${c.conceptId}.html`;
  let html;
  try { html = fs.readFileSync(file, "utf8"); } catch { noFile++; continue; }
  if (html.includes("<primer-video")) { skipped++; continue; } // already has one

  const vids = highs.map((m) => `      <primer-video src="${m.videoId}" caption="${caption(m.title)}"></primer-video>`).join("\n");
  const card = `\n    <primer-card>\n      <h2>See it explained</h2>\n${vids}\n    </primer-card>\n`;

  // Insert before the quiz if present (so "see it explained" precedes the test), else before </body>.
  const quiz = html.search(/<primer-quiz\b/);
  let next;
  if (quiz !== -1) {
    const lineStart = html.lastIndexOf("\n", quiz) + 1;
    next = html.slice(0, lineStart) + card + "\n" + html.slice(lineStart);
  } else if (html.includes("</body>")) {
    next = html.replace("</body>", `${card}  </body>`);
  } else { skipped++; continue; }

  if (!DRY) fs.writeFileSync(file, next);
  injected++;
}

if (!DRY) {
  const md = `# Khan videos — MEDIUM-confidence matches (manual review)\n\n` +
    `These were NOT injected. Review and add by hand if good.\n\n` +
    `| Concept | Video id | Title | Why |\n|---|---|---|---|\n${mediumRows.join("\n")}\n`;
  fs.writeFileSync("scripts/creator-videos/work/review-medium.md", md);
}

console.log(JSON.stringify({
  concepts: merged.length, highConcepts, pagesInjected: injected,
  skippedAlreadyHadVideo: skipped, missingPage: noFile, invalidHighIds: badId,
  mediumForReview: mediumRows.length, dryRun: DRY,
}, null, 2));
