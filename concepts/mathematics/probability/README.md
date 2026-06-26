# Probability & statistical inference — curriculum roadmap

A small prerequisite mini-course: **reasoning under uncertainty** — Bayes, likelihood, MAP, and the
covariance matrix. It is the toolkit the Bayesian half of the inverse-problems course leans on (data =
forward model + noise; priors as regularization; posterior covariance as uncertainty).

This file is **documentation only** — the graph build scans `*.html`, not `.md`.

## Design principles

- **One small idea per page**: Bayes first (the update rule), then likelihood/MLE, then the covariance
  matrix and the multivariate Gaussian, then MAP (where prior meets likelihood).
- **No `declaredLevel` yet** — chain by `prerequisites` only, levelless for a later pass.
- **Self-contained rooting.** The landing roots into `mathematics/mathematics`; content pages chain to
  it and each other. The existing measure-theoretic probability pages under
  `applied-mathematics/maths-of-finance/probability/` are referenced only softly (e.g. the normal
  distribution) — this mini-course is the general, classical-inference companion.

## Pages

| # | id | Title | Prerequisites |
|---|---|---|---|
| — | `mathematics/probability/probability` | Probability & Inference (landing) | `mathematics/mathematics` |
| 1 | `mathematics/probability/bayes-theorem` | Bayes' Theorem | probability (landing) |
| 2 | `mathematics/probability/likelihood-and-mle` | Likelihood and MLE | bayes-theorem |
| 3 | `mathematics/probability/the-covariance-matrix` | The Covariance Matrix | probability (landing) |
| 4 | `mathematics/probability/the-multivariate-gaussian` | The Multivariate Gaussian | the-covariance-matrix |
| 5 | `mathematics/probability/map-estimation` | MAP Estimation | bayes-theorem, likelihood-and-mle |

## Feeds into

`applied-mathematics/inverse-problems/` — `the-statistical-view`, `maximum-likelihood-and-least-squares`,
`the-bayesian-formulation`, `gaussian-priors-and-tikhonov`, `the-posterior-covariance`.
