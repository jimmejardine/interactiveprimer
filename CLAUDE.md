# CLAUDE.md

- **Read `README.md` first** — it defines the vision and the tree/level model.
- **Full API reference** for the rarely-used elements (manim, low-level & 3-D charts, geometry-problem,
  program exercises, video, the geometry toolkit, courses, localization overlays, the a11y checklist,
  helper list) lives in **`docs/authoring-reference.md`** — read it on demand. This file is the lean core.

A page is a single `.html` file under `concepts/`; there is **no build step**.

## Pedagogy: one concept per page — taught thoroughly

A page teaches **exactly one idea** — but **richly and completely**, not briefly. The limit is **one
concept, not one screen**: a good page is as long as it needs to be to make its single idea stick.
**Brevity is not the goal** — a lone sentence + one equation has failed the learner. Explore the idea from
several angles, work examples, take a couple of fun detours, show it moving.

**Split a concept** whenever a page starts carrying **more than one idea** (not merely when it gets long) —
make each part its own page and chain them with `prerequisites`. (The derivative is built power by power: a
constant, then `$x$`, then `$x^2$`, *then* the general rule — each its own page.) Two *different* things =
split; going deep on one thing = correct.

### What a good page contains

**Write for the learner's age and level first.** The language, contexts, examples and quiz should all be
pitched to whoever meets this idea — a six-year-old counting animals vs someone meeting eigenvalues need
entirely different words, situations and numbers.

Then build from the palette below — **select the ingredients that suit *this* idea, and vary the mix and
framing from page to page.** There is no fixed template; leaning on one recipe everywhere makes the Primer
feel uniform and boring. The one firm rule: **a page that is only an intro + a quiz is too thin — go
deeper.** Draw on:

- a **real-world hook** — why this idea matters, in a concrete, age-appropriate situation;
- the idea in **more than one representation** — words, maths, a picture (concrete → pictorial → abstract);
- **worked examples**, step by step, at the right level;
- one or two **`<primer-vignette>` digressions** — a catchy question in the header, a fun answer in the
  reveal: the "why", a scrap of history, a surprising case, a stretch example;
- a **visual aid where it helps** — a `<primer-geometry>` figure, a `<primer-chart>`, or a `<primer-manim>`
  animation; a moving/interactive diagram beats a static one;
- a **misconception "Watch out!" callout** — name a classic mistake and put it right, in a
  **`<primer-vignette title="Watch out!">`** (a collapsible aside). **Do NOT** use `<primer-theorem>` for
  this — the theorem pane is for stating actual theorems/laws only;
- a **randomised `<primer-quiz>`** — variable-driven and age-appropriate, an *"eternal" quiz* (never a fixed
  list of static questions).

## Page skeleton (copy this)

Everything a translator edits is in the `<body>` (above `</html>`) — the title, the prose cards, the
`scene-strings`. All **language-neutral machinery goes _after_ `</html>`**: the `concept-meta` JSON and
every inline `<script type="module">`. Browsers relocate post-`</html>` content into `<body>`, so the
scripts still run and the metadata is still read.

```html
<!doctype html>
<html lang="en">
  <body>
    <!-- 1) The whole toolchain, in one tag. MUST be first in <body>. -->
    <script src="/js/boot.js"></script>

    <!-- 2) The title — its own element (translatable). -->
    <primer-title>Addition</primer-title>

    <!-- 3) Content: one or more cards. The page shell, header and confidence control are built
            automatically — do NOT write <head>, <main>, <primer-page> or <primer-concept>. A
            scene-strings block (if any) sits DIRECTLY BEFORE the card that uses it. -->
    <primer-card>
      <p>Addition combines two amounts …</p>
      <primer-math display>a + b = c</primer-math>
    </primer-card>
  </body>
</html>

<!-- 4) Machinery, AFTER </html>: metadata first, then the module script(s). The id is NOT authored —
        it's this file's path under concepts/ minus ".html". Omit the block if there are no
        prerequisites/level. -->
<script type="application/json" class="concept-meta">
  { "prerequisites": ["arithmetic/counting"] }
</script>
```

## concept-meta fields

No `id` (it's the file path minus `.html`) and no `title` (that's the `<primer-title>` element). A page with
no prerequisites/level may omit the whole block. Inline JSON blocks are **JSON5** (`//` comments + trailing
commas OK).

| Field | Required | Notes |
|---|---|---|
| `prerequisites` | no (default `[]`) | Array of full-path ids (the DAG edges). The final edge set is the **union of this list and the inline `<primer-ref>`s** in the prose. The tree has one root, `root`; every concept reaches it through prerequisites. A base concept may omit `prerequisites` (or the whole block) — it auto-attaches to the `orphans` node. |
| `declaredLevel` | no | Real number. Levels start at 0 and propagate downstream via `max(declared, all prerequisite levels)`. Fractions allowed. |
| `completedDate` | no | ISO date `YYYY-MM-DD` — when the lesson content was finished. Omit on stubs. |
| `needsReviewDate` | no | ISO date — when this concept was flagged as needing review. |
| `course` | no | Boolean. `true` marks this page as a **course** (see courses in the reference doc). |

## Authoring elements (inside `<primer-card>`)

- **`<primer-card>`** — top-level content block; one or more per page.
- **`<primer-vignette title="catchy question">…</primer-vignette>`** — a **collapsible digression** (native
  `<details>`, starts collapsed). The `title` is the hook shown closed (phrase as an intriguing question);
  the body (prose, `<primer-math>`, `<img>`, a slotted diagram) is the reveal. **This is also the "Watch
  out!" misconception box** — `title="Watch out!"`.
- **`<primer-theorem name="…">…</primer-theorem>`** — a callout for **stating a theorem/law/definition**
  only (eyebrow reads "Theorem — {name}"). **Not** a warning box (use a vignette for that). Multiple claims
  → **bullets**, not a run-on sentence.
- **`<primer-math>`** — LaTeX; body text is the source. Inline by default, block with `display`:
  `<primer-math display>\int_0^1 x\,dx</primer-math>`.
- **`<primer-code lang="typescript">…</primer-code>`** — a themed, lightly highlighted **code block**. The
  element's **text content** is the source (leading/trailing blank lines dropped, common indent stripped).
  `lang`: `typescript`/`ts` (default) · `javascript`/`js` · `python` · `sql` · `text`. **Write every code
  example in TypeScript** (a superset of JS — beginner examples are untyped TS; add `: number`, `interface`,
  `class` with `private`/`readonly`, `enum`, generics as OOP/FP arrives; avoid `const enum`/`namespace`).
  **Escape `<` `>` `&` in the body** as `&lt;` `&gt;` `&amp;` — e.g. `if (x &lt; 10)`. For a short literal
  in prose use plain inline `<code>`.
  - **Runnable — add `run`** (`<primer-code run>`): the block gains **Code**/**Output** tabs, an editable
    code pane (line-number gutter, Reset button), and a **Run ▶** that transpiles the TS and runs the JS in
    a sandboxed **QuickJS-WASM** engine (no DOM/network — **`console.log` is what shows**; a ~1 s timeout
    kills infinite loops). Add `run` only to **complete, output-producing** examples; leave fragments
    non-run.
- **`<primer-ref to="full/path/id">words</primer-ref>`** — an inline link to **another concept** (empty body
  → auto-fills the target's title). **Every `<primer-ref>` also declares a prerequisite** (harvested into
  this page's `prerequisites`), so it must point **backward** to a concept this page builds on (a wrong-way
  ref makes a cycle). Variants:
  - **`forward`** (`<primer-ref forward to="…">`) — mention a *later* concept; **reverses** the edge (this
    page becomes the target's prerequisite). Fails the build if the id is unknown.
  - **`soft`** (`<primer-ref soft to="…">`) — an incidental "see also" with **no** learning dependency;
    harvests **no edge** (but still fails the build if the id names no concept). Used for course members.
  - **`todo`** (`<primer-ref todo to="…">`) — a concept you intend to write but haven't; **no edge, never
    validated** (the `to` is just a label), renders as a muted "todo" chip. It's the **`todo` attribute**
    that does this — a plain `<primer-ref to="todo/foo">` is an ordinary backward ref and fails as dangling.
- **Other elements** (see `docs/authoring-reference.md`): `<primer-manim>` (animations), `<primer-video>`,
  `<primer-chart-3d>`, `<primer-geometry-problem>` (interactive theorem practice), `<primer-program>`
  (write-a-program exercises).

The **confidence control** (0–10 star rating) is added to every page automatically — do not author it.

## The colour rule (all scenes/charts/geometry)

**NEVER pick your own colours — always use the theme.** Every scene/chart/geometry colour comes from
`const colors = themeColors()` (imported from `primer`): `{ bg, ink, line, cat }` — `bg` backdrop, `ink`
labels/text, `line` axes/strokes, and `cat` an **ordered categorical palette** (take `cat[0]`, `cat[1]`, …
in order so all diagrams share colours). Do **not** hardcode hex/`hsl`/`rgb` or use library named colours
(manim's `BLUE`/`RED`, etc.), and no `|| BLUE` fallbacks. In JSXGraph, text is coloured via `strokeColor`.
This keeps every diagram on-theme and re-themes on a theme change. Give **every** mobject/element an
explicit theme colour (defaults are white and vanish on light themes).

## Geometry diagrams (`registerGeometryScene`) — the workhorse visual

For **figures** (lines, angles, polygons, Greek labels) register a geometry scene and reference it from a
**`<primer-geometry scene="name">`**. The board is **equal-aspect, grid-less, axis-less, read-only** by
default. A diagram is a **timeline of waypoints**: draw base content up front; each `step(caption, fn)` tags
the elements `fn` creates, which the learner reveals forwards/backwards. Elements outside any `step()` are
always-visible base content.

```html
<primer-geometry scene="rightTriangle"></primer-geometry>

<script type="application/json" class="scene-strings">
  { "rightTriangle": { "title": "Right triangle", "tri": "A right triangle", "ra": "The right angle" } }
</script>

<script type="module">
  import { registerGeometryScene, makeStrings } from "primer";
  registerGeometryScene("rightTriangle", ({ board, colors, step, sceneStrings }) => {
    const A = board.create("point", [0, 0], { fixed: true, name: "A", color: colors.ink });
    const B = board.create("point", [4, 0], { fixed: true, name: "B", color: colors.ink });
    const C = board.create("point", [0, 3], { fixed: true, name: "C", color: colors.ink });
    step(sceneStrings("tri"), () => board.create("polygon", [A, B, C], { strokeColor: colors.line, fillOpacity: 0 }));
    step(sceneStrings("ra"),  () => board.create("angle", [B, A, C], { orthoType: "square", strokeColor: colors.line }));
  }, { boundingbox: [-1, 4, 5, -1], title: () => makeStrings("rightTriangle")("title") });
</script>
```

- **Toolkit** (destructure what you need): `{ board, JXG, step, sliders, colors, sceneStrings, label,
  makeGraph, parallelMark, tickMark, angleMark, rightAngle, extend, crossing, rng }`. `label(at, text, opts)`
  = themed text; `makeGraph(opts?)` draws standard themed Cartesian axes (use it for a function graph, don't
  hand-roll axes); the marker tools (`parallelMark`/`tickMark`/`angleMark`/`rightAngle`/`extend`/`crossing`)
  and `rng` (random scenes) are in `docs/authoring-reference.md`.
- **`opts`**: `{ boundingbox, keepAspect = true, title, sliders, start, stepMs = 450, random = false }`. A
  multi-step figure **opens fully-revealed with a Play button** by default; a zero-`step` figure is static
  (control bar auto-hides). Set `title` as a `() => makeStrings(name)("title")` thunk (defined outside the
  builder). Numbers / Greek / `°` stay literal Unicode.
- **No endpoint dots**: a `segment`/`line`/`arrow` from coordinates hides its endpoint points; add an
  explicit `point` for a visible dot.

## Charts (`registerCharts` + `registerChartSliders`)

For a **function plotted on axes** (SVG, no WebGL cap). `registerCharts(charts, chartOptions, sliders?)`
registers a family sharing one domain+range — no board boilerplate. Markup is an empty
`<primer-chart scene="name"></primer-chart>`.

```html
<primer-chart scene="sinLab"></primer-chart>
<primer-chart-sliders name="wave"></primer-chart-sliders>   <!-- sliders go BELOW the diagram -->

<script type="module">
  import { registerCharts, registerChartSliders } from "primer";
  registerChartSliders("wave", [ { name: "A", label: "Amplitude", min: 0, max: 3, step: 0.1, value: 1 } ]);
  registerCharts(
    [{ name: "sinLab",
       f: [ (x) => Math.sin(x), (x, s) => s.A * Math.sin(x) ],   // (x, sliders) => y, or an array (one curve each)
       line: (colors, i) => i === 0 ? { strokeColor: colors.line, strokeOpacity: 0.35 } : { strokeColor: colors.cat[0] },
       legend: [ "sin(x)", "A·sin(x)" ] }],                      // optional: one label per curve, swatch row at bottom
    { xmin: -6.3, xmax: 6.3, ymin: -3.2, ymax: 3.2 },            // shared domain+range (null ymin/ymax → auto)
    "wave",                                                      // slider group name (or inline defs for a single chart)
  );
</script>
```

- **`chartOptions`** (all optional): `{ id, title, xmin=-1, xmax=1, ymin=null, ymax=null, xticks=null,
  yticks=null, xaxisname="x", yaxisname="y" }`. `null` ymin/ymax auto-compute from the curves (one shared
  range, so quiz options stay comparable). An interactive chart whose curve grows with a slider should set
  explicit `ymin/ymax` so the axes don't jump.
- **Sliders** (3rd arg): a **string** (a `registerChartSliders(name, defs)` group placed with
  `<primer-chart-sliders name="…">` — any number of charts/geometry scenes may share it) or an **array** of
  inline defs (single-chart only). A slider def is `{ name, label?, min, max, step?=0.1, value?=min,
  anchors? }`; set `type: "choice"` with `options: [...]` for a segmented button group (value = the chosen
  index). Same colour rule; `title`/`label` may be thunks for localization. Low-level `registerChart` and
  `register3dChart` → reference.

## Quiz (`<primer-quiz>` + `registerQuiz`)

`<primer-quiz name="quizName@1">` references a bank built in an inline module by
`registerQuiz(name, builder)`. Place it **directly** — do NOT wrap it in a `<primer-card>` or add a heading
(it renders its own "Quick quiz" panel). A question is **multiple-choice** (`options`) or **free-text**
(`answer`).

```html
<primer-quiz name="addingQuiz@1"></primer-quiz>

<script type="application/json" class="scene-strings">
  { "addingQuiz@1": { "instructions": "Add the two numbers.", "sumWords": "What is the sum?" } }
</script>

<script type="module">
  import { registerQuiz } from "primer";
  registerQuiz("addingQuiz@1", ({ sceneStrings }) => [
    { num_questions: 6, preamble: sceneStrings("instructions") },  // config: recognised by NO options/answer
    { prompt: () => sceneStrings("sumWords"),                      // localized prose → a function
      options: [ { text: "$5$", correct: true }, { text: "$6$", correct: false } ] },
    { prompt: "What is ${a} + {b}$?",                              // string prompt: {a},{b} fill from the draw
      variables: "a=[1:10] b=[1:10]",
      answer: "a + b" },                                           // string expression ≡ (v) => v.a + v.b
  ]);
</script>
```

- **Make it RANDOMISED — an "eternal" quiz.** Give questions `variables` so every draw gets fresh numbers.
  Put **≥10 questions in the bank** (only ~5 drawn per attempt, `num_questions` defaults to 5) so *which*
  questions appear rotates. A fixed hard-coded list is the exception, not the norm.
- **Config item** (optional **first** entry, recognised by no `options`/`answer`): `{ num_questions,
  preamble }`. Route a translatable `preamble` through `sceneStrings` (an all-maths quiz needs none).
- **`variables`** — space-separated `name=[…]`; the bracket picks the kind: `[lo:hi]` integer, `[lo;hi]`
  real (3 dp), `[v1,v2,…]` a choice. Negatives ok (`[-5:5]`).
- **`prompt`, option `text`, and `answer`** each accept **a string** (any `{…}` is **evaluated against the
  drawn variables** — `{a + b}`, `{2 * a}`, adjacent groups concatenate; double braces `{{12}}` keep a
  literal LaTeX `{12}`) **or a function of `v`** (`answer: (v) => v.a + v.b`). For `answer` a bare string is
  the whole expression (`"a + b"`) or a literal (`"Paris"`, a number). Inline LaTeX with `$…$`.
- **`constraints`** — a boolean expr over the variables (`== != < > <= >= && ||`, e.g. `"a != b"`) that must
  hold; values re-roll until it does. **MC-with-variables**: options may carry `{expr}` text too — use
  `constraints` so distractors don't collide.
- **Version the `name` (`@1`)** and bump it on an incompatible change.
- **Localization / advanced options** — route translatable prose through `sceneStrings` (keep maths
  literal). The full i18n contract (`fillVars`, `{{…}}`, the `npm run check` enforcement) and the advanced
  option kinds (chart/geometry figure options, `figure:`, `{ problem }`, `{ program }`,
  `compare: "polynomial"`, `keyboard`) are in `docs/authoring-reference.md`.

## Localization (brief)

English is the default + fallback; translations are automatic (overlays under `i18n/<locale>/`, the
`?lang=` link, `sourceHash`, `npm run i18n:check` — all in the reference doc). As an **author**: route every
translatable string through **`sceneStrings("key")`** (its English in a `<script class="scene-strings">`
block, keyed by scene/quiz name), and keep language-neutral maths as inline literals. Put each
`scene-strings` block **directly before the card/element that uses it**. A `sceneStrings` string only fills
bare `{name}` placeholders — never expressions.

## Accessibility (brief)

The Primer is for "ages 5 to 105" — it must work with a keyboard, screen reader, and reduced-motion/zoom.
Most machinery is wired already; authoring is mostly about **not breaking** it:
- **Real controls**: anything clickable is a `<button>`/`<a>`/`<input>`; icon-only controls get an
  `aria-label`; decorative SVG/emoji get `aria-hidden="true"`.
- **Colour is never the only signal** — pair it with text/shape/ARIA; use only `--primer-*` tokens (WCAG AA
  4.5:1 in all themes).
- **Figures need a text alternative** — a real `alt` on `<img>` (`""` if decorative); a `caption` on
  `<primer-manim>`/`<primer-chart>`/`<primer-geometry>` (+ manim `speak` narration).
- **Keyboard + focus** reachable/operable with a visible ring. Full checklist → reference doc.

## People pages (biographies)

Mathematicians, physicists and computer scientists get a **biography** at `concepts/people/<surname>.html`
(id `people/<surname>`) — e.g. `people/gauss.html`, `<primer-title>` = the person's **full name**. When a
concept is named after someone (a theorem, law, unit, algorithm), that person deserves a page, and the
concept should link to it.

**Tone: friendly, funny, informative, lightweight.** A bio is a warm little **portrait**, not a dry CV or a
Wikipedia dump. Lead with what makes them *human* and memorable — the schoolboy Gauss writing `5050` in
seconds, a rivalry, a stubborn quirk, a motto ("*pauca sed matura*"), a wild side-quest (rediscovering a lost
asteroid). Keep it short and lively (a few `<primer-card>`s), pitched so a curious teenager grins and learns
something. Sprinkle in the ideas that bear their name as **`<primer-ref soft>`** links (soft = no
prerequisite edge — a person isn't a maths prerequisite), so the page becomes a hub into "everything named
after them". Dates as `(1777–1855)`. Usually **no quiz** — a biography isn't a concept to be tested. Set
`prerequisites` to one representative concept they're known for (or omit the block).

## Validate & preview

```bash
npm run serve        # static dev server → http://localhost:8080/
npm run graph        # validate the tree + (re)write dist/graph.json
npm run check:graph  # validate only (CI gate; non-zero exit on error)
npm run check        # typecheck + tests + graph validation (run before done)
```

**Dev server: reuse it, never kill it.** One is normally already running on `http://localhost:8080/` — just
use it (curl/open URLs). Do **not** spawn a second `npm run serve` or kill it. There's no build step, so the
running server already serves your edits.

`npm run graph` reports errors (duplicate id, id≠path, dangling/cyclic prerequisites, orphan, missing root)
and warnings (declared level below a prerequisite, or no declared level in the ancestry). A **dangling
prerequisite** still emits the graph (edge omitted) but exits non-zero; orphans auto-attach to the `orphans`
node.

## Checklist for a new page

1. File at `concepts/<path>.html` (the path **is** the id). Add a `<primer-title>`.
2. List `prerequisites` in a `concept-meta` block **after `</html>`** (a base concept may omit them).
3. Author several `<primer-card>`s, pitched to the learner's age — teach the one idea *richly*: a hook,
   multiple representations, worked examples, one or two `<primer-vignette>` digressions (incl. a
   `<primer-vignette title="Watch out!">` for the classic misconception), a visual aid where it helps, and a
   **randomised** `<primer-quiz>` with **≥10 questions** in the bank. Don't ship a lone intro-plus-quiz. Keep
   each `scene-strings` block before its card; put `<script type="module">` builders after `</html>`.
4. `npm run graph` is clean, then preview with `npm run serve`.
