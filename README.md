# Interactive Primer - interactiveprimer.com

## Overview

Welcome to the Interactive Primer. It is an open-source collection of "smart web
pages" that teaches the entirety of mathematics, physics and computer science from
the age of 3 to 103. It starts with age-appropriate concepts, slowly working through
a tree of knowledge of increasingly difficult ideas. For the keenest of learners it
will cover the most advanced topics in these three subjects (beyond PhD level). The
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
already be understood.

## The levels of knowledge

As one rises higher up the tree, sub-branches might rely on entire collections of other
sub-branches. To keep this navigable, a concept page **may** state the "level" it belongs
to. A level roughly equates to a stage of education — an early school-age band, a later
school-age band, an undergraduate university level, and so on up to the most advanced
research-level material.

A page is not required to declare a level. But when a page **does** declare one, that
level flows downstream through the tree: every later concept that depends on it (directly
or indirectly) is implicitly elevated to at least that level. In this way a handful of
deliberately levelled "milestone" concepts is enough to give the whole tree a sense of
altitude, without having to label every single page by hand.

Levels give learners that sense of altitude: before starting concepts at a given level,
one should be comfortable with the concepts of the levels below it.

## Technology

Each "smart web page" is a plain `.html` file that pulls in everything it needs at load
time — **there is no build step**. The toolchain:

- **Native ES modules + import maps** load dependencies straight from a CDN. See
  [`docs/import-map.md`](docs/import-map.md) for the block every page includes.
- **[KaTeX](https://katex.org/)** typesets mathematics; **[manim-web](https://github.com/maloyan/manim-web)**
  (a TypeScript port of Manim) renders animations. Both are imported as pre-built ESM.
- **Web Components** in [`js/components/`](js/components/) give every page a consistent
  look-and-feel: `<primer-page>`, `<primer-concept>`, `<primer-math>`, `<primer-manim>`,
  and `<primer-quiz>`. They are registered by importing the single [`js/primer.js`](js/primer.js)
  module.
- **Typed JavaScript + JSDoc** (no `.ts` authoring). Code runs raw in the browser and in
  Node, yet is fully type-checked by `tsc` against the libraries' own type definitions.
- The knowledge-tree logic — prerequisite resolution and downstream **level propagation** —
  lives in [`js/graph.js`](js/graph.js) and [`js/levels.js`](js/levels.js); quiz generation
  in [`js/quiz.js`](js/quiz.js). All are unit-tested.

### Developing

```bash
npm install        # dev-only: TypeScript + library type definitions
npm test           # node --test — pure logic, no transpile
npm run typecheck  # tsc -p jsconfig.json — type-check the JSDoc-typed JS
npm run serve      # static file server; open /index.html
```

Type-checking and tests need no compilation; they are *checks*, not a build. Authoring a
new concept is just adding an `.html` page (copy `concepts/counting.html`) plus an optional
`*.quiz.json` bank.
