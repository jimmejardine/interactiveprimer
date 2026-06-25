# Partial differential equations — curriculum roadmap

A full course on PDEs: equations whose unknown is a function of several variables, tied together by its
partial derivatives. It picks up from the single teaser page
`calculus/differential-equations/introduction-to-pdes.html` and goes deep, one idea per page.

This file is **documentation only** — the graph build scans `*.html`, not `.md`.

## Design principles

- **One small idea per page**, chained by `prerequisites`.
- **No `declaredLevel` yet** — left levelless for a later rooting/leveling pass.
- **Roots into existing content**: the bridge is `differential-equations/introduction-to-pdes`; the
  separation method needs the `calculus/fourier-series/` mini-course; first-order pages use the
  `multivariable/the-multivariable-chain-rule`.
- **Visuals without 3D surfaces.** `<primer-chart-3d>` has no surface support, so solutions are shown
  as **2D profiles with a time slider** (`<primer-chart>`), **characteristic/slope fields** and
  **tiled heatmaps** (`<primer-geometry>`), and **finite-difference stencils**.

## Stages & pages (all ids under `calculus/partial-differential-equations/`)

| Stage | id | Title | Prerequisites |
|---|---|---|---|
| — | `partial-differential-equations` | PDEs (landing) | `differential-equations/introduction-to-pdes` |
| A | `order-and-linearity` | Order & Linearity of PDEs | introduction-to-pdes, multivariable/partial-derivatives |
| A | `the-superposition-principle` | The Superposition Principle | order-and-linearity |
| B | `the-transport-equation` | The Transport Equation | the-superposition-principle, multivariable/the-multivariable-chain-rule |
| B | `method-of-characteristics` | The Method of Characteristics | the-transport-equation |
| B | `quasilinear-equations-and-shocks` | Quasilinear Equations & Shocks | method-of-characteristics |
| C | `classifying-second-order-pdes` | Elliptic, Parabolic, Hyperbolic | order-and-linearity |
| C | `boundary-and-initial-conditions` | Boundary & Initial Conditions | classifying-second-order-pdes |
| C | `well-posedness` | Well-Posedness | boundary-and-initial-conditions |
| D | `separation-of-variables` | Separation of Variables | introduction-to-pdes, fourier-series/the-fourier-series |
| D | `the-heat-equation` | Deriving the Heat Equation | order-and-linearity, multivariable/partial-derivatives |
| D | `heat-equation-on-an-interval` | The Heated Rod | separation-of-variables, fourier-series/sine-and-cosine-series, the-heat-equation |
| D | `steady-state-and-transient` | Steady State & Transient | heat-equation-on-an-interval |
| E | `the-wave-equation` | Deriving the Wave Equation | the-heat-equation, multivariable/partial-derivatives |
| E | `dalemberts-solution` | d'Alembert's Solution | the-wave-equation, method-of-characteristics |
| E | `vibrating-string-modes` | Standing Waves & Harmonics | the-wave-equation, separation-of-variables, fourier-series/sine-and-cosine-series |
| F | `laplaces-equation` | Laplace's Equation | the-heat-equation, classifying-second-order-pdes |
| F | `laplace-on-a-rectangle` | Laplace on a Rectangle | laplaces-equation, separation-of-variables, fourier-series/the-fourier-series |
| F | `laplace-on-a-disk` | Laplace on a Disk | laplace-on-a-rectangle |
| F | `the-maximum-principle` | The Maximum Principle | laplaces-equation |
| F | `poissons-equation` | Poisson's Equation | laplaces-equation |
| G | `heat-equation-on-the-line` | The Heat Kernel | fourier-series/the-fourier-transform, heat-equation-on-an-interval |
| H | `finite-differences-for-pdes` | Finite Differences | heat-equation-on-an-interval, multivariable/partial-derivatives |
| H | `stability-of-finite-differences` | Numerical Stability | finite-differences-for-pdes, well-posedness |
