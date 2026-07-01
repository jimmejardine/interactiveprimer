# Mathematics — roadmap (ages 5 → 18)

This was the master plan for building out `concepts/mathematics/**` from age **5** to age **18**. That
build is now **essentially complete** — every strand from early number through A-level (and well beyond,
into undergraduate analysis, number theory, linear algebra and more) has been written. This page has been
trimmed to list **only the handful of school-level ideas still to build**; everything already built has
been removed.

**How to read it**

- Each item below is a **leaf** ≈ one teachable page ("one small idea per page"). It lists the topic and
  the folder under `concepts/mathematics/` where it would live.
- When promoting a leaf to a real page, follow `CLAUDE.md`: one idea per page, set `prerequisites` to the
  pages directly feeding it, and let levels propagate.

---

## Still to build

- **Fact families** — the four related facts linking a part-part-whole trio (e.g. 3 + 4 = 7, 4 + 3 = 7,
  7 − 3 = 4, 7 − 4 = 3), as a single idea. *(Folder: `arithmetic/operations/`. The inverse relationships
  themselves are already built — `subtraction-as-inverse`, `division-as-inverse` — this is the explicit
  "fact family" framing.)*
- **Combining ratios** — merging two ratios that share a term into one three-part ratio (a : b with
  b : c → a : b : c). *(Folder: `arithmetic/ratio-and-proportion/`. `ratio-basics` and
  `proportional-relationships` only touch it.)*
- **Vector geometry / proof** — using vectors to prove geometric facts (points collinear, a midpoint,
  parallel path segments) — the GCSE/A-level "path" style proof. *(Folder: `geometry/` or
  `linear-algebra/vectors/`. Vector *operations* are built under `linear-algebra/vectors/`; this is the
  proof application.)*
- **Expected value & simple probability distributions** — a discrete probability distribution table and
  its expected value E(X) = Σ x·P(x), at pre-A-level. *(Folder: `statistics/distributions/` or
  `statistics/probability/`. The `the-binomial-distribution` and `what-is-a-distribution` pages exist;
  this is the general discrete-distribution / expectation idea.)*

---

## Notes

- **The build has run ahead of this plan.** Beyond the school curriculum, whole families of pages now
  exist that were never in the original 5→18 tree — e.g. `statistics/{estimation,sampling,testing,bayesian}/*`,
  the `calculus/{series,analysis,multivariable,vector-calculus,differential-equations,fourier-series,partial-differential-equations}/*`
  strands, most of `linear-algebra/*`, `number-theory/*` (up to analytic/algebraic NT), and
  `complex-analysis/*`.
- **Curriculum re-packagings** live under `concepts/mathematics/courses/` (South Africa CAPS, UK,
  International Baccalaureate, and US Common Core) — these curate the built concepts into grade/year paths
  and are the better place to see per-syllabus coverage than this flat roadmap.
- If a leaf above gets built, delete it from this list.
