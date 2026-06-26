# Statistics

A full first course in **statistics** — learning honest conclusions from messy data — built the
Primer way: one small idea per page, each with an interactive picture and a quiz.

## Vision

Statistics is the umbrella; **probability** lives under it. The classical course runs
descriptive → distributions → sampling → estimation → testing → relationships, and the Bayesian
inference pages live in `bayesian/` as **Stage 7 — Bayesian inference** (the other way to reason
under uncertainty). These pages were migrated here from the former `mathematics/probability/`
folder, which has been removed; everything that referenced them (the inverse-problems course,
primality testing) now points at `mathematics/statistics/...`.

## Principles

- **One small idea per page.** A page teaches a single digestible thing, then stops. Split rather
  than cram (mean, median, mode, range, variance, standard deviation are each their own page).
- **Picture first, formula second.** Every page carries a themed interactive (a `<primer-chart>`,
  `<primer-geometry>`, or `<primer-chart-3d>`) and a short `<primer-quiz>`.
- **Chain by prerequisites; defer levels.** No `declaredLevel` yet — the course orders itself by the
  `prerequisites` DAG, and the learning path is the **hub's soft-ref order** (`statistics.html`).
  Levels can be assigned in a later curriculum pass.
- **Rooted into mathematics.** The hub (`statistics/statistics`) takes `mathematics/mathematics` as
  its one prerequisite; `descriptive/data-and-variables` roots into the hub, and everything else
  chains from there.

## The seven stages

1. **Describing data** (`descriptive/`) — data-and-variables, the-mean, the-median, the-mode,
   range-and-spread, variance, standard-deviation, quartiles-and-the-iqr, histograms,
   shape-skew-and-outliers.
2. **Distributions** (`distributions/`) — what-is-a-distribution, the-normal-distribution,
   the-empirical-rule, z-scores.
3. **Sampling** (`sampling/`) — population-and-sample, sampling-and-bias,
   the-sampling-distribution-of-the-mean, standard-error, the-central-limit-theorem.
4. **Estimation** (`estimation/`) — point-estimates, confidence-intervals,
   a-confidence-interval-for-a-mean.
5. **Hypothesis testing** (`testing/`) — hypothesis-testing, the-p-value,
   significance-and-the-t-test, type-i-and-type-ii-errors.
6. **Relationships** (`regression/`) — scatter-plots, correlation, the-regression-line,
   interpreting-slope-and-intercept.
7. **Bayesian inference** (`bayesian/`) — bayes-theorem, likelihood-and-mle, the-covariance-matrix,
   the-multivariate-gaussian, map-estimation (migrated here from the former `mathematics/probability/`).
