# CLAUDE.md

- **Read `README.md` first** — it defines the vision and the tree/level model.

This file is the cheat-sheet for authoring **concept pages**. A page is a single
`.html` file under `concepts/`; there is **no build step**.

## Pedagogy: one small idea per page

Concepts are **short and concise** — a page teaches a single, naturally digestible idea,
then stops. Prefer **many tiny steps** over a few dense lessons: a learner should finish a
page feeling they mastered one clear thing.

**Split a concept** whenever it grows too long or carries more than one digestible idea —
make each part its own page and chain them with `prerequisites`. For example, the derivative
is built power by power: a constant, then `$x$`, then `$x^2$`, then `$x^3$`, *then* the
general power rule — each its own page, so the pattern is discovered, not asserted. When a
draft starts covering two things, that's the signal to split.

See `concepts/mathematics/calculus/README.md` for a worked example of decomposing a subject this way.

## Page skeleton (copy this)

The page splits cleanly in two: **everything a translator edits is in the `<body>` (above
`</html>`)** — the title, the prose cards, and the `scene-strings`. All **language-neutral
machinery goes _after_ `</html>`**: the `concept-meta` JSON and every inline `<script type="module">`
(scene/quiz/chart builders). Browsers relocate post-`</html>` content into `<body>`, so the scripts
still run and the metadata is still read.

```html
<!doctype html>
<html lang="en">
  <body>
    <!-- 1) The whole toolchain, in one tag. MUST be first in <body>. -->
    <script src="/js/boot.js"></script>

    <!-- 2) The title — its own element (translatable; overlays supply a translated one). -->
    <primer-title>Addition</primer-title>

    <!-- 3) Content: one or more cards. The page shell, title, header and confidence
            control are built automatically — do NOT write <head>, <main>,
            <primer-page> or <primer-concept>. A scene-strings block (if any) sits
            DIRECTLY BEFORE the card that uses it (see Localization). -->
    <primer-card>
      <p>Addition combines two amounts …</p>
      <primer-math display>a + b = c</primer-math>
    </primer-card>
  </body>
</html>

<!-- 4) Machinery, AFTER </html>: metadata first, then the module script(s). The id is NOT
        authored — it's this file's path under concepts/ minus ".html". Omit the whole block
        if the page has no prerequisites/level. -->
<script type="application/json" class="concept-meta">
  {
    "prerequisites": ["arithmetic/counting"]
  }
</script>
```

## concept-meta fields

The block carries only graph/curation metadata now — **no `id`** (it's the file path under
`concepts/` minus `.html`) and **no `title`** (that's the `<primer-title>` element). A page with no
prerequisites or level may omit the block entirely.

| Field | Required | Notes |
|---|---|---|
| `prerequisites` | no (default `[]`) | Array of full-path ids (the DAG edges). The final edge set is the **union of this list and the inline `<primer-ref>`s in the prose** (see below), so a prerequisite you already link to in the copy needn't be repeated here. The tree has exactly **one root**, the page at path `root`; every other concept reaches it through prerequisites. A base concept with no natural prerequisite of its own may simply omit `prerequisites` (or the whole block) — the graph build auto-attaches any such page to the `orphans` maintenance node (which hangs off `root`), so it joins the tree instead of failing as an orphan. |
| `declaredLevel` | no | Real number. Levels start at 0 and propagate downstream via `max(declared, all prerequisite levels)`. Fractions allowed (e.g. `2.5`). |
| `completedDate` | no | ISO date `YYYY-MM-DD` — when the lesson content was finished. Surfaced by the graph tool; omit on stubs. |
| `needsReviewDate` | no | ISO date `YYYY-MM-DD` — when this concept was flagged as needing review (the date the flag was raised, not a deadline). |

## Authoring elements (use inside `<primer-card>`)

- `<primer-card>` — top-level content block; use one or more per page.
- `<primer-math>` — LaTeX. Body text is the source: inline by default, block with the
  `display` attribute. e.g. `<primer-math display>\int_0^1 x\,dx</primer-math>`.
- `<primer-manim scene="name" caption="…">` — plays a registered animation on a Play
  button (lazy-loads manim-web; supports replay). See scenes below.
- `<primer-chart scene="name">` — a **JSXGraph chart** (a function plotted on axes, SVG). Two
  modes: **static** (no body) draws once; **interactive** carries sliders + number boxes that
  re-plot the curve live. Add the controls with an inline `params` config and read them in the
  chart builder. See charts below.
- `<primer-video src="…" caption="…">` — an inline YouTube video. `src` is a YouTube URL
  (watch / youtu.be / embed / shorts) or a bare 11-char id. Shows a thumbnail + play
  facade and only loads YouTube on click. In a translation overlay, keep the same `src`
  to pin the English video or set a different one for a localized video.
- `<primer-ref to="full/path/id">words</primer-ref>` — an inline link to **another concept**.
  Renders the words as a concept link (to `/concepts/<id>.html`) followed by a small confidence
  dot; leave the body empty to auto-fill the target's title. **Every `<primer-ref>` also declares
  a prerequisite** — it's harvested by the graph build and unioned into this concept's
  `prerequisites` — so it must point **backward** to a concept this page builds on. (A wrong-way
  ref makes a cycle, which `npm run graph` flags.) To point **forward** — mention a concept that
  comes *later* — use `<primer-ref forward to="full/path/id">`: it shows the **same control** but
  **reverses** the edge, so *this* page becomes a prerequisite of the target (a weak/implicit edge,
  like any harvested ref; a `forward` ref to an unknown id fails the build). For an incidental "see
  also" between concepts with **no** learning dependency either way (e.g. two peers), use
  `<primer-ref soft to="full/path/id">`: same styled link + confidence dot, but it harvests **no
  edge** (the build still fails if the id names no concept). `soft` wins if combined with `forward`.
  (A plain `<a href="/concepts/<id>.html">` also makes no edge, but without the confidence dot.)
  To reference a concept you **intend to write but haven't yet**, add the boolean **`todo`**
  attribute: `<primer-ref todo to="stochastic-calculus">`. It harvests **no edge** and is **never
  validated** (so it can't fail the build — the `to` value is just a label here and need not name a
  real page), and renders as a muted **"todo"** chip (not a working link, no confidence dot). `todo`
  wins if combined with `forward`/`soft`. `npm run graph` prints a tally of outstanding `todo`
  placeholders. **It is the `todo` *attribute* that does this — not the `to` value.** A plain
  `<primer-ref to="todo/foo">` (a `todo/`-style path but *no* attribute) is still an ordinary
  backward ref and fails the build as a dangling prerequisite — so always write the attribute, and
  the moment the page exists, drop the `todo` (the same `to` then becomes a real validated link).
- `<primer-quiz name="…">` — a random test. The question bank is built in JS by
  `registerQuiz(name, builder)` (in an inline module script, like `registerManimScene`), and the
  element references it by `name`. The builder receives a toolkit `{ sceneStrings }` and returns the
  bank. A question is **multiple-choice** (has `options`) or **free-text** (has `answer`).
  The quiz renders its **own** standardized golden "Quick quiz" panel (titled card), so place it
  **directly** — do **not** wrap it in a `<primer-card>` and do **not** add a per-page heading
  (`<h2>Test yourself</h2>` etc.).

  **Quiz settings live in the builder, not on the element.** The builder's optional **first** item is
  a config object `{ num_questions, preamble }` — recognized by having **no `options` and no
  `answer`** (so it isn't mistaken for a question). `num_questions` is how many questions to draw at
  random (**defaults to 5** when omitted, or when there's no config item); `preamble` is an
  instructions sentence rendered in normal font directly under the heading. Both live in the
  language-neutral builder, so the count + instructions are **common to every locale** — there is no
  `count` attribute and no separate intro `<p>` to keep in sync with a translation overlay. Route a
  `preamble` through `sceneStrings` so it translates (an all-maths quiz needs none).

  ```html
  <primer-quiz name="addingQuiz@1"></primer-quiz>

  <!-- Translatable prose, keyed by the quiz name (its own scene-strings block). -->
  <script type="application/json" class="scene-strings">
    { "addingQuiz@1": { "instructions": "Add the two numbers.", "sumWords": "What is the sum?" } }
  </script>

  <script type="module">
    import { registerQuiz } from "primer";
    registerQuiz("addingQuiz@1", ({ sceneStrings }) => [
      { num_questions: 3, preamble: sceneStrings("instructions") },  // config: no options/answer
      { prompt: () => sceneStrings("sumWords"),                 // localized prose → must be a function
        options: [ { text: "$5$", correct: true }, { text: "$6$", correct: false } ] },
      { prompt: "What is ${a} + {b}$?",                         // simple string: {a},{b} fill from the draw
        variables: "a=[1:10] b=[1:10]",
        answer: "a + b" },                                      // string expression  ≡  (v) => v.a + v.b
    ]);
  </script>
  ```

  `num_questions` questions are picked at random; multiple-choice options are shuffled. Prompts and
  option text may contain inline LaTeX delimited by `$…$`. **Version the `name` (`@1`)** and bump it on
  an incompatible change (an overlay pinning the old version is then flagged — like a scene pin).

  **The prose/maths split (this is the i18n contract).** Route every translatable string through
  `sceneStrings("key")` (its English lives in the quiz's `scene-strings` block; an overlay supplies the
  translation — see Localization). Keep language-neutral maths as **inline literals** in the
  builder. So a translation overlay carries only the translated `scene-strings` — never the bank —
  and an all-maths quiz needs no translation at all.

  **`prompt`, option `text`, and `answer` each accept two equivalent forms** — use whichever is
  simpler:
  - a **string** — any `{…}` inside it is **evaluated against the drawn variables**: `{a + b}`,
    `{2 * a}`, a bare `{a}`, and adjacent groups concatenate (`{a}{b}` → "412"). For `answer` the
    whole string is the expression (`"a + b"`) or a literal (`"Paris"`, a number). Double the braces
    (`{{12}}`) to keep a literal LaTeX `{12}`.
  - a **function of the drawn bindings `v`** — `text: (v) => \`$${v.a + v.b}$\``,
    `answer: (v) => v.a + v.b`.

  They are identical — `{ text: "${a + b}$" }` ≡ `{ text: (v) => \`$${v.a + v.b}$\` }` — so strings
  keep simple quizzes terse and functions handle anything awkward to express inline. **Localized
  prose is the exception:** it must be a function, so it can call `sceneStrings("key", v)` (passing
  `v` interpolates a `{name}` placeholder in the translated string).

  **Free-text questions** (`answer`):
  - `variables` — space-separated `name=[…]`; the bracket separator picks the kind:
    `[lo:hi]` integer, `[lo;hi]` real (3 dp), `[v1,v2,…]` a choice. Negatives ok (`[-5:5]`).
  - `answer` — a function of `v` (e.g. `(v) => v.a * v.b`), or a literal (a number, or text like
    `"Paris"`; a function returning text — `() => sceneStrings("capital")` — localizes it). Typed
    answers are graded numerically with a small tolerance, or as case/space-insensitive text.
  - A question **with** `variables` is **re-instantiable**, so one entry can fill many `count`
    slots — each with fresh random values.
  - `compare: "polynomial"` grades the answer by **algebraic equivalence** via the CortexJS Compute
    Engine (lazy-loaded), so any equivalent form is accepted — factored, reordered, fractions, etc.
    (`(x+3)(x+4)` ≡ `x^2+7x+12`). The box becomes a MathLive math editor (type `^` for an exponent).
    `answer` is the expected expression as a string, e.g.
    `{ prompt: () => \`${sceneStrings("expand")} $(x+3)(x+4)$\`, answer: "x^2 + 7x + 12", compare: "polynomial" }`.
    Offline (CE can't load) it falls back to a simple expanded-polynomial comparator. Its on-screen
    keyboard defaults to `algebra-basic`; set `keyboard: "<name>"` to pick a different per-module
    keyboard (see js/math-keyboards.js — add exponents/geometry/trig there).
  - `constraints` (either kind) — a boolean expression over the variables that must hold; values are
    **re-rolled** (up to 100×) until it does. `== != < > <= >= && ||`, e.g. `"a != b"`,
    `"a > b && b > 0"`. If a question's constraints can't be met, the quiz falls back to others.

  **Multiple-choice with variables:** an `options` question may carry `variables` too; write each
  option's `text` as a string with `{expr}` (e.g. `"${a + b}$"`, `"${2 * a}$"`) or as a function,
  and keep its `correct` flag. Use `constraints` to stop distractors colliding — e.g. with
  `a,b∈[1:20]`, set `"a != b"` so `{a+b}`, `{2*a}`, `{2*b}` don't render identically.

  **Chart options** (the choices are graphs, not text): give an option a `chart` (a registered
  chart-scene name) instead of `text`, and it renders as a small `<primer-chart>` graph; `correct`
  works the same. Example:
  `{ prompt: () => sceneStrings("whichSin"),
     options: [ { chart: "optSinX", correct: false }, { chart: "opt2SinX", correct: true } ] }`.
  Chart options carry no `text`, so they need no translation.

  Inline JSON blocks (the `concept-meta`, `scene-strings`) are parsed with **JSON5**, so `//` and
  `/* … */` comments and trailing commas are allowed.

The **confidence control** (a 0–10 star rating, persisted to `localStorage` under
`primer:confidence:<id>`) is added to every page automatically — do not author it.

## Animations + narration (manim-web scenes)

Register a scene in an inline module script (anywhere in `<body>`), then reference it
by name from a `<primer-manim>`. The builder receives a **single `toolkit` object** — destructure
what you need — so the only `primer` import is `registerManimScene`:

```html
<script type="module">
  import { registerManimScene } from "primer";

  registerManimScene("addNumberLine", async ({ scene, manim, speak, themeColors }) => {
    const { Circle, Create } = manim;               // `manim` = manim-web namespace
    const colors = themeColors();                   // theme palette (see colour rules below)
    await Promise.all([                             // `scene` is ready — just animate + narrate
      scene.play(new Create(new Circle({ color: colors.cat[0] }))),
      speak("Start at a, then count on."),
    ]);
  });
</script>
```

- The `toolkit` carries everything a scene needs: `scene` (the manim Scene, already built on the
  stage with the theme backdrop — just `scene.play(...)`, no `new Scene`), `manim`, `sceneStrings`
  (call `sceneStrings(key, vars?)` for localized narration words, interpolating any `{name}`
  placeholders; see Localization), `speak`, `cancelSpeech`, and `themeColors`. There is nothing
  else to import.
- `speak(text, { rate, pitch })` returns a Promise that resolves when narration finishes
  (silent no-op if the browser lacks speech). Narration is spoken in the **active locale's**
  voice automatically — authors don't deal with `lang`/`bcp47`; just pass the (localized) text.
  `cancelSpeech()` stops it; the manim component already cancels speech on replay.
- **NEVER pick your own colours — always use the theme.** A scene must take every colour from
  `const colors = themeColors()` (imported from `primer`). Do **not** use manim's named colour
  constants (`BLUE`, `RED`, `WHITE`, …), do **not** hardcode hex/`hsl`/`rgb`, and do **not**
  write an `|| BLUE`-style fallback (`themeColors()` always returns valid colours). This is what
  keeps every diagram on-theme and mutually consistent, and re-themes them on a theme change.
  `themeColors()` returns `{ bg, ink, line, cat }`: `bg` backdrop, `ink` for labels/text, `line`
  for axes/strokes/number lines, and `cat` — an **ordered categorical palette** (a generated
  golden-angle sequence, so early entries are maximally distinct). Take `colors.cat[0]`,
  `colors.cat[1]`, … in order so all diagrams share the same colours. A replay after a theme
  change re-reads them.
- **No animation item should be colourless.** Give every mobject an explicit theme colour
  (`colors.cat[i]`, `colors.line`, or `colors.ink`). manim's defaults are white and vanish on
  light themes — e.g. a `NumberLine` with no `color` is invisible on the light backdrop. Watch
  sub-parts: a `NumberLine`'s `color` is the **stroke** (line + ticks) only — its number labels
  are filled text and must be coloured separately, e.g.
  `for (const l of line.getNumberLabels()) l.setColor(colors.ink);` (`setColor` on the labels
  covers their fill).
- manim-web is pinned (v0.3.22 in `js/boot.js`), so call its API **directly** — don't write
  feature-detection fallbacks (`const Grow = GrowFromCenter ?? FadeIn`, `Integer ? … : Text`,
  `if (MoveAlongPath) … else …`): the exports are guaranteed present, so those branches are dead
  code. Keep scenes simple; the component already shows a friendly message if a scene throws.
- **Cartoon images (the exception to the colour rule).** A scene can show a picture with
  `new manim.ImageMobject({ source: "foo.png", height, center, opacity: 0.999 })` (it grows / fades
  like any mobject; `await img.waitForLoad()` before animating so it doesn't pop in). Such a
  **content image keeps its own colours** — it is *not* themed. Workflow for getting one:
  1. Find art on [OpenClipart](https://openclipart.org) (100% public domain) — always pick the
     **most cartoonish** image available.
  2. **Download the "small" PNG** (the PNG render, e.g. `https://openclipart.org/image/800px/<id>`)
     **into the same directory as the page that uses it**. Use a **PNG, not the SVG**: manim's WebGL
     texture loader can't decode an SVG (it shows a black box).
  3. The image **must be transparent** — if it has no alpha / is fully opaque, pick a different one.
  4. **Crop it tight** to the subject: `node scripts/trim-png.js <file.png>` (trims the transparent
     padding OpenClipart leaves; it also rejects a non-transparent PNG).
  Reference it by a **relative** path (`source: "frog.png"`, resolved against the page URL) — don't
  hotlink, don't use an absolute `/concepts/…` path. manim only honours the PNG's transparency when
  `opacity < 1`, so pass `opacity: 0.999` (looks opaque; drops the transparent background). See
  `concepts/mathematics/arithmetic/counting.html` (counting frogs).

## Charts (JSXGraph plots)

Charts are drawn with **JSXGraph** (an SVG plotting/geometry library) — separate from the manim
animations behind `<primer-manim>`. There are **two** ways to author them: the high-level
`registerCharts` helper (use this by default), or the low-level `registerChart` builder (for
full control / one-off boards). Both render into a `<primer-chart scene="name">`. Because JSXGraph
is SVG there's no WebGL context (and no context cap), so charts are cheap and you can use as many as
you like.

### Authoring charts the easy way: `registerCharts`

`registerCharts(charts, chartOptions, sliders?)` registers a whole **family** of charts that share
one identical domain + range — no board/axes/plot boilerplate. The markup is just an empty
`<primer-chart scene="name"></primer-chart>`.

```html
<primer-chart scene="sinLab"></primer-chart>

<script type="module">
  import { registerCharts } from "primer";
  const DEG = Math.PI / 180;
  registerCharts(
    [{
      name: "sinLab",
      // f is (x, sliders) => y, or an ARRAY of them (one curve each). Slider values arrive as `s`.
      f: [ (x) => Math.sin(x * DEG),
           (x, s) => s.A * Math.sin((s.f * x + s.phi) * DEG) ],
      // line: one style object (all curves) | array (per curve) | (colors, i) => style. The FUNCTION
      // form is the theme-safe way to colour curves — it gets fresh themeColors + the curve index.
      line: (colors, i) => i === 0 ? { strokeColor: colors.line, strokeOpacity: 0.35 } : { strokeColor: colors.cat[0] },
      // legend (optional): one label per curve (parallel to f). Renders a swatch + label row at the
      // BOTTOM of the chart; each swatch mirrors that curve's colour + solid/dashed style. A label is
      // a string or a thunk (() => …) — route translatable text through sceneStrings like a title.
      legend: [ "sin(x)", "A·sin(fx + φ)" ],
    }],
    { id: "sinLab", xmin: -360, xmax: 360, xticks: 180, yticks: 1, ymin: -3.2, ymax: 3.2 },
    // sliders: inline defs (single chart only). They render inside this chart; values feed every f.
    [ { name: "A", label: "Amplitude (A)", min: 0, max: 3, step: 0.1, value: 1, anchors: [0,1,2,3] },
      { name: "f", label: "Frequency (f)", min: 0, max: 4, step: 0.1, value: 1 },
      { name: "phi", label: "Phase (φ°)", min: -360, max: 360, step: 15, value: 0 } ],
  );
</script>
```

- **`chartOptions`** (all optional): `{ id, title, xmin=-1, xmax=1, ymin=null, ymax=null,
  xticks=null, yticks=null, xaxisname="x", yaxisname="y" }`. The whole series shares one domain +
  range. **null `ymin`/`ymax` are auto-computed** by sampling every curve of every chart across
  `[xmin,xmax]` — one **shared** range, so e.g. quiz options stay visually comparable (a taller
  amplitude really looks taller). `xticks`/`yticks` are the major-tick spacing; null → JSXGraph
  auto-spacing. `title` renders as a heading above the board. `id` defaults to the joined chart
  names. (Interactive charts whose curve grows with a slider should set an explicit `ymin/ymax` so
  the axes don't jump — auto-range only samples the initial slider values.)
- **`sliders`** (optional, 3rd arg) is a **union**:
  - a **string** — the name of a *shared* slider group registered with `registerChartSliders(name,
    defs)` and placed on the page with `<primer-chart-sliders name="…">`. Any number of charts may
    name the same group; they all re-plot together as it moves.
  - an **array** of slider defs — inline, allowed only for a **single-chart** series; the panel
    renders inside that chart.

  **Placement convention — sliders go BELOW the diagram.** Always put the
  `<primer-chart-sliders>` element **after** the `<primer-chart>` / `<primer-geometry>` it drives, so
  the controls sit *under* the visual they change (you watch the diagram, then reach down for the
  knobs). This holds everywhere a slider group is used (charts and geometry scenes alike).

  ```html
  <primer-chart scene="chartA"></primer-chart>
  <primer-chart scene="chartB"></primer-chart>
  <primer-chart-sliders name="wave"></primer-chart-sliders>   <!-- controls go below the chart(s) -->
  <script type="module">
    import { registerCharts, registerChartSliders } from "primer";
    registerChartSliders("wave", [ { name: "A", label: "Amplitude", min: 0, max: 3, step: 0.1, value: 1 } ]);
    registerCharts([{ name: "chartA", f: (x, s) => s.A * Math.sin(x) },
                    { name: "chartB", f: (x, s) => s.A * Math.cos(x) }], { xmin: -6.3, xmax: 6.3 }, "wave");
  </script>
  ```

  A slider def is `{ name, label?, min, max, step?=0.1, value?=min, anchors? }` (the same shape as a
  low-level `params` entry; `anchors` are snap points).

  **Control kinds.** A def defaults to a slider (range + linked number box). Set
  `type: "choice"` with `options: ["…","…"]` for a **segmented button group** instead — its value
  is the **index** of the selected option (so a chart/diagram reads `sliders.<name>` as a number,
  `0,1,2,…`), and `min`/`max`/`step`/`anchors` don't apply. A group's defs may mix sliders and
  choices in one panel. Use a choice for a discrete switch — e.g. flipping a diagram between two
  cases. See `concepts/mathematics/calculus/what-is-a-function.html` (function vs not-a-function, and the
  curve in the vertical-line test).

### For full control: the low-level `registerChart`

`registerChart(name, builder)` is the primitive `registerCharts` is built on. The builder receives
the host element and the `JXG` namespace, sets up a **board** (via `JXG.JSXGraph.initBoard`)
**once**, and returns an `update(params)` the component calls — initially, on every control change,
and after a theme change. Drive it from a `<primer-chart>` carrying an inline `params` block:

```html
<primer-chart scene="sinLab">
  <script type="application/json">
    { "params": [ { "name": "A", "label": "Amplitude (A)", "min": 0, "max": 3, "step": 0.1, "value": 1 } ] }
  </script>
</primer-chart>

<script type="module">
  import { registerChart, themeColors } from "primer";
  registerChart("sinLab", (host, JXG) => {
    const colors = themeColors();
    const board = JXG.JSXGraph.initBoard(host, { boundingbox: [-6.6, 3, 6.6, -3], axis: false });
    board.create("axis", [[0, 0], [1, 0]], { strokeColor: colors.line });          // x-axis
    board.create("axis", [[0, 0], [0, 1]], { strokeColor: colors.line });          // y-axis
    const cur = { A: 1 };                                                      // live values
    // functiongraph re-evaluates its function on board.update(), so close over `cur` and just
    // mutate it — no need to recreate the curve.
    board.create("functiongraph", [(x) => cur.A * Math.sin(x), -6.3, 6.3],
      { strokeColor: colors.cat[0], strokeWidth: 4, highlight: false });
    return (p) => {                                   // p = current control values, e.g. { A: 2 }
      if (Number.isFinite(p.A)) cur.A = p.A;
      board.update();
    };
  });
</script>
```

- Same colour rule as scenes: **every** colour from `themeColors()` (axes `colors.line`, curves
  `colors.cat[i]`, any text labels `colors.ink` — JSXGraph colours text via `strokeColor`), never a
  hardcoded value. The component disables pan/zoom/navigation chrome and re-fits on resize by
  default; a builder's own `initBoard` options override that.
- A **static** chart (no `params` config / a builder whose `update` ignores `p`) draws once —
  this is what quiz **chart options** use. The component rebuilds the board on a theme change, so
  read `themeColors()` at the top of the builder (not cached outside it).
- The board fills a 7:4 stage. Give `functiongraph` an explicit `[fn, xmin, xmax]` range so it
  only plots the visible span.
- **Localizing a chart.** A chart's `title` and each slider `label` may be a **function** returning
  the string. Pull the words from the page's `scene-strings` block (see Localization) via
  `makeStrings(namespace)` and pass them as thunks so they resolve when the chart RENDERS — after a
  translation overlay has been applied — not at registration: `const s = makeStrings("sinLab");`
  then `{ …, title: () => s("title") }` and a slider `{ name: "A", label: () => s("amplitude"), … }`.
  See `concepts/mathematics/trigonometry/sine-properties.html` for the full showcase.

### 3D charts: `register3dChart`

For a **3D** figure (points, vectors, surfaces in space) use `register3dChart(name, builder, opts)`
+ a **`<primer-chart-3d scene="name">`** element. It renders a JSXGraph **View3D** projected to SVG
(no WebGL, no context cap — themeable like every other figure) and is **drag-rotatable**. Sliders
work exactly as for 2D charts: name a `registerChartSliders` group via `opts.sliders` and place a
`<primer-chart-sliders>` below.

Unlike the 2D builder, the 3D builder gets a single **toolkit** `{ view, JXG, board, colors,
sliders }` and does NOT return an `update` — like a geometry scene it reads live slider values in
**functional coordinates** and the component calls `board.update()` on every change. `view` is the
themed View3D (author draws with `view.create('point3d' | 'line3d' | 'curve3d' | 'functiongraph3d' |
'scatter3d', …)`); `board` is the underlying 2D board (handy for a 2D overlay readout, pinned in its
`[-8,8]` coords); colours come from `themeColors()` (`colors.line`/`colors.cat[i]`/`colors.ink`),
never hardcoded. The view's axes + x/y/z labels are drawn and themed for you.

`opts`: `{ bounds = [[-5,5],[-5,5],[-5,5]], xName='x', yName='y', zName='z', title, sliders, az, el }`
— `bounds` the 3D extent, `az`/`el` the initial azimuth/elevation, `title` a string or thunk.

```html
<primer-chart-3d scene="vec3d"></primer-chart-3d>
<primer-chart-sliders name="vec3d"></primer-chart-sliders>

<script type="module">
  import { register3dChart, registerChartSliders } from "primer";
  registerChartSliders("vec3d", [ { name: "vx", min: -4, max: 4, step: 1, value: 3 }, /* vy, vz … */ ]);
  register3dChart("vec3d", ({ view, colors, sliders }) => {
    const O = view.create("point3d", [0, 0, 0], { visible: false });
    const tip = view.create("point3d", [() => sliders.vx, () => sliders.vy, () => sliders.vz],
      { size: 4, strokeColor: colors.cat[1], fillColor: colors.cat[1], withLabel: false });
    view.create("line3d", [O, tip], { strokeColor: colors.cat[1], strokeWidth: 4, straightFirst: false, straightLast: false });
  }, { bounds: [[-4.5, 4.5], [-4.5, 4.5], [-4.5, 4.5]], sliders: "vec3d", title: "a 3D vector" });
</script>
```

See `concepts/mathematics/linear-algebra/spaces/vectors-in-3d.html` and
`concepts/computer-science/machine-learning/foundations/the-feature-vector.html` (a 3D scatter +
vector). The 2D `<primer-chart>`/`<primer-geometry>` boards strip pointer handlers (static figures);
`<primer-chart-3d>` keeps them so the view can rotate.

## Geometry diagrams (`registerGeometryScene`)

For **figures** rather than function plots — lines, angles, polygons, Greek-letter labels — register a
geometry scene and reference it from a **`<primer-geometry scene="name">`** element (a peer of
`<primer-chart>`, also JSXGraph/SVG). The board is **equal-aspect, grid-less and axis-less** by default, so
angles/circles aren't distorted; every element is **read-only** (no dragging). Greek letters and `°` are
plain Unicode (no math engine).

A diagram is a **timeline of waypoints**: the builder draws everything up front, and each `step(caption, fn)`
tags the elements `fn` creates. The student steps the proof forwards/backwards (elements fade in by an
`i < current` threshold); elements created outside any `step()` are "base" (always visible).

Like a manim scene, the builder gets a single **toolkit** object: `{ board, JXG, step, sliders, colors,
sceneStrings, parallelMark, crossing, makeGraph }` — `colors` is the resolved `themeColors()` palette,
`sceneStrings` the localized strings, and `parallelMark`/`crossing`/`makeGraph` the drawing tools.

```html
<primer-geometry scene="rightTriangle"></primer-geometry>

<!-- Localized text, keyed by scene name → key (same block manim scenes use). -->
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

- **i18n**: `sceneStrings(key, vars?)` resolves a scene-scoped string (locale overlay → English →
  `$$scene.key$$`), exactly like manim's. Put the English in a `<script class="scene-strings">` block keyed
  by scene name; titles localize via a `() => makeStrings(name)("title")` thunk (the title is defined outside
  the builder). Numbers / Greek / `a∥b` stay literal.
- **Tools** (board-bound, on the toolkit):
  - `parallelMark(x, y, { dir = "h"|"v", along, count = 1, color })` — the "these are parallel" arrowheads
    (use `count: 2` for a second, distinct parallel pair; `color` defaults to `colors.line`).
  - `crossing(vertex, dirA, dirB)` — the four angles where two lines cross. Returns
    `{ number(corner, text, opts?), wedge(corner, opts?) }`, addressing an angle by screen corner
    (`"ul"|"ur"|"ll"|"lr"`): `number` writes a label inside the wedge (along its bisector); `wedge`
    fills/highlights it and returns the element (so a `step` captures it). `vertex`/`dirA`/`dirB` may each
    be a **function** returning the value — pass functions for a slider-driven figure (a moving crossing /
    rotating line) and the wedge + label re-plot live on `board.update()`. See the static figures in
    `concepts/mathematics/geometry/alternate-interior-angles.html` and the live transversal in `parallel-lines.html`.
  - `makeGraph(opts?)` — for a **graph diagram** (a function plotted on Cartesian axes), draws the
    standard themed axes (faint lines, arrowheads at the positive ends, tick numbers, `"x"`/`"y"` labels)
    that auto-span the board — the **same axes the `registerCharts` charts use**, so don't hand-roll
    `segment` axes + `"x"`/`"y"` text. Set the board's `boundingbox` (usually `keepAspect: false`) in the
    scene options; then call `makeGraph()` and plot your curve. Options (all defaulted, see
    js/graph-axes.js): `xName`/`yName` (axis labels, `""` hides one), `xticks`/`yticks` (spacing, null =
    auto), `ticks` (false → clean unticked axes), `arrows` (false → no arrowheads). E.g.
    `makeGraph({ yName: "f(x)" })`. See `concepts/mathematics/calculus/functions/what-is-a-function.html`.
- **Colours** as everywhere: from `themeColors()` (`colors.line`/`colors.cat[i]` strokes, fills
  `colors.cat[i]` at opacity, **text via `strokeColor: colors.ink`**) — never hardcoded.
- **No endpoint dots**: a `segment`/`line`/`arrow` built from coordinates hides its auto-created endpoint
  points by default (teaching figures draw lines, not points). To show a dot, create an explicit `point`.
- **`opts`**: `{ boundingbox, keepAspect = true, title, sliders, start, stepMs = 450, random = false }`.
  A figure opens **collapsed at the first step** by default and plays through forward; set `start` to a
  step count to open further along — e.g. `start: <number of steps>` for the fully-revealed finished
  render. A zero-`step` figure is static (only base content, always shown) — the control bar auto-hides.
  `stepMs` is the reveal fade.
- **Random scenes**: set `opts.random: true` for a figure with random initial conditions, and draw them with
  the toolkit's **`rng`** — `rng()` → `[0,1)`, `rng.int(lo, hi)` (inclusive), `rng.pick(arr)` — **inside** the
  builder (never `Math.random()`, and never outside the builder). This shows a **Refresh** button (between
  Play and All steps) that re-draws a fresh example. The `rng` is seeded per *run* and reused for the main
  board AND every "All steps" mini-board, so a run is internally coherent; Refresh bumps the seed (a page
  reload also gives a fresh one; a theme switch does not). See `concepts/mathematics/arithmetic/operations/number-bonds.html`.
- **Controls**: the element shows « Rewind · ‹ Prev · k/N · Next › · » Skip-to-end · Play · [**Refresh** — random
  scenes only] · **All steps** (Expand → a vertical comic-strip of every step, each cumulative, under its
  caption). Add the **`no-controls`** attribute to hide the bar for an externally-driven figure.
- **External sliders** (no draggable points): set `opts.sliders = "groupName"` (a `registerChartSliders`
  group rendered by a separate `<primer-chart-sliders name="groupName">`); the builder gets the live values
  as `sliders` — read them in **functional coordinates** so the figure re-plots as the sliders move:
  `board.create("point", [() => r * Math.cos(sliders.t * DEG), () => r * Math.sin(sliders.t * DEG)])`.
- **External control / manim sync**: the element exposes `goTo(k)`, `next()`, `prev()`, `play()`, `reset()`,
  and `step`/`stepCount`, and fires `primer:geometry-step` `{ detail: { name, step, stepCount } }`. A manim
  scene (or any script) can `document.querySelector('primer-geometry[scene="x"]').goTo(k)` to drive a proof
  in lockstep. See `concepts/mathematics/geometry/parallel-lines.html` for the showcase.

## Helpers re-exported from `primer` (for inline scripts)

`registerManimScene`, `getManimScene`, `registerChart`, `getChart`, `register3dChart`, `get3dChart`, `registerCharts`, `registerChartSliders`,
`computeRange`, `registerGeometryScene`, `getGeometryScene`, `registerQuiz`, `getQuiz`, `speak`, `cancelSpeech`, `themeColors`, `makeStrings`, `getConceptMeta`,
`parseConceptMeta`, `BASE_LEVEL`, `maxLevel`, `formatLevel`, the theme API (`THEMES`,
`getTheme`, `applyTheme`, `initTheme`), and the graph helpers (`resolveLevels`,
`validateGraph`, …). Pinned KaTeX/manim-web/JSXGraph versions live in `js/boot.js`.

## Themes & page chrome (automatic)

You don't author any of this per page. `boot.js` applies the saved theme (light / dark /
fun) with no flash and mounts a top-right hamburger menu (the theme switcher). Colours come
from `--primer-*` tokens defined per theme in `css/primer.css`, so headings, cards, the
explorer and badges re-theme themselves; the only theme-coupled JS is animations (use
`themeColors()` above). Levels start at 0; a real number that propagates via `max`.

## Localization (automatic)

The hamburger menu carries a language switcher; English is the default + fallback. A lesson's
translation lives in a per-locale **overlay** at `i18n/<locale>/<id>.html`. An overlay is just the
**translatable top part**: a translated `<primer-title>`, the translated cards, and the
`scene-strings` — **no `concept-meta` and no module scripts** (those are canonical-only). It records
which English version it was translated from in a single trailing **`<!-- sourceHash: … -->` comment
after `</html>`**. `js/render.js` fetches and swaps the overlay in when the locale isn't English.
`npm run i18n:check` flags stale/missing overlays (and prints the hash to stamp into that comment).

**Convention:** put each `scene-strings` block **directly before the card (or element) that uses
it** — on both the canonical page and its overlays — so the strings travel with the prose they
annotate. One block per scene/chart/quiz namespace; `makeStrings` merges them, so keeping quiz
strings in their own block (separate from scene strings) is encouraged.

The active locale is resolved + persisted (`localStorage["primer:locale"]`) in three in-step
places: the synchronous pre-paint scripts in `js/boot.js` and `index.html`, and the shared
post-paint `initLocale()` in `js/i18n.js` (the authority). Two URL entry points:

- **`?lang=<locale>`** (e.g. `…/addition.html?lang=es`) — a shareable "open in this language"
  link: it wins over storage/browser, is **persisted** (the whole site stays in that language),
  then stripped from the URL so a later menu switch can't snap back.
- **Direct visit to an overlay URL** (`/i18n/<locale>/<id>.html`) — `boot.js` (overlays carry the
  same `<script src="/js/boot.js">` as concept pages) redirects to the canonical lesson with
  `?lang=<locale>`. When render.js *fetches* an overlay the `<script>` is ignored.

## Validate & preview

```bash
npm run serve        # static dev server → open http://localhost:8080/
npm run graph        # validate the tree + (re)write dist/graph.json
npm run check:graph  # validate only (CI gate; non-zero exit on error)
npm run check        # typecheck + tests + graph validation (run before done)
```

`npm run graph` reports **errors** (duplicate id, id≠path, dangling/cyclic
prerequisites, an orphan unreachable from the root, a missing root) and **warnings** (a declared
level below a prerequisite, or no declared level in a concept's ancestry). Orphans are
auto-attached to the `orphans` node during the build, so the orphan error is now only a
safety net (e.g. if that maintenance node is deleted).

## Checklist for a new page

1. File at `concepts/<path>.html` (the path **is** the id — nothing to declare). Add a `<primer-title>` with the display title.
2. List `prerequisites` (in a `concept-meta` block **after `</html>`**) by full-path id; a base concept with no natural prerequisite may omit them — or omit the whole block — (it's auto-attached to the `orphans` node).
3. Author content as `<primer-card>`s; add math/animation/quiz as needed; keep each `scene-strings` block before its card, and put `<script type="module">` builders after `</html>`.
4. `npm run graph` is clean, then preview with `npm run serve`.
