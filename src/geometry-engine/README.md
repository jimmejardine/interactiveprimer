# src/geometry-engine/ — the theorem engine behind `<primer-geometry-problem>`

A pure, unit-tested forward-chaining engine that generates "apply-the-theorem" practice problems:
`scaffolds.ts` builds a random, consistent figure (named points, ground-truth integer angles) and
declares which catalog rules it can exercise, `rules.ts` is the theorem catalog (each a tagged
linear relation over angles), `chain.ts` forward-chains the allowed rules from the givens,
`generate.ts` picks a scaffold + target + givens whose closure reaches the target in a bounded
number of steps (and can **require** that a named rule appear in the chain), and `learned.ts`
gates the theorem pool by the page's prerequisite closure — or by an explicit `theorems` list of
rule keys. Authors can omit `scaffolds` and let the builder auto-pick a figure whose `uses` fit
the allowed pool.
No DOM — the component (`../components/primer-geometry-problem.ts`) renders what this produces.
Tested by `test/geometry-engine.test.ts`.
