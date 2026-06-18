# Interactive Primer - interactiveprimer.com

## Overview

Welcome to the Interactive Primer. It is an open-source collection of "smart web
pages" that teach the whole of human knowledge from the age of 5 to 105. It starts
with age-appropriate concepts, slowly working through a tree of knowledge of
increasingly difficult ideas. For the keenest of learners it will cover the most
advanced topics imaginable (beyond PhD level). The
primer keeps track of your progress, both through "self-attested" confidence on each
concept's page, and via randomly generated "multiple choice test" pages.

The project takes its spirit from the "Young Lady's Illustrated Primer" of Neal
Stephenson's *The Diamond Age*: a patient, adaptive tutor that meets each learner
where they are and carries them as far as their curiosity will go.

## The tree of knowledge

The tree of knowledge describes every single concept that can be learned through the
Interactive Primer. Starting at the root, it subdivides indefinitely into appropriate
sub-branches, beginning with the most simple concepts imaginable. The higher one
ascends the tree, the broader and deeper one's understanding becomes.

Each sub-branch obviously depends on its parent branches, but sub-branches can also
refer to other sub-branches that are necessary prerequisites for their concepts.
Because branches can point across the tree to one another like this, the structure is
— technically — a Directed Acyclic Graph (DAG). But "DAG" is jargon, so throughout the
Primer we simply call it the **tree**.

To make these dependencies concrete, **every concept page lists the nodes it has as
prerequisites**. Before a page's concept can be tackled, its prerequisite pages should
already be understood. A page's prerequisites come from two places, unioned together: the
explicit list in its metadata block, and every concept it links to inline with
`<primer-ref>` in the lesson copy (each such reference is, by definition, a backward
dependency) — so a prerequisite mentioned in the prose needn't be repeated in the metadata.

## The levels of knowledge

As one rises higher up the tree, sub-branches might rely on entire collections of other
sub-branches. To keep this navigable, every concept has a **level** — a *real number*.
It is usually a whole number that roughly tracks how far up the tree a concept sits —
lower numbers for the earliest ideas, higher numbers for the most advanced material — but
fractional values are allowed so a new concept can be squeezed in between two existing
ones (e.g. level 2.5).

Levels **implicitly start at 0** and a page need not declare one. But when a page **does**
declare a level, that level flows downstream through the tree: every later concept that
depends on it (directly or indirectly) is implicitly elevated to at least that level. So a
concept's level is `max(its declared level, the level of every prerequisite)`. In this way
a handful of deliberately levelled "milestone" concepts is enough to give the whole tree a
sense of altitude, without having to label every single page by hand.

Levels give learners that sense of altitude: before starting concepts at a given level,
one should be comfortable with the concepts of the levels below it.

Every concept is identified by its **full path** in the tree (e.g.
`arithmetic/addition`), which is also where its page lives under `concepts/`.
Prerequisites are referenced by these same full-path ids.

## Technology

Each "smart web page" is a plain `.html` file that pulls in everything it needs at load
time — **there is no build step**. The toolchain:

- **One include per page.** A page adds a single `<script src="/js/boot.js"></script>`;
  [`js/boot.js`](js/boot.js) injects the CSS and the **import map** (which loads
  dependencies straight from a CDN) and loads the renderer. See
  [`docs/import-map.md`](docs/import-map.md) for the full authoring template.
- **[KaTeX](https://katex.org/)** typesets mathematical notation; **[manim-web](https://github.com/maloyan/manim-web)**
  (a TypeScript port of Manim) renders animations. Both are imported as pre-built ESM.
- **Web Components** in [`js/components/`](js/components/) give every page a consistent
  look-and-feel. Authors write content as `<primer-card>` cards using `<primer-math>`,
  `<primer-manim>`, and `<primer-quiz>`; the page shell (`<primer-page>` header/footer
  and `<primer-concept>` title + confidence control) is built automatically by
  [`js/render.js`](js/render.js) from the page's metadata block. All elements are
  registered by the single [`js/primer.js`](js/primer.js) module.
- **Themes** — light, dark, and a playful **fun** theme for kids. A theme is a value of
  `data-theme` on `<html>`; palettes are `--primer-*` token blocks in
  [`css/primer.css`](css/primer.css), so the whole UI re-themes via `var(...)`. The theme
  is applied with no flash by [`js/boot.js`](js/boot.js), managed by
  [`js/theme.js`](js/theme.js), and switched from a top-right hamburger menu
  ([`js/components/primer-menu.js`](js/components/primer-menu.js)). Animations read the
  theme's palette via `themeColors()`.
- **Typed JavaScript + JSDoc** (no `.ts` authoring). Code runs raw in the browser and in
  Node, yet is fully type-checked by `tsc` against the libraries' own type definitions.
- The knowledge-tree logic — prerequisite resolution and downstream **level propagation** —
  lives in [`js/graph.js`](js/graph.js) and [`js/levels.js`](js/levels.js); quiz generation
  in [`js/quiz.js`](js/quiz.js). All are unit-tested.
- A concept's **id** is its file path under `concepts/` (minus `.html`) and its **title** is a
  `<primer-title>` element; the remaining graph data (prerequisites, declared level, and optional
  `completedDate` / `needsReviewDate` curation dates) is an inline `<script class="concept-meta">`
  JSON block placed **after `</html>`** (with the page's `<script type="module">` builders) — the
  language-neutral machinery, separated from the translatable body. Both are read by the page's Web
  Components and the graph build script.

### The graph build / validation script

[`scripts/build-graph.js`](scripts/build-graph.js) walks every concept page, validates the
tree, computes each concept's implicit level, and emits `dist/graph.json` for the knowledge
explorer to ingest. It is designed to gate CI: it exits non-zero on any error.

```bash
npm run graph        # validate + write dist/graph.json
npm run check:graph  # validate only, write nothing (use in CI)
```

It reports **errors** (fail the build): dangling prerequisite references, prerequisite **cycles**,
**orphans** (concepts not reachable from **the** root — the single page at path `root`), and a
missing `root` concept — and **warnings**: a declared level below a prerequisite, or a concept with
no declared level anywhere in its ancestry.

### Developing

```bash
npm install        # dev-only: TypeScript + library type definitions
npm test           # node --test — pure logic, no transpile
npm run typecheck  # tsc -p jsconfig.json — type-check the JSDoc-typed JS
npm run check      # typecheck + tests + graph validation (the full CI gate)
npm run serve      # static file server; open /index.html
```

Type-checking, tests and graph validation need no compilation; they are *checks*, not a
build. Authoring a new concept is just adding an `.html` page (copy
`concepts/arithmetic/counting.html`) — its id is simply its path under `concepts/`, and its title
goes in a `<primer-title>`. An optional quiz is authored in JS with `registerQuiz`
and shown via `<primer-quiz name="…">` (see `addition.html`).


## Acknowledgements

- https://www.svgrepo.com
