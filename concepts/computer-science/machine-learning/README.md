# Machine Learning — curriculum roadmap

The planned authoring sequence for the machine-learning branch. **Documentation only** — the
graph build scans `*.html`, so this file does not affect the tree.

## Design principles

- **One small idea per page**, built up slowly: a line through data → the error it makes → rolling
  downhill to shrink that error → doing it with many features → classification → trees → neural
  networks → unsupervised learning.
- **Intuition first, then the maths.** Every idea is a picture you can play with (a line you fit, a
  cost bowl you roll down, a boundary that splits two clouds, a neuron that fires) before any
  formula. Full house style: each page is prose + LaTeX + an interactive + a quiz.
- **Built on the maths already in the Primer.** ML genuinely *uses* the linear-algebra branch, so the
  hard prerequisites below point into it; softer "see also" links point at calculus and probability.
- **Rooted under computer science.** The hub (`computer-science/machine-learning/machine-learning`)
  is reached from the CS hub's "where to climb in" card and from the maths/linear-algebra hub.
- **≤3 hard prerequisites per page.** Chain page-to-page; use `<primer-ref soft>` for cross-links.

## Cross-discipline prerequisites (the reason linear algebra came first)

| ML page | hard prerequisite |
|---|---|
| `linear-regression/multiple-features` | `mathematics/linear-algebra/vectors/the-dot-product` |
| `neural-networks/the-neuron` | `mathematics/linear-algebra/vectors/the-dot-product` |
| `neural-networks/a-layer-of-neurons` | `mathematics/linear-algebra/matrices/matrix-times-vector` |
| `neural-networks/forward-propagation` | `mathematics/linear-algebra/matrices/matrix-multiplication` |
| `neural-networks/backpropagation` | `mathematics/calculus/rules/the-chain-rule` |
| `unsupervised/principal-component-analysis` | `mathematics/linear-algebra/eigen/eigenvectors-and-eigenvalues` |

## Stage A — Foundations (`foundations/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 1 | `…/foundations/what-is-machine-learning` | What Is Machine Learning? | `…/machine-learning` |
| 2 | `…/foundations/supervised-vs-unsupervised` | Supervised vs Unsupervised | `…/what-is-machine-learning` |
| 3 | `…/foundations/features-and-labels` | Features and Labels | `…/supervised-vs-unsupervised` |
| 4 | `…/foundations/the-feature-vector` | The Feature Vector | `…/features-and-labels` (soft← LA vectors) |
| 5 | `…/foundations/the-training-loop` | The Training Loop | `…/the-feature-vector` |
| 6 | `…/foundations/the-dataset` | The Dataset: Train and Test | `…/the-training-loop` |
| 7 | `…/foundations/generalization` | Generalization | `…/the-dataset` |

## Stage B — Linear regression (`linear-regression/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 8 | `…/linear-regression/linear-regression` | Fitting a Line | `…/foundations/generalization` |
| 9 | `…/linear-regression/the-hypothesis-function` | The Hypothesis Function | `…/linear-regression` |
| 10 | `…/linear-regression/the-cost-function` | The Cost Function | `…/the-hypothesis-function` |
| 11 | `…/linear-regression/visualizing-the-cost` | Visualizing the Cost | `…/the-cost-function` |
| 12 | `…/linear-regression/gradient-descent` | Gradient Descent | `…/visualizing-the-cost` (soft← calculus slope) |
| 13 | `…/linear-regression/the-learning-rate` | The Learning Rate | `…/gradient-descent` |
| 14 | `…/linear-regression/multiple-features` | Multiple Features | `…/the-hypothesis-function`, LA dot-product |
| 15 | `…/linear-regression/the-normal-equation` | The Normal Equation | `…/multiple-features` (soft← LA inverse) |
| 16 | `…/linear-regression/feature-scaling` | Feature Scaling | `…/gradient-descent` |

## Stage C — Classification (`classification/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 17 | `…/classification/classification` | Classification | `…/linear-regression/linear-regression` |
| 18 | `…/classification/the-sigmoid-function` | The Sigmoid Function | `…/classification` |
| 19 | `…/classification/logistic-regression` | Logistic Regression | `…/the-sigmoid-function`, `…/linear-regression/gradient-descent` |
| 20 | `…/classification/the-decision-boundary` | The Decision Boundary | `…/logistic-regression` (soft← LA) |
| 21 | `…/classification/cross-entropy-loss` | Cross-Entropy Loss | `…/logistic-regression` |
| 22 | `…/classification/k-nearest-neighbours` | k-Nearest Neighbours | `…/classification` (soft← LA magnitude) |
| 23 | `…/classification/multiclass-classification` | Multiclass Classification | `…/logistic-regression` |

## Stage D — Trees & ensembles (`trees/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 24 | `…/trees/decision-trees` | Decision Trees | `…/classification/classification` |
| 25 | `…/trees/entropy-and-information-gain` | Entropy and Information Gain | `…/decision-trees` |
| 26 | `…/trees/overfitting-a-tree` | Overfitting a Tree | `…/entropy-and-information-gain` |
| 27 | `…/trees/random-forests` | Random Forests | `…/overfitting-a-tree` |

## Stage E — Fitting & evaluation (`evaluation/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 28 | `…/evaluation/overfitting-and-underfitting` | Overfitting and Underfitting | `…/foundations/generalization` |
| 29 | `…/evaluation/the-bias-variance-tradeoff` | The Bias–Variance Tradeoff | `…/overfitting-and-underfitting` |
| 30 | `…/evaluation/regularization` | Regularization | `…/overfitting-and-underfitting` (soft← LA norm) |
| 31 | `…/evaluation/train-validation-test` | Train, Validation, Test | `…/overfitting-and-underfitting` |
| 32 | `…/evaluation/evaluation-metrics` | Accuracy, Precision, Recall | `…/train-validation-test` |

## Stage F — Neural networks (`neural-networks/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 33 | `…/neural-networks/the-neuron` | The Neuron | `…/classification/logistic-regression`, LA dot-product |
| 34 | `…/neural-networks/activation-functions` | Activation Functions | `…/the-neuron` |
| 35 | `…/neural-networks/a-layer-of-neurons` | A Layer of Neurons | `…/the-neuron`, LA matrix-times-vector |
| 36 | `…/neural-networks/neural-networks` | Stacking Layers | `…/a-layer-of-neurons`, `…/activation-functions` |
| 37 | `…/neural-networks/forward-propagation` | Forward Propagation | `…/neural-networks`, LA matrix-multiplication |
| 38 | `…/neural-networks/the-loss-landscape` | The Loss Landscape | `…/forward-propagation` |
| 39 | `…/neural-networks/backpropagation` | Backpropagation | `…/the-loss-landscape`, calculus chain-rule |
| 40 | `…/neural-networks/training-a-network` | Training a Network | `…/backpropagation`, `…/linear-regression/the-learning-rate` |
| 41 | `…/neural-networks/why-deep` | Why Go Deep? | `…/training-a-network` |

## Stage G — Unsupervised learning (`unsupervised/`)

| # | id | Title | Prerequisites |
|---|---|---|---|
| 42 | `…/unsupervised/clustering` | Clustering | `…/foundations/supervised-vs-unsupervised` |
| 43 | `…/unsupervised/k-means` | k-Means | `…/clustering` (soft← LA magnitude) |
| 44 | `…/unsupervised/dimensionality-reduction` | Dimensionality Reduction | `…/k-means` |
| 45 | `…/unsupervised/principal-component-analysis` | Principal Component Analysis | `…/dimensionality-reduction`, LA eigenvectors |

## Future (out of scope for now)

- Support vector machines and the kernel trick; convolutional and recurrent networks; transformers
  and attention; reinforcement learning; probabilistic models and Bayesian inference.
