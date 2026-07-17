# Interactive Primer - [interactiveprimer.com](https://interactiveprimer.com)

## Overview

The Interactive Primer is an open-source collection of "smart web pages" that teach the whole of
**mathematics, physics and computer science, from age 5 to 105**. It begins with the simplest
age-appropriate ideas and climbs a tree of knowledge toward the most advanced topics imaginable (well
beyond PhD level), letting each learner go as far as their curiosity takes them. Concepts can be
followed freely or along **school-syllabus course paths** (e.g. UK Key Stages / GCSE / A-level, US
Common Core & CSTA/AP). The Primer tracks your progress — through "self-attested" confidence on each
concept, and randomised quiz pages that never run out of questions.

The project takes its spirit from the "Young Lady's Illustrated Primer" of Neal Stephenson's *The
Diamond Age*: a patient, adaptive tutor that meets each learner where they are and carries them as far
as their curiosity will go.

## The tree of knowledge

Every concept the Primer teaches lives in one **tree**. From the root it subdivides indefinitely — the
simplest ideas at the bottom, ever broader and deeper understanding above. A concept depends not only on
its parent branch but on any other concept it needs first, so branches point across the tree; that makes
the structure, technically, a Directed Acyclic Graph — but "DAG" is jargon, so we just call it the
**tree**.

**Every concept page lists its prerequisites** — the pages that should be understood before it. They
come from two places, unioned together: the explicit list in the page's metadata, and every concept it
links to inline with `<primer-ref>` in the lesson copy (each such link is, by definition, a backward
dependency — so a prerequisite named in the prose needn't be repeated in the metadata).

## The levels of knowledge

Every concept also has a **level** — a *real number* that roughly tracks how far up the tree it sits
(low for the earliest ideas, high for the most advanced; fractional values are allowed, e.g. 2.5, to
squeeze a concept in between two others). Levels **start at 0** and a page needn't declare one. But when
a page **does** declare a level it flows downstream: a concept's level is `max(its declared level, the
level of every prerequisite)`. So a handful of deliberately levelled "milestone" concepts gives the
whole tree a sense of altitude without hand-labelling every page. Before starting a given level, a
learner should be comfortable with the levels below it.

A concept is identified by its **full path** in the tree (e.g. `arithmetic/addition`) — which is also
where its page lives under `concepts/`, and how prerequisites reference it.

## Technology

Each "smart web page" is a plain `.html` file — **content has no build step** (edit → refresh). The
framework it loads is TypeScript in [`src/`](src/), bundled by esbuild (`npm run build`) into
content-hashed, code-split modules under `/dist/`.

- **One include per page.** A page adds a single `<script src="/js/boot.js"></script>` — a tiny
  loader generated from [`src/boot.ts`](src/boot.ts) with the current bundle hash stamped in. It
  applies theme/locale before first paint, injects the CSS and a one-entry ESM **import map**
  (`"primer"` → the hashed bundle), and boots the renderer; heavy libraries load as separate lazy
  chunks on first use. See [`docs/import-map.md`](docs/import-map.md) for the toolchain detail.
- **Libraries** (all pre-built ESM): **[KaTeX](https://katex.org/)** typesets mathematics;
  **[JSXGraph](https://jsxgraph.org/)** draws the interactive charts and geometry figures that carry most
  pages' visuals; **[manim-web](https://github.com/maloyan/manim-web)** renders animations; and
  programming pages run editable **TypeScript** in a sandbox (transpiled with sucrase, executed in
  QuickJS-WASM — no build, no server).
- **Web Components** ([`src/components/`](src/components/), all registered by
  [`src/primer.ts`](src/primer.ts)) give every page a consistent look. Authors write content as
  `<primer-card>`s using `<primer-math>`, `<primer-geometry>` / `<primer-chart>` (figures & plots),
  `<primer-code>` (highlighted TypeScript, optionally runnable), `<primer-manim>`, `<primer-vignette>`
  (collapsible digressions), `<primer-theorem>` (callouts), `<primer-ref>` (concept links), and a
  randomised `<primer-quiz>`. The page shell (header, title, confidence control) and the mini-explorer /
  "Up next" recommender are built automatically by [`src/render.ts`](src/render.ts) from the page's
  metadata.
- **Themes** — light, dark, and a playful **fun** theme for kids. A theme is a value of `data-theme` on
  `<html>`; palettes are `--primer-*` token blocks in [`css/primer.css`](css/primer.css), so the whole UI
  re-themes via `var(...)`, and every figure re-colours through `themeColors()`. It is applied with no
  flash by [`src/boot.ts`](src/boot.ts), managed by [`src/theme.ts`](src/theme.ts), and switched from a
  top-right hamburger menu.
- **TypeScript throughout** the framework (`src/**/*.ts`, strict): esbuild bundles it for the
  browser, and Node runs the very same sources directly (type stripping) for the tests and repo
  scripts — one codebase, no duplicate builds. `tsc --noEmit` is the correctness gate.
- **Localization**: English is the default and fallback; a lesson can carry per-locale translation
  overlays under `i18n/`, swapped in at load time.
- A concept's **id** is its file path under `concepts/` (minus `.html`) and its **title** is a
  `<primer-title>` element; the remaining graph data (prerequisites, declared level, optional curation
  dates) is an inline `<script class="concept-meta">` JSON block after `</html>` — the language-neutral
  machinery, separated from the translatable body. The knowledge-tree logic (prerequisite resolution +
  downstream **level propagation**) lives in [`src/graph.ts`](src/graph.ts) / [`src/levels.ts`](src/levels.ts),
  and quiz generation in [`src/quiz.ts`](src/quiz.ts); all are unit-tested.

### Building & checking

```bash
npm install        # framework dependencies (bundled at build time — no CDN at runtime)
npm run build      # esbuild: src/ → hashed dist/ bundles + generated js/boot.js, js/analytics.js, sw.js
npm run dev        # dev build (unhashed) + static server → http://localhost:8080/
npm run serve      # static file server only (reuse a running one; content edits need no rebuild)
npm test           # node --test — runs the .ts sources directly (type stripping)
npm run typecheck  # tsc -p tsconfig.json — strict type-check
npm run graph      # validate the tree + (re)write dist/graph.json
npm run check      # the full CI gate: typecheck + tests + graph validation + i18n
```

Only **framework** changes need a rebuild — concept pages are served as-is, so authoring stays
edit-and-refresh. Deploys build in CI (see [`docs/deploy.md`](docs/deploy.md)); `dist/`, `js/`, and
`sw.js` are gitignored outputs.

[`scripts/build-graph.js`](scripts/build-graph.js) walks every concept page, validates the tree, computes
each concept's level, and emits `dist/graph.json` for the knowledge explorer. It **exits non-zero on any
error** — dangling or cyclic prerequisites, an **orphan** not reachable from the single `root` page, or a
missing root — so it gates CI (with warnings for a declared level below a prerequisite, or none in a
concept's ancestry).

**Authoring a new concept is just adding an `.html` page** under `concepts/` — its id is its path, its
title goes in a `<primer-title>`, and it should teach its one idea *richly* at the right age level. See
[`CLAUDE.md`](CLAUDE.md) for the authoring guide, and
[`docs/authoring-reference.md`](docs/authoring-reference.md) for the full element/API reference.

## License

The Interactive Primer is a free knowledge commons — copyleft, so it stays free for everyone. It is
licensed in two complementary parts:

- **Code** — the framework (`src/`, `css/`, `scripts/`, `index.html`, and root config) is licensed
  under the **GNU Affero General Public License v3.0-or-later** (see [`LICENSE`](LICENSE)). Anyone
  may use, study, modify, and redistribute it; any modified version — **including one merely run on
  a server** — must make its source available under the same terms.
- **Content** — the lessons (`concepts/`, `i18n/`, and the generated `dist/graph.json`) are licensed
  under **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)** (see
  [`LICENSE-CONTENT.md`](LICENSE-CONTENT.md)). Copy, translate, and remix freely; keep the
  attribution and share derivatives under the same licence.

When reusing the lessons, attribute them as: *"Interactive Primer (interactiveprimer.com),
CC BY-SA 4.0"*. The small inline `<script>` glue inside a lesson page is also offered under the
AGPL as part of the code, so the prose/code boundary within a `concepts/*.html` page is clear.

## Acknowledgements

- https://www.svgrepo.com
- https://openclipart.org — public-domain cartoon art (e.g. the counting frogs)
- https://tenor.com
