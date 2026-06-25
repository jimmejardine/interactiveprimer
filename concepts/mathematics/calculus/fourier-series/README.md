# Fourier series — curriculum roadmap

A small prerequisite mini-course: **representing a function as a sum of sines and cosines**. It is the
toolkit the PDE course leans on (separation of variables produces sine/cosine building blocks, and
Fourier series are what assemble them into a solution).

This file is **documentation only** — the graph build scans `*.html`, not `.md`.

## Design principles

- **One small idea per page** — orthogonality first (the geometry that makes everything work), then
  the coefficient formulas, then the series, then the half-range variants, convergence, the complex
  form, and finally the transform.
- **No `declaredLevel` yet** — the branch is left levelless for a later rooting/leveling pass; pages
  chain by `prerequisites` only.
- **Roots into existing calculus.** Orthogonality builds on the
  [dot product](../../linear-algebra/vectors/the-dot-product.html) (the analogy: functions as vectors)
  and the [definite integral](../integration/the-definite-integral.html) (the inner product is an
  integral).

## Pages

| # | id | Title | Prerequisites |
|---|---|---|---|
| — | `calculus/fourier-series/fourier-series` | Fourier Series (landing) | `linear-algebra/vectors/the-dot-product`, `calculus/integration/the-definite-integral` |
| 1 | `calculus/fourier-series/orthogonal-functions` | Orthogonal Functions | the-dot-product, the-definite-integral |
| 2 | `calculus/fourier-series/fourier-coefficients` | The Fourier Coefficients | orthogonal-functions |
| 3 | `calculus/fourier-series/the-fourier-series` | The Fourier Series | fourier-coefficients |
| 4 | `calculus/fourier-series/sine-and-cosine-series` | Sine and Cosine Series | the-fourier-series |
| 5 | `calculus/fourier-series/convergence-of-fourier-series` | Convergence & Gibbs | the-fourier-series, series/infinite-series |
| 6 | `calculus/fourier-series/complex-fourier-series` | The Complex Fourier Series | the-fourier-series |
| 7 | `calculus/fourier-series/the-fourier-transform` | The Fourier Transform | complex-fourier-series |

## Feeds into

`calculus/partial-differential-equations/` — `separation-of-variables`, `heat-equation-on-an-interval`,
`vibrating-string-modes`, `laplace-on-a-rectangle` (Fourier series) and `heat-equation-on-the-line`
(the transform).
