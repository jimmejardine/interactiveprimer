# Calculus — curriculum roadmap (differential calculus)

This is the planned authoring sequence for the calculus branch. It is **documentation
only** — none of these pages exist yet. The graph build scans `*.html`, so this file does
not affect the tree.

## Design principles

- **One small idea per page.** Concepts are atomic and build up slowly — e.g. the
  derivative is established power by power (constant → $x$ → $x^2$ → $x^3$) *before* the
  general power rule, so the pattern $0,\,1,\,2x,\,3x^2,\dots$ is discovered, not asserted.
- **Differential calculus only.** Limits → the derivative → rules → applications.
  Integration is a future extension past the end of this list.
- **Precalc lead-in first.** The tree has no "functions" concept, so Stage A bridges in.
- **Unrooted for now.** The first concept (`calculus/what-is-a-function`) has **no
  prerequisites**, so the graph build auto-attaches it to the `orphans` node. Every other
  concept's prerequisites point only at earlier *calculus* concepts. Calculus is
  deliberately not wired into arithmetic/algebra yet.
- **No `declaredLevel`** on any concept while the branch is unrooted.

Each planned page lives at `concepts/<id>.html` (so the `id` equals the path under
`concepts/`), in kebab-case under `calculus/`.

## Stage A — Functions & graphs (precalc lead-in)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 1 | `calculus/what-is-a-function` | What Is a Function? | — (unrooted → orphans) |
| 2 | `calculus/function-notation` | Function Notation | `calculus/what-is-a-function` |
| 3 | `calculus/domain-and-range` | Domain and Range | `calculus/function-notation` |
| 4 | `calculus/the-coordinate-plane` | The Coordinate Plane | `calculus/what-is-a-function` |
| 5 | `calculus/graphing-functions` | Graphing a Function | `calculus/the-coordinate-plane`, `calculus/domain-and-range` |
| 6 | `calculus/linear-functions` | Linear Functions | `calculus/graphing-functions` |
| 7 | `calculus/slope-of-a-line` | Slope of a Line | `calculus/linear-functions` |

## Stage B — Rates of change

| # | id | Title | Prerequisites |
|---|---|---|---|
| 8 | `calculus/average-rate-of-change` | Average Rate of Change | `calculus/slope-of-a-line` |
| 9 | `calculus/the-difference-quotient` | The Difference Quotient | `calculus/average-rate-of-change`, `calculus/function-notation` |

## Stage C — Limits & continuity

| # | id | Title | Prerequisites |
|---|---|---|---|
| 10 | `calculus/idea-of-a-limit` | The Idea of a Limit | `calculus/graphing-functions` |
| 11 | `calculus/one-sided-limits` | One-Sided Limits | `calculus/idea-of-a-limit` |
| 12 | `calculus/when-limits-fail` | When a Limit Doesn't Exist | `calculus/one-sided-limits` |
| 13 | `calculus/limit-laws` | The Limit Laws | `calculus/idea-of-a-limit` |
| 14 | `calculus/limits-by-substitution` | Limits by Direct Substitution | `calculus/limit-laws` |
| 15 | `calculus/indeterminate-limits` | Limits of the Form 0/0 (Factoring) | `calculus/limits-by-substitution` |
| 16 | `calculus/continuity-at-a-point` | Continuity at a Point | `calculus/limits-by-substitution`, `calculus/when-limits-fail` |

## Stage D — Defining the derivative

| # | id | Title | Prerequisites |
|---|---|---|---|
| 17 | `calculus/the-tangent-line` | The Tangent Line Problem | `calculus/the-difference-quotient`, `calculus/idea-of-a-limit` |
| 18 | `calculus/derivative-at-a-point` | The Derivative at a Point | `calculus/the-tangent-line`, `calculus/limits-by-substitution` |
| 19 | `calculus/the-derivative-function` | The Derivative as a Function | `calculus/derivative-at-a-point` |
| 20 | `calculus/derivative-notation` | Derivative Notation | `calculus/the-derivative-function` |
| 21 | `calculus/differentiability` | Differentiability and Continuity | `calculus/the-derivative-function`, `calculus/continuity-at-a-point` |

## Stage E — Building the rules, one power at a time

| # | id | Title | Prerequisites |
|---|---|---|---|
| 22 | `calculus/derivative-of-a-constant` | Derivative of a Constant | `calculus/the-derivative-function` |
| 23 | `calculus/derivative-of-x` | Derivative of $y = x$ | `calculus/derivative-of-a-constant` |
| 24 | `calculus/derivative-of-x-squared` | Derivative of $y = x^2$ | `calculus/derivative-of-x` |
| 25 | `calculus/derivative-of-x-cubed` | Derivative of $y = x^3$ | `calculus/derivative-of-x-squared` |
| 26 | `calculus/the-power-rule` | The Power Rule ($y = x^n$) | `calculus/derivative-of-x-cubed` |
| 27 | `calculus/constant-multiple-rule` | The Constant-Multiple Rule | `calculus/the-power-rule` |
| 28 | `calculus/sum-and-difference-rule` | The Sum and Difference Rule | `calculus/constant-multiple-rule` |
| 29 | `calculus/derivatives-of-polynomials` | Derivatives of Polynomials | `calculus/sum-and-difference-rule` |
| 30 | `calculus/the-product-rule` | The Product Rule | `calculus/derivatives-of-polynomials` |
| 31 | `calculus/the-quotient-rule` | The Quotient Rule | `calculus/the-product-rule` |
| 32 | `calculus/the-chain-rule` | The Chain Rule | `calculus/the-power-rule`, `calculus/derivatives-of-polynomials` |

## Stage F — Applying the derivative

| # | id | Title | Prerequisites |
|---|---|---|---|
| 33 | `calculus/higher-order-derivatives` | Higher-Order Derivatives | `calculus/derivatives-of-polynomials` |
| 34 | `calculus/increasing-and-decreasing` | Increasing and Decreasing Functions | `calculus/derivatives-of-polynomials` |
| 35 | `calculus/critical-points` | Critical Points | `calculus/increasing-and-decreasing` |
| 36 | `calculus/local-extrema` | Local Maxima and Minima | `calculus/critical-points` |
| 37 | `calculus/concavity` | Concavity and the Second Derivative | `calculus/higher-order-derivatives`, `calculus/critical-points` |
| 38 | `calculus/curve-sketching` | Curve Sketching | `calculus/concavity`, `calculus/local-extrema` |
| 39 | `calculus/optimization` | Optimization Problems | `calculus/local-extrema` |
| 40 | `calculus/related-rates` | Related Rates | `calculus/the-chain-rule` |

## Future (out of scope)

- **Rooting:** wire `calculus/what-is-a-function` onto algebra (a future linear-equations /
  exponents concept and `algebra/multiplying-polynomials`) and assign `declaredLevel`s.
- **Integration:** Riemann sums → the definite integral → the Fundamental Theorem of
  Calculus → techniques of integration, extending the spine past #40.
