# concepts/ — the content: one page per concept

Every lesson is a single hand-authored `.html` file; **the file path (minus `.html`) is the
concept's id** (`mathematics/algebra/algebra.html` → id `mathematics/algebra`). Pages need **no
build step** — edit, refresh. Each page declares its `prerequisites` (the DAG edges) in an inline
`concept-meta` JSON block; together the pages form the tree of knowledge that `npm run graph`
validates and emits as `dist/graph.json`.

Conventions (full authoring guide: `/CLAUDE.md`, deep reference: `/docs/authoring-reference.md`):

- A folder's landing page is named after the folder (`calculus/calculus.html`) — that page IS the
  folder's explanation, which is why the topic folders carry no READMEs.
- A page teaches exactly one idea, richly: hook, multiple representations, worked examples,
  vignettes, a visual, a randomised quiz.
- `course: true` pages are curated paths whose members are harvested from their `<primer-ref>`s.
- `people/<surname>.html` are biographies.

Content here is CC BY-SA 4.0 (see the root README's licence section).
