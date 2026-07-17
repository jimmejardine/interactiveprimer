# src/geometry-engine/ — the theorem engine behind `<primer-geometry-problem>`

A pure, unit-tested forward-chaining engine that generates "apply-the-theorem" practice problems:
`scaffolds.ts` builds a random, consistent figure (named points, ground-truth integer angles),
`rules.ts` is the theorem catalog (each expressed as a tagged linear relation over angles),
`chain.ts` forward-chains the allowed rules from the givens, `generate.ts` picks a target + givens
whose closure reaches it in a bounded number of steps, and `learned.ts` gates the theorem pool by
the page's prerequisite closure (a problem may only use theorems the learner has already met).
No DOM — the component (`../components/primer-geometry-problem.ts`) renders what this produces.
Tested by `test/geometry-engine.test.ts`.
