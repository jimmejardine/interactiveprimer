# Linear Algebra — curriculum roadmap

The planned authoring sequence for the linear-algebra branch. **Documentation only** — the
graph build scans `*.html`, so this file does not affect the tree.

## Design principles

- **One small idea per page.** Concepts are atomic and build up slowly — a vector is a list of
  numbers *before* it is an arrow; a matrix acts on a vector *before* it multiplies another matrix;
  a transformation warps the grid *before* the determinant measures how much.
- **Geometry first, algebra second.** Almost every idea is shown as a picture (an arrow, a warped
  grid, a stretched eigen-direction) and *then* written in symbols. Full house style: each page
  carries an interactive (a JSXGraph chart/geometry scene or a manim animation) plus a quiz.
- **Rooted into mathematics.** The hub (`linear-algebra/linear-algebra`) has prerequisite
  `mathematics/mathematics` and is reached from the maths hub's "where to climb in" card. The first
  vectors page assumes the coordinate plane (`mathematics/calculus/functions/the-coordinate-plane`).
- **≤3 hard prerequisites per page.** Chain page-to-page; use `<primer-ref soft>` for "see also".
- **Built for machine learning.** The branch deliberately reaches eigenvectors / SVD, because the
  ML curriculum (`computer-science/machine-learning`) hard-depends on the dot product, matrix×vector,
  matrix multiplication and eigenvectors.

Each page lives at `concepts/<id>.html` (the `id` equals the path under `concepts/`), kebab-case.

## Stage A — Vectors (`vectors/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 1 | `…/vectors/what-is-a-vector` | What Is a Vector? | `linear-algebra/linear-algebra` |
| 2 | `…/vectors/vectors-as-coordinates` | Vectors as Coordinates | `…/what-is-a-vector` |
| 3 | `…/vectors/vector-addition` | Adding Vectors | `…/vectors-as-coordinates` |
| 4 | `…/vectors/vector-subtraction` | Subtracting Vectors | `…/vector-addition` |
| 5 | `…/vectors/scalar-multiplication` | Scaling a Vector | `…/vectors-as-coordinates` |
| 6 | `…/vectors/linear-combinations` | Linear Combinations | `…/vector-addition`, `…/scalar-multiplication` |
| 7 | `…/vectors/magnitude-of-a-vector` | The Length of a Vector | `…/vectors-as-coordinates` |
| 8 | `…/vectors/unit-vectors` | Unit Vectors | `…/magnitude-of-a-vector`, `…/scalar-multiplication` |
| 9 | `…/vectors/the-dot-product` | The Dot Product | `…/linear-combinations` |
| 10 | `…/vectors/dot-product-and-angle` | The Dot Product and Angle | `…/the-dot-product`, `…/magnitude-of-a-vector` |
| 11 | `…/vectors/orthogonality` | Orthogonal Vectors | `…/dot-product-and-angle` |
| 12 | `…/vectors/projection` | Projecting One Vector onto Another | `…/dot-product-and-angle`, `…/unit-vectors` |

## Stage B — Vector spaces (`spaces/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 13 | `…/spaces/span` | Span | `…/vectors/linear-combinations` |
| 14 | `…/spaces/linear-independence` | Linear Independence | `…/span` |
| 15 | `…/spaces/basis-and-dimension` | Basis and Dimension | `…/linear-independence` |
| 16 | `…/spaces/coordinates-in-a-basis` | Coordinates in a Basis | `…/basis-and-dimension` |
| 17 | `…/spaces/vectors-in-3d` | Vectors in 3D | `…/vectors/the-dot-product` |

## Stage C — Matrices (`matrices/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 18 | `…/matrices/what-is-a-matrix` | What Is a Matrix? | `…/spaces/basis-and-dimension` |
| 19 | `…/matrices/matrix-addition` | Adding Matrices | `…/what-is-a-matrix` |
| 20 | `…/matrices/the-transpose` | The Transpose | `…/what-is-a-matrix` |
| 21 | `…/matrices/matrix-times-vector` | A Matrix Times a Vector | `…/what-is-a-matrix`, `…/vectors/linear-combinations` |
| 22 | `…/matrices/matrix-multiplication` | Multiplying Matrices | `…/matrix-times-vector` |
| 23 | `…/matrices/properties-of-matrix-multiplication` | How Matrix Products Behave | `…/matrix-multiplication` |
| 24 | `…/matrices/the-identity-matrix` | The Identity Matrix | `…/matrix-times-vector` |
| 25 | `…/matrices/special-matrices` | Diagonal and Symmetric Matrices | `…/the-identity-matrix`, `…/the-transpose` |

## Stage D — Linear transformations (`transformations/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 26 | `…/transformations/linear-transformations` | Linear Transformations | `…/matrices/matrix-times-vector` |
| 27 | `…/transformations/transformations-as-matrices` | Transformations Are Matrices | `…/linear-transformations` |
| 28 | `…/transformations/scaling-and-reflection` | Scaling and Reflection | `…/transformations-as-matrices` |
| 29 | `…/transformations/rotation-matrices` | Rotation Matrices | `…/transformations-as-matrices` |
| 30 | `…/transformations/shears` | Shears | `…/transformations-as-matrices` |
| 31 | `…/transformations/composing-transformations` | Composing Transformations | `…/rotation-matrices`, `…/matrices/matrix-multiplication` |
| 32 | `…/transformations/the-determinant` | The Determinant | `…/scaling-and-reflection` |
| 33 | `…/transformations/determinant-and-invertibility` | When a Matrix Collapses Space | `…/the-determinant` |
| 34 | `…/transformations/the-inverse-matrix` | The Inverse Matrix | `…/determinant-and-invertibility`, `…/composing-transformations` |
| 35 | `…/transformations/computing-the-inverse-2x2` | Computing a 2×2 Inverse | `…/the-inverse-matrix` |

## Stage E — Linear systems (`linear-systems/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 36 | `…/linear-systems/systems-of-linear-equations` | Systems of Linear Equations | `…/transformations/linear-transformations` |
| 37 | `…/linear-systems/matrix-form-of-a-system` | Writing a System as Ax = b | `…/systems-of-linear-equations`, `…/matrices/matrix-times-vector` |
| 38 | `…/linear-systems/row-operations` | Row Operations | `…/matrix-form-of-a-system` |
| 39 | `…/linear-systems/gaussian-elimination` | Gaussian Elimination | `…/row-operations` |
| 40 | `…/linear-systems/solving-with-the-inverse` | Solving with the Inverse | `…/matrix-form-of-a-system`, `…/transformations/computing-the-inverse-2x2` |
| 41 | `…/linear-systems/rank-and-solvability` | Rank and How Many Solutions | `…/gaussian-elimination` |

## Stage F — Eigen & decomposition (`eigen/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 42 | `…/eigen/eigenvectors-and-eigenvalues` | Eigenvectors and Eigenvalues | `…/transformations/transformations-as-matrices`, `…/matrices/matrix-times-vector` |
| 43 | `…/eigen/the-characteristic-equation` | The Characteristic Equation | `…/eigenvectors-and-eigenvalues`, `…/transformations/the-determinant` |
| 44 | `…/eigen/finding-eigenvectors` | Finding Eigenvectors | `…/the-characteristic-equation`, `…/linear-systems/gaussian-elimination` |
| 45 | `…/eigen/diagonalization` | Diagonalization | `…/finding-eigenvectors`, `…/matrices/matrix-multiplication` |
| 46 | `…/eigen/symmetric-matrices-and-orthogonal-eigenvectors` | Symmetric Matrices | `…/diagonalization`, `…/matrices/special-matrices` |
| 47 | `…/eigen/the-singular-value-decomposition` | The Singular Value Decomposition | `…/symmetric-matrices-and-orthogonal-eigenvectors` |

## Future (out of scope for now)

- Determinants and inverses beyond 2×2/3×3 (cofactors, LU); abstract vector spaces and linear maps;
  inner-product spaces and Gram–Schmidt in full generality; the spectral theorem with proof.
