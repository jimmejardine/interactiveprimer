# CLAUDE.md

- **Read `README.md` first** — it defines the vision and the tree/level model.

This file is the cheat-sheet for authoring **concept pages**. A page is a single
`.html` file under `concepts/`; there is **no build step**.

## Page skeleton (copy this)

```html
<!doctype html>
<html lang="en">
  <body>
    <!-- 1) The whole toolchain, in one tag. MUST be first in <body>. -->
    <script src="/js/boot.js"></script>

    <!-- 2) Metadata — the single source of truth. `id` MUST equal this file's path
            under concepts/ minus ".html" (this file: concepts/arithmetic/addition.html). -->
    <script type="application/json" class="concept-meta">
      {
        "id": "arithmetic/addition",
        "title": "Addition",
        "prerequisites": ["arithmetic/counting"]
      }
    </script>

    <!-- 3) Content: one or more cards. The page shell, title, header and confidence
            control are built automatically — do NOT write <head>, <main>,
            <primer-page> or <primer-concept>. -->
    <primer-card>
      <p>Addition combines two amounts …</p>
      <primer-math display>a + b = c</primer-math>
    </primer-card>
  </body>
</html>
```

## concept-meta fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Full path, e.g. `arithmetic/addition`. Must match the file path. |
| `title` | yes | Display title. |
| `prerequisites` | no (default `[]`) | Array of full-path ids (the DAG edges). |
| `declaredLevel` | no | Real number. Levels start at 0 and propagate downstream via `max(declared, all prerequisite levels)`. Fractions allowed (e.g. `2.5`). |
| `root` | no | `true` marks an entry point (no prerequisites). **Base concepts must set this** or they fail validation as orphans. |
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
- `<primer-quiz count="3">` — a random test. Author the bank inline as a JSON array.
  A question is **multiple-choice** (has `options`) or **free-text** (has `answer`):

  ```html
  <primer-quiz count="3">
    <script type="application/json">
      [
        { "prompt": "What is $2 + 3$?",
          "options": [
            { "text": "$5$", "correct": true },
            { "text": "$6$", "correct": false }
          ] },
        { "prompt": "What is ${a} + {b}$?",
          "variables": "a=[1:10] b=[1:10]",
          "answer": "a + b" }
      ]
    </script>
  </primer-quiz>
  ```

  `count` questions are picked at random; multiple-choice options are shuffled. Prompts
  and option text may contain inline LaTeX delimited by `$…$`. Inline JSON blocks (this bank,
  the `concept-meta`, scene-strings) are parsed with **JSON5**, so `//` and `/* … */` comments
  and trailing commas are allowed.

  **Randomized free-text questions** (the second example):
  - `variables` — space-separated `name=[…]`; the bracket separator picks the kind:
    `[lo:hi]` integer, `[lo;hi]` real (3 dp), `[v1,v2,…]` a choice. Negatives ok (`[-5:5]`).
  - `{name}` in the prompt expands to the generated value (it consumes its own braces, so
    to keep LaTeX braces write `\frac{{a}}{{b}}`).
  - `answer` — an expression over the variables (`+ - * / % ^`, parentheses, and
    `sqrt abs round floor ceil min max pow`), e.g. `"a * b"`. With no variables it's a
    literal (a number, or text like `"Paris"`). Typed answers are graded numerically with
    a small tolerance, or as case/space-insensitive text.
  - A template (a free-text question **with** `variables`) is **re-instantiable**, so one
    template can fill many `count` slots — each with fresh random values.
  - `"compare": "polynomial"` grades the answer by **algebraic equivalence** via the CortexJS
    Compute Engine (lazy-loaded), so any equivalent form is accepted — factored, reordered,
    fractions, etc. (`(x+3)(x+4)` ≡ `x^2+7x+12` ≡ `12+7x+x^2`). The box becomes a MathLive math
    editor (type `^` for an exponent). `answer` is the expected expression as a string, e.g.
    `{ "prompt": "Expand $(x+3)(x+4)$", "answer": "x^2 + 7x + 12", "compare": "polynomial" }`.
    Offline (CE can't load) it falls back to a simple expanded-polynomial comparator.
    Its on-screen keyboard defaults to `algebra-basic`; set `"keyboard": "<name>"` to pick a
    different per-module keyboard (see js/math-keyboards.js — add exponents/geometry/trig there).
  - `constraints` (either question kind) — a boolean expression over the variables that must
    hold; the values are **re-rolled** (up to 100×) until it does. Uses the same evaluator
    plus comparisons/logic: `== != < > <= >= && ||`. e.g. `"a != b"`, `"a > b && b > 0"`. If
    a question's constraints can't be met, the quiz falls back to other questions.

  **Randomized multiple-choice questions:** a `options` question may ALSO carry `variables`.
  Then the prompt and each option's `text` evaluate `{expr}` against the drawn values —
  `{a + b}`, `{2 * a}`, a bare `{a}`, and adjacent groups concatenate (`{a}{b}` → "412").
  The `correct` flag stays as authored; the question re-instantiates each draw. Double the
  braces (`{{12}}`) to keep a literal LaTeX `{12}`. Example:
  `{ "prompt": "What is ${a}+{b}$?", "variables": "a=[1:9] b=[1:9]",
     "options": [ { "text": "${a+b}$", "correct": true }, { "text": "${2*a}$", "correct": false } ] }`.
  Use `constraints` to stop distractors colliding — e.g. with `a,b∈[1:20]`, `a==b` makes
  `{a+b}`, `{2*a}`, `{2*b}` render identically, so add `"constraints": "a != b"`.

  **Chart options** (the choices are graphs, not text): give an option a `chart` (a registered
  chart-scene name) instead of `text`, and it renders as a small `<primer-chart>` graph. Mix is
  per-question; `correct` works the same. Example:
  `{ "prompt": "Which graph shows $y = 2\\sin x$?",
     "options": [ { "chart": "optSinX", "correct": false }, { "chart": "opt2SinX", "correct": true } ] }`.
  Don't pair `chart` with `variables` (chart options aren't templated).

The **confidence control** (a 0–10 star rating, persisted to `localStorage` under
`primer:confidence:<id>`) is added to every page automatically — do not author it.

## Animations + narration (manim-web scenes)

Register a scene in an inline module script (anywhere in `<body>`), then reference it
by name from a `<primer-manim>`:

```html
<script type="module">
  import { registerManimScene, speak } from "primer";

  registerManimScene("addNumberLine", async (host, manim) => {
    const { Scene, Circle, Create } = manim;       // `manim` = manim-web namespace
    const scene = new Scene(host);                  // `host` = element to draw into
    await Promise.all([                             // animate and narrate in lockstep
      scene.play(new Create(new Circle())),
      speak("Start at a, then count on."),
    ]);
  });
</script>
```

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
  `for (const l of line.getNumberLabels?.() ?? []) { l.setColor?.(colors.ink); l.setFill?.(colors.ink, 1); }`.
- manim-web is young (v0.3.x): keep scenes simple, and the component shows a friendly
  message if a scene throws, so prefer small, defensive scenes.

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

  ```html
  <primer-chart-sliders name="wave"></primer-chart-sliders>
  <primer-chart scene="chartA"></primer-chart>
  <primer-chart scene="chartB"></primer-chart>
  <script type="module">
    import { registerCharts, registerChartSliders } from "primer";
    registerChartSliders("wave", [ { name: "A", label: "Amplitude", min: 0, max: 3, step: 0.1, value: 1 } ]);
    registerCharts([{ name: "chartA", f: (x, s) => s.A * Math.sin(x) },
                    { name: "chartB", f: (x, s) => s.A * Math.cos(x) }], { xmin: -6.3, xmax: 6.3 }, "wave");
  </script>
  ```

  A slider def is `{ name, label?, min, max, step?=0.1, value?=min, anchors? }` (the same shape as a
  low-level `params` entry; `anchors` are snap points).

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

## Helpers re-exported from `primer` (for inline scripts)

`registerManimScene`, `getManimScene`, `registerChart`, `getChart`, `registerCharts`, `registerChartSliders`,
`computeRange`, `speak`, `cancelSpeech`, `themeColors`, `getConceptMeta`,
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
translation lives in a per-locale **overlay** at `i18n/<locale>/<id>.html` (translated content +
`scene-strings` + a `sourceHash`); `js/render.js` fetches and swaps it in when the locale isn't
English. `npm run i18n:check` flags stale/missing overlays; `npm run i18n:bless` re-stamps hashes.

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
prerequisites, orphans unreachable from a root, no roots) and **warnings** (a declared
level below a prerequisite, or no declared level in a concept's ancestry).

## Checklist for a new page

1. File at `concepts/<path>.html`; `concept-meta.id` equals `<path>`.
2. List `prerequisites` by full-path id; set `root: true` only on base concepts.
3. Author content as `<primer-card>`s; add math/animation/quiz as needed.
4. `npm run graph` is clean, then preview with `npm run serve`.
