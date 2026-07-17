# creator-videos — the "See it explained" video pipeline

Puts YouTube explainer videos (`<primer-video>` tags) onto concept pages, matched per concept.
Used so far for Khan Academy, 3Blue1Brown, Computerphile, Numberphile, Veritasium and Reducible.

All scripts run **from the repo root**. Working data (harvested catalogues, candidate lists, LLM
batch outputs, review reports) lives in `work/` — **gitignored**, regenerable, ~10 MB.

## The four stages

1. **Harvest** (manual / yt-dlp): a creator's catalogue as a `<videoId>\t<title>` TSV →
   `work/<slug>-videos.tsv` (the original Khan run used `work/khan-videos.tsv`).
2. **Prefilter** — cheap lexical match, no LLM:
   - `node scripts/creator-videos/prefilter.mjs [pilot]` — the original Khan-specific stage →
     `work/candidates.json` + `work/batches/`.
   - `node scripts/creator-videos/prep.mjs --videos work/<slug>-videos.tsv --source <Name>
     [--subjects a,b] [--pilot] [--batch 80]` — the generalised version for any creator →
     `work/<slug>-candidates.json` + `work/<slug>-batches/`.
   Both score every in-scope concept against the catalogue by rarity-weighted title-token overlap
   and emit batch files sized for one LLM agent each.
3. **Match** (LLM): agents judge each batch ("is this video actually a good fit for this
   concept?") and write `work/[<slug>-]out/batch-NN.json` verdicts (HIGH / MEDIUM / NO, with why).
4. **Inject**:
   - `node scripts/creator-videos/inject.mjs [--dry]` — the original Khan injector.
   - `node scripts/creator-videos/inject2.mjs --source <Name> --videos work/<slug>-videos.tsv
     [--dry] [--cap 3]` — generalised: merges the out/ batches, appends HIGH matches as
     `<primer-video>` tags into each concept's "See it explained" card (creating it if absent),
     dedupes ids already on the page, caps videos per page.
   MEDIUM matches are never injected — they land in `work/[<slug>-]review-medium.md` for a human.
