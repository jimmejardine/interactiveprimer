# Inverse problem theory — curriculum roadmap

A full applied-math course: given a forward model `d = G(m)` and noisy data `d`, recover the model `m`.
It ties together least squares, the SVD, conditioning, regularization, and Bayesian inference — the
capstone that uses the linear-algebra and probability machinery the rest of the site builds.

This file is **documentation only** — the graph build scans `*.html`, not `.md`.

## Design principles

- **One small idea per page**, chained by `prerequisites`.
- **No `declaredLevel` yet** — chain by `prerequisites` only, levelless for a later pass.
- **Applied-math rooting** (matches `game-development-math/`): the **hub** roots into the linear-algebra
  prerequisites + `applied-mathematics/applied-mathematics`; content pages chain to each other and to
  specific math pages. The Bayesian stage depends on the new `mathematics/probability/` mini-course.
- **Two LA gaps are authored here** (central to the subject): the Moore–Penrose **pseudoinverse**
  (`the-generalized-inverse`, `svd-and-the-pseudoinverse`) and the **condition number**
  (`conditioning-and-the-condition-number`), with soft refs to the existing LA pages.
- **Visuals**: best-fit + residuals, circle→ellipse (SVD/conditioning), filter-factor curves, Picard
  blow-up, the L-curve, 1-D Bayesian updates, covariance ellipses, a resolution heatmap, deconvolution
  ringing — all `themeColors()`, sliders below the figure.

## Stages & pages (ids under `applied-mathematics/inverse-problems/`)

| Stage | id | Title | Prerequisites |
|---|---|---|---|
| — | `inverse-problems` | Inverse Problems (landing) | linear-algebra SVD + projection, applied-mathematics |
| A | `forward-and-inverse-problems` | Forward and Inverse Problems | inverse-problems, matrix-times-vector |
| A | `the-linear-inverse-problem` | The Linear Inverse Problem | forward-and-inverse-problems, matrix-form-of-a-system |
| A | `existence-uniqueness-stability` | Why Inverse Problems Are Hard | the-linear-inverse-problem |
| B | `least-squares-solution` | The Least-Squares Solution | the-linear-inverse-problem, projection |
| B | `the-generalized-inverse` | The Generalized Inverse | least-squares-solution, the-inverse-matrix |
| B | `svd-and-the-pseudoinverse` | SVD and the Pseudoinverse | the-generalized-inverse, the-singular-value-decomposition |
| C | `conditioning-and-the-condition-number` | Conditioning | svd-and-the-pseudoinverse |
| C | `ill-posed-problems-and-noise` | Ill-Posedness and Noise | conditioning-and-the-condition-number |
| C | `the-picard-condition` | The Picard Condition | ill-posed-problems-and-noise |
| D | `tikhonov-regularization` | Tikhonov Regularization | ill-posed-problems-and-noise, the-generalized-inverse |
| D | `truncated-svd` | Truncated SVD | svd-and-the-pseudoinverse, tikhonov-regularization |
| D | `choosing-the-regularization-parameter` | Choosing α: the L-Curve | tikhonov-regularization |
| D | `smoothing-and-general-tikhonov` | Smoothing and General Tikhonov | tikhonov-regularization |
| D | `resolution-and-the-model-resolution-matrix` | Resolution | truncated-svd |
| E | `the-statistical-view` | The Statistical View | the-linear-inverse-problem, probability/likelihood-and-mle |
| E | `maximum-likelihood-and-least-squares` | Maximum Likelihood = Least Squares | the-statistical-view, least-squares-solution |
| E | `the-bayesian-formulation` | The Bayesian Formulation | the-statistical-view, probability/bayes-theorem, probability/map-estimation |
| E | `gaussian-priors-and-tikhonov` | Priors Are Regularization | the-bayesian-formulation, tikhonov-regularization |
| E | `the-posterior-covariance` | Quantifying Uncertainty | gaussian-priors-and-tikhonov, probability/the-covariance-matrix, probability/the-multivariate-gaussian |
| F | `nonlinear-inverse-problems` | Nonlinear Inverse Problems | the-generalized-inverse, the-statistical-view |
| F | `deconvolution` | Deconvolution | tikhonov-regularization |
| F | `computed-tomography` | Computed Tomography | the-linear-inverse-problem, truncated-svd |
