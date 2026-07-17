# Authoring reference (companion to CLAUDE.md)

`CLAUDE.md` holds the lean core needed to write a standard concept page. This file is the **full
reference** for the rarely-used elements and the complete API surface — read it on demand when you reach
for one of these features. (Everything here was distilled out of CLAUDE.md to keep the always-loaded
context focused.)

## Courses

A **course** is a curated path through a set of concepts. Mark the course's hub page with
`"course": true` in its `concept-meta`; the build then harvests every `<primer-ref>` on that page
(**normal + soft**, deduped, in document order — `forward`/`todo` excluded) into the course's ordered
member list (emitted as `courseMembers` on that node in `dist/graph.json`). So a course page is
usually a prose index that `soft`-refs its concepts stage by stage (see
`concepts/applied-mathematics/game-development-math/game-development-math.html`; the UK/US school course
trees under `concepts/*/courses/…` are the fuller pattern). Course year/stage pages carry
`{ "course": true, "prerequisites": ["…/parent-hub"] }`, no `declaredLevel`; hub pages carry only
`prerequisites`. Members are empty-body `<primer-ref soft to="…">` under topic `<h2>`s + a closing
`<primer-ref forward>` "Begin →" link.

A learner picks a **current course** (the "Focus on this course" button under the title, or the
**Course** hamburger menu → Exit course). It's stored per-profile (`localStorage["primer:course"]`,
via `src/course.ts`) and travels with the progress export/import (a clash on import asks which to
keep). While a course is active: the top/bottom mini-explorer tints the course predecessor/successor
of the current concept; the big `/explore` graph collapses to the course members + their
recursive prerequisite ancestors, with members tinted in the course colour (`--primer-course`).

## `<primer-table>`

`<primer-table><table>…</table></primer-table>` — a light-DOM wrapper that gives a plain `<table>`
consistent, themed presentation: **centered cells, hairline borders (via `--primer-border`), a shaded
header row, and horizontal scroll on overflow**. Author a normal semantic `<table>` (with `<thead>`/`<th>`
for headers, optional `<caption>`) inside it — no classes or inline styles. Styling lives in `css/primer.css`
(`primer-table > table`) and follows the light/dark/fun themes. Prefer this over a bare `<table>` for any
data table. (There is no `class="primer-table"` — the styling only applies inside the element.)

## `<primer-video>`

`<primer-video src="…" caption="…">` — an inline YouTube video. `src` is a YouTube URL
(watch / youtu.be / embed / shorts) or a bare 11-char id. Shows a thumbnail + play facade and only
loads YouTube on click. In a translation overlay, keep the same `src` to pin the English video or set a
different one for a localized video.

## Animations + narration (manim-web scenes)

`<primer-manim scene="name" caption="…">` plays a registered animation on a Play button (lazy-loads
manim-web; supports replay). Register a scene in an inline module script (anywhere in `<body>`), then
reference it by name. The builder receives a **single `toolkit` object** — destructure what you need —
so the only `primer` import is `registerManimScene`:

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
  placeholders), `speak`, `cancelSpeech`, and `themeColors`. There is nothing else to import.
- `speak(text, { rate, pitch })` returns a Promise that resolves when narration finishes
  (silent no-op if the browser lacks speech). Narration is spoken in the **active locale's**
  voice automatically — authors don't deal with `lang`/`bcp47`; just pass the (localized) text.
  `cancelSpeech()` stops it; the manim component already cancels speech on replay.
- **NEVER pick your own colours — always use the theme** (see the colour rule in CLAUDE.md). Do **not**
  use manim's named colour constants (`BLUE`, `RED`, `WHITE`, …), do **not** hardcode hex/`hsl`/`rgb`, and
  do **not** write an `|| BLUE`-style fallback. `themeColors()` returns `{ bg, ink, line, cat }`.
- **No animation item should be colourless.** Give every mobject an explicit theme colour
  (`colors.cat[i]`, `colors.line`, or `colors.ink`). manim's defaults are white and vanish on
  light themes — e.g. a `NumberLine` with no `color` is invisible on the light backdrop. Watch
  sub-parts: a `NumberLine`'s `color` is the **stroke** (line + ticks) only — its number labels
  are filled text and must be coloured separately, e.g.
  `for (const l of line.getNumberLabels()) l.setColor(colors.ink);`.
- manim-web is pinned (v0.3.22 in `src/boot.ts`), so call its API **directly** — don't write
  feature-detection fallbacks: the exports are guaranteed present. Keep scenes simple; the component
  already shows a friendly message if a scene throws.

### Cartoon images (the exception to the colour rule)
A scene can show a picture with `new manim.ImageMobject({ source: "foo.png", height, center,
opacity: 0.999 })` (it grows / fades like any mobject; `await img.waitForLoad()` before animating so it
doesn't pop in). Such a **content image keeps its own colours** — it is *not* themed. Workflow:
1. Find art on [OpenClipart](https://openclipart.org) (100% public domain) — pick the **most cartoonish**.
2. **Download the "small" PNG** (`https://openclipart.org/image/800px/<id>`) **into the same directory as
   the page**. Use a **PNG, not the SVG** (manim's WebGL texture loader can't decode an SVG → black box).
3. The image **must be transparent** — if it has no alpha, pick a different one.
4. **Crop it tight**: `node scripts/trim-png.js <file.png>` (trims transparent padding; rejects a
   non-transparent PNG).
Reference it by a **relative** path (`source: "frog.png"`). manim only honours transparency when
`opacity < 1`, so pass `opacity: 0.999`. See `concepts/mathematics/arithmetic/counting.html`.

## Charts — the low-level `registerChart`

(For the common `registerCharts` family helper + sliders, see CLAUDE.md.) `registerChart(name, builder)`
is the primitive `registerCharts` is built on. The builder receives the host element and the `JXG`
namespace, sets up a **board** (via `JXG.JSXGraph.initBoard`) **once**, and returns an `update(params)`
the component calls — initially, on every control change, and after a theme change. Drive it from a
`<primer-chart>` carrying an inline `params` block:

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
    board.create("axis", [[0, 0], [1, 0]], { strokeColor: colors.line });
    board.create("axis", [[0, 0], [0, 1]], { strokeColor: colors.line });
    const cur = { A: 1 };
    board.create("functiongraph", [(x) => cur.A * Math.sin(x), -6.3, 6.3],
      { strokeColor: colors.cat[0], strokeWidth: 4, highlight: false });
    return (p) => { if (Number.isFinite(p.A)) cur.A = p.A; board.update(); };
  });
</script>
```

- Same colour rule as everywhere: every colour from `themeColors()` (axes `colors.line`, curves
  `colors.cat[i]`, text labels `colors.ink` — JSXGraph colours text via `strokeColor`). The component
  disables pan/zoom chrome and re-fits on resize; a builder's own `initBoard` options override that.
- A **static** chart (no `params` / `update` ignores `p`) draws once — this is what quiz **chart options**
  use. The component rebuilds the board on a theme change, so read `themeColors()` at the top of the
  builder (not cached outside it).
- The board fills a 7:4 stage. Give `functiongraph` an explicit `[fn, xmin, xmax]` range.
- **Localizing a chart.** `title` and each slider `label` may be a **function** returning the string; pull
  words from the page's `scene-strings` via `makeStrings(namespace)` and pass thunks so they resolve at
  render (after any overlay applies): `const s = makeStrings("sinLab");` then `{ …, title: () => s("title") }`.

## 3D charts: `register3dChart`

For a **3D** figure (points, vectors, surfaces) use `register3dChart(name, builder, opts)` + a
**`<primer-chart-3d scene="name">`** element. It renders a JSXGraph **View3D** projected to SVG (no WebGL,
no context cap — themeable) and is **drag-rotatable**. Sliders work as for 2D charts (name a
`registerChartSliders` group via `opts.sliders`; place a `<primer-chart-sliders>` below).

The 3D builder gets a single **toolkit** `{ view, JXG, board, colors, sliders }` and does NOT return an
`update` — like a geometry scene it reads live slider values in **functional coordinates** and the
component calls `board.update()` on every change. `view` is the themed View3D (`view.create('point3d' |
'line3d' | 'curve3d' | 'functiongraph3d' | 'scatter3d', …)`); `board` is the underlying 2D board; colours
from `themeColors()`. Axes + x/y/z labels are drawn and themed for you.

`opts`: `{ bounds = [[-5,5],[-5,5],[-5,5]], xName='x', yName='y', zName='z', title, sliders, az, el }`.

```html
<primer-chart-3d scene="vec3d"></primer-chart-3d>
<primer-chart-sliders name="vec3d"></primer-chart-sliders>

<script type="module">
  import { register3dChart, registerChartSliders } from "primer";
  registerChartSliders("vec3d", [ { name: "vx", min: -4, max: 4, step: 1, value: 3 }, /* vy, vz … */ ]);
  register3dChart("vec3d", ({ view, colors, sliders }) => {
    const O = view.create("point3d", [0, 0, 0], { visible: false, fixed: true });
    const tip = view.create("point3d", [() => sliders.vx, () => sliders.vy, () => sliders.vz],
      { size: 4, strokeColor: colors.cat[1], fillColor: colors.cat[1], withLabel: false, fixed: true, highlight: false });
    view.create("line3d", [O, tip], { strokeColor: colors.cat[1], strokeWidth: 4, straightFirst: false, straightLast: false });
  }, { bounds: [[-4.5, 4.5], [-4.5, 4.5], [-4.5, 4.5]], sliders: "vec3d", title: "a 3D vector" });
</script>
```

See `concepts/mathematics/linear-algebra/spaces/vectors-in-3d.html`. **Every `point3d` is draggable by
default** (the 3D view keeps pointer handlers so it can rotate) — always pass `fixed: true` (and
`highlight: false`) on points the learner shouldn't grab.

## Geometry — the full toolkit

(For the geometry basics — `registerGeometryScene`, `step`, `opts`, the colour rule — see CLAUDE.md.)
The builder's toolkit is `{ board, JXG, step, sliders, colors, sceneStrings, parallelMark, tickMark,
angleMark, rightAngle, extend, label, crossing, makeGraph, rng }`. Board-bound tools:

- `parallelMark(x, y, { dir = "h"|"v", along, count = 1, color })` — the "these are parallel" arrowheads
  (`count: 2` for a second, distinct parallel pair; `color` defaults to `colors.line`).
- `tickMark(p, q, { count = 1, color })` — equal-length **hatch ticks** across the middle of side `p`→`q`
  (each a `[x,y]`); `count: 2`/`3` for a second/third congruent-side group.
- `angleMark(vertex, p1, p2, { count = 1, label, color, radius })` — equal-**angle** arc(s) at `vertex`
  between the rays to `p1`/`p2`, optional `label` on the bisector (`count` draws concentric arcs).
- `rightAngle(vertex, p1, p2, { color })` — the right-angle **square** marker.
- `extend(p, q, { both, dash, color })` — an **auxiliary/extension** line through `p`→`q` past `q` (and
  past `p` if `both`), themed dashed by default.
- `label(at, text, { color, style })` — themed text at `[x,y]`; `style: "unknown"` renders the muted
  "fill me in" accent (vs `"given"`, the ink colour). Greek/`°` stay literal Unicode.
- `crossing(vertex, dirA, dirB)` — the four angles where two lines cross. Returns `{ number(corner, text,
  opts?), wedge(corner, opts?) }`, addressing an angle by screen corner (`"ul"|"ur"|"ll"|"lr"`): `number`
  writes a label inside the wedge (along its bisector); `wedge` fills/highlights it and returns the element
  (so a `step` captures it). `vertex`/`dirA`/`dirB` may each be a **function** for a slider-driven figure —
  the wedge + label re-plot live on `board.update()`.
- `makeGraph(opts?)` — for a **graph diagram** (a function on Cartesian axes): draws the standard themed
  axes (faint lines, arrowheads at the positive ends, tick numbers, `"x"`/`"y"` labels) that auto-span the
  board — the **same axes `registerCharts` uses**, so don't hand-roll `segment` axes + `"x"`/`"y"` text.
  Set the board's `boundingbox` (usually `keepAspect: false`); call `makeGraph()`; plot your curve. Options
  (see src/graph-axes.ts): `xName`/`yName` (`""` hides one), `xticks`/`yticks` (null = auto), `ticks` (false
  → unticked), `arrows` (false → no arrowheads), `xUnit`/`yUnit` (`"pi"`|`"e"` → label that axis in proper
  fractions of π/e — `π/2, π, 3π/2` — instead of decimals; pin the matching `xticks` to a π multiple). E.g.
  `makeGraph({ yName: "f(x)" })` or `makeGraph({ xUnit: "pi", xticks: Math.PI/2 })`.

See `concepts/mathematics/geometry/angle-chasing.html` for the marker tools, and `parallel-lines.html`
for a live transversal.

- **No endpoint dots**: a `segment`/`line`/`arrow` built from coordinates hides its auto-created endpoint
  points by default. To show a dot, create an explicit `point`.
- **Random scenes**: set `opts.random: true` and draw with the toolkit's **`rng`** — `rng()` → `[0,1)`,
  `rng.int(lo, hi)` (inclusive), `rng.pick(arr)` — **inside** the builder (never `Math.random()`). This
  shows a **Refresh** button that re-draws a fresh example; the `rng` is seeded per run (Refresh bumps the
  seed). See `concepts/mathematics/arithmetic/operations/number-bonds.html`.
- **Controls**: « Rewind · ‹ Prev · k/N · Next › · » Skip-to-end · Play · [**Refresh** — random only] ·
  **All steps** (Expand → a vertical comic-strip of every step). Add **`no-controls`** to hide the bar for
  an externally-driven figure.
- **External sliders** (no draggable points): `opts.sliders = "groupName"` (a `registerChartSliders` group
  rendered by a separate `<primer-chart-sliders name="groupName">`); the builder gets live values as
  `sliders` — read them in **functional coordinates** so the figure re-plots as they move:
  `board.create("point", [() => r * Math.cos(sliders.t * DEG), () => r * Math.sin(sliders.t * DEG)])`.
- **External control / manim sync**: the element exposes `goTo(k)`, `next()`, `prev()`, `play()`,
  `reset()`, and `step`/`stepCount`, and fires `primer:geometry-step` `{ detail: { name, step, stepCount } }`.
  A manim scene can `document.querySelector('primer-geometry[scene="x"]').goTo(k)` to drive a proof in
  lockstep. See `concepts/mathematics/geometry/parallel-lines.html`.

## Interactive theorem practice (`registerGeometryProblem` + `<primer-geometry-problem>`)

For a figure the learner **works**, not just watches — an "apply-the-theorem" angle chase — use
`<primer-geometry-problem name="…">` + `registerGeometryProblem(name, config)`. Problems are **generated
by a forward-chaining theorem engine** (`src/geometry-engine/*`, pure + unit-tested): it picks a scaffold
(a parametric figure), synthesises a fresh figure with some angles **given** and others **blank** plus an
ordered solution chain, and is **different every Refresh**. The usable theorem pool is **gated by the
page's prerequisite-DAG closure** — a problem only chains theorems taught in the lessons leading to this
page (each engine rule names the lesson `conceptId` that teaches it).

```html
<primer-geometry-problem name="angleChase"></primer-geometry-problem>
<script type="module">
  import { registerGeometryProblem } from "primer";
  registerGeometryProblem("angleChase", {
    generate: { scaffolds: ["parallelTransversal"], minSteps: 2, maxSteps: 4 },
  });
</script>
```

- **`config.generate`**: `{ scaffolds: string[], minSteps?, maxSteps?, theorems?, pageId? }`. `scaffolds`
  are engine scaffold names (v1: `"parallelTransversal"`, `"triangle"`). `theorems` (optional) pins the
  rule pool explicitly (else DAG-gated); `pageId` overrides the page id. v1 generates **angle** chases.
- **The learner** fills in EVERY unknown angle via on-figure **MathLive `<math-field>`** boxes (angle boxes
  pop the `geometry-angles` keyboard, length boxes `geometry-lengths`), with the highlighted box the final
  target; a **construction toolbar** (draw line · mark ∥ · mark = · right ∟ · undo) is available. **Check**
  grades every box, requires the target correct, colour-codes by step; **Refresh** rolls a new problem;
  **Reset** clears.
- **Embed in a quiz** as a `{ problem: "name" }` question: it renders inline, hides its own Check (the
  quiz's drives it), and folds `solved`/not into the scorecard.
- Colours from `themeColors()`. The board is **interactive** (the one place a Primer figure keeps
  JSXGraph's pointer handlers). Showcase: `concepts/mathematics/geometry/angle-chasing.html`.

## "Write a program" exercises (`registerProgram` + `<primer-program>`)

For a **coding** exercise — the learner writes a program, we test it on data — use `<primer-program
name="…">` + `registerProgram(name, config)`. Each attempt (and each **New input**) hands the learner a
**random value in the global `INPUT`**; they write TypeScript that reads `INPUT` and assigns the global
**`ANSWER`**. We wrap + transpile + run it in the QuickJS sandbox (same engine as `<primer-code run>` — no
DOM/network, ~1 s timeout) and grade the reported `ANSWER` against a reference `solution` (numbers with a
small tolerance; arrays/objects compared structurally; a numeric string like `"10"` accepted for `10`).

```html
<primer-program name="sumArray"></primer-program>
<script type="module">
  import { registerProgram } from "primer";
  registerProgram("sumArray", {
    prompt: "Add up all the numbers in the list INPUT and store the total in ANSWER.",
    variables: "n=[3:6]",                                   // optional: drawn each attempt
    input: (b, rng) => Array.from({ length: b.n }, () => rng.int(1, 9)),  // → the INPUT value
    solution: (INPUT) => INPUT.reduce((a, c) => a + c, 0),  // → the reference ANSWER
    starter: "let total = 0;\nfor (const x of INPUT) total += x;\nANSWER = total;",
  });
</script>
```

- **`config`**: `{ prompt?, variables?, input, solution, starter? }`. `input(bindings, rng)` builds the
  INPUT from the drawn `variables` bindings (+ a seeded `rng`); `solution(INPUT, bindings)` returns the
  correct `ANSWER`. `prompt` is the task (a function to localize it); `starter` is the initial editor code
  (language-neutral — keep it inline). INPUT/ANSWER are globals — the learner must **not** redeclare them.
- **The learner** edits the code, presses **Run** (console.log + the resulting `ANSWER`) or **Check** to
  grade; **New input** rolls a fresh INPUT, **Reset code** restores the starter.
- **Embed in a quiz** as a `{ program: "name" }` question: renders inline, hides its own Check + New-input,
  folds correct/incorrect into the scorecard; its `check()` is async (the quiz awaits it). Showcase:
  `concepts/instructors/quizzes.html`.

## `<primer-code>` internals

The core (TypeScript, `run`, escaping) is in CLAUDE.md. Internals: `run` transpiles the TS with **sucrase**
(`src/transpile.ts`) then runs the JS in a **QuickJS-WASM** sandbox (`src/quickjs.ts` + `src/run-js.ts`), both
lazy-loaded from esm.sh on first Run. The Code pane is an editable overlay editor (line-number gutter,
horizontal scroll, Reset button). Highlighter: `src/code-highlight.ts` (typescript default; js/python/sql/
text). See the `runnable-code-architecture` memory for CDN gotchas.

## Quiz — advanced reference

(The quiz core — `registerQuiz`, config item, ≥10 questions, `variables` spec, `prompt`/`text`/`answer`
forms, `{expr}` evaluation, `constraints`, MC-with-variables — is in CLAUDE.md.)

### The prose/maths split (the i18n contract)
Route every translatable string through `sceneStrings("key")` (its English lives in the quiz's
`scene-strings` block; an overlay supplies the translation). Keep language-neutral maths as **inline
literals** in the builder. So a translation overlay carries only the translated `scene-strings` — never
the bank — and an all-maths quiz needs no translation at all.

**A `sceneStrings` string only interpolates simple `{name}` placeholders — never expressions.** A
*translatable* string is filled by `fillVars`, which substitutes a bare `{name}` and nothing else. So
`sceneStrings("q", v)` on `"the number ${10*t + o}$"` does **not** compute — it renders the literal
`10*t+o`. (This is the opposite of a *literal* `prompt`/`text`/`answer` string, whose `{…}` the quiz engine
evaluates, because those aren't translated.) When a prompt must show a *computed* value, precompute it in
the builder and pass it as a named variable: `prompt: (v) => sceneStrings("q", { ...v, n: 10*v.t + v.o })`
with `"q": "the number ${n}$…"`. Keep literal braces with the `{{…}}` escape. `npm run check` enforces
this: a scene-string containing a `{…}` expression over the quiz's variables fails the build, and every
locale overlay must reference the **same** `{placeholders}` as its English source.

**Localized prose must be a function**, so it can call `sceneStrings("key", v)` (passing `v` interpolates a
`{name}` placeholder in the translated string). A literal `answer` returning text can localize via
`() => sceneStrings("capital")`.

### `compare: "polynomial"`
Grades the answer by **algebraic equivalence** via the CortexJS Compute Engine (lazy-loaded), so any
equivalent form is accepted — factored, reordered, fractions, etc. (`(x+3)(x+4)` ≡ `x^2+7x+12`). The box
becomes a MathLive math editor (type `^` for an exponent). `answer` is the expected expression as a string:
`{ prompt: () => \`${sceneStrings("expand")} $(x+3)(x+4)$\`, answer: "x^2 + 7x + 12", compare: "polynomial" }`.
Offline it falls back to a simple expanded-polynomial comparator. Keyboard defaults to `algebra-basic`; set
`keyboard: "<name>"` for a different per-module keyboard (see src/math-keyboards.ts).

### Figure / chart / geometry / problem / program options
- **Chart / geometry options** (choices are figures, not text): give an option a `chart` (a registered
  chart-scene name) **or** a `geometry` (a registered geometry-scene name) instead of `text`; it renders as
  a small `<primer-chart>` / `<primer-geometry>` figure in a 2-column grid; `correct` works the same.
  Figure options carry no `text`, so they need no translation. Example:
  `{ prompt: () => sceneStrings("whichParallel"),
     options: [ { geometry: "optParallel", correct: true }, { geometry: "optCrossing", correct: false } ] }`.
- **A figure above the prompt**: add `figure: "sceneName"` to any question to render a `<primer-geometry>`
  (read-only) **above** the prompt. Pair a free-text geometry answer with `keyboard: "geometry-angles"`
  (digits, `°`, `+ − × ÷`, parens, `x α β θ`) or `keyboard: "geometry-lengths"` (digits, `√`, four
  operations, `x`); a numeric angle answer accepts `70`, `70°` or `70 degrees` (the `°` is stripped before
  grading). See `src/math-keyboards.ts`.
- **`{ problem: "name" }`** — embeds a `registerGeometryProblem` sandbox and folds its solved/unsolved
  state into the score (no options/answer).
- **`{ program: "name" }`** — embeds a `registerProgram` sandbox and folds correct/incorrect into the score
  (no options/answer); its `check()` runs the sandbox asynchronously, so "Check answers" grades it after a
  short run.

## Helpers re-exported from `primer` (for inline scripts)

`registerManimScene`, `getManimScene`, `registerChart`, `getChart`, `register3dChart`, `get3dChart`,
`registerCharts`, `registerChartSliders`, `computeRange`, `registerGeometryScene`, `getGeometryScene`,
`registerGeometryProblem`, `getGeometryProblem`, `registerProgram`, `getProgram`, `registerQuiz`,
`getQuiz`, `speak`, `cancelSpeech`, `themeColors`, `makeStrings`, `getConceptMeta`, `parseConceptMeta`,
`BASE_LEVEL`, `maxLevel`, `formatLevel`, the theme API (`THEMES`, `getTheme`, `applyTheme`, `initTheme`),
and the graph helpers (`resolveLevels`, `validateGraph`, …). Pinned KaTeX/manim-web/JSXGraph versions live
in `src/boot.ts`.

## Themes & page chrome (automatic)

You don't author any of this per page. `boot.js` applies the saved theme (light / dark / fun) with no
flash and mounts a top-right hamburger menu (the theme switcher). Colours come from `--primer-*` tokens
defined per theme in `css/primer.css`, so headings, cards, the explorer and badges re-theme themselves; the
only theme-coupled JS is animations (use `themeColors()`). Levels start at 0; a real number that propagates
via `max`.

`render.js` also frames each lesson automatically: the mini-explorer (`<primer-pathway>`) at the **top**,
and an auto-generated **"Up next…"** recommendation control (`<primer-up-next>`, backed by `src/up-next.ts`)
at the **bottom**. Authors don't write or configure either.

## Localization (automatic)

The hamburger menu carries a language switcher; English is the default + fallback. A lesson's translation
lives in a per-locale **overlay** at `i18n/<locale>/<id>.html`. An overlay is just the **translatable top
part**: a translated `<primer-title>`, the translated cards, and the `scene-strings` — **no `concept-meta`
and no module scripts** (those are canonical-only). It records which English version it was translated from
in a single trailing **`<!-- sourceHash: … -->` comment after `</html>`**. `src/render.ts` fetches and swaps
the overlay in when the locale isn't English. `npm run i18n:check` flags stale/missing overlays (and prints
the hash to stamp into that comment).

**Convention:** put each `scene-strings` block **directly before the card (or element) that uses it** — on
both the canonical page and its overlays — so the strings travel with the prose they annotate. One block
per scene/chart/quiz namespace; `makeStrings` merges them.

The active locale is resolved + persisted (`localStorage["primer:locale"]`) in three in-step places: the
synchronous pre-paint scripts in `src/boot.ts` and `index.html`, and the shared post-paint `initLocale()` in
`src/i18n.ts`. Two URL entry points:
- **`?lang=<locale>`** — a shareable "open in this language" link: it wins over storage/browser, is
  **persisted**, then stripped from the URL so a later menu switch can't snap back.
- **Direct visit to an overlay URL** (`/i18n/<locale>/<id>.html`) — `boot.js` redirects to the canonical
  lesson with `?lang=<locale>`.

## Accessibility — full checklist

The Primer is for "ages 5 to 105," so lessons must work with a keyboard, a screen reader, and
reduced-motion / high-zoom settings. Most machinery is already wired (real semantic controls, a global
skip link + `.sr-only` utility, a `:focus-visible` ring, a `prefers-reduced-motion` reset in
`css/primer.css`, focus-trapped modals via `src/focus-trap.ts`), so authoring correctly is mostly about
**not breaking** these. There's **no automated a11y gate** — this is the checklist. The public
**accessibility statement** lives at `accessibility.html`; keep its "known limitations" list honest.

- **Real controls, real semantics.** Anything clickable is a `<button>`/`<a>`/`<input>`, never a clickable
  `<div>`. Give an icon-only control an `aria-label`; mark decorative SVGs/emoji `aria-hidden="true"` (and
  `focusable="false"` on SVG).
- **Colour is never the only signal.** The confidence ramp, quiz correct/incorrect, course tint, etc. must
  each pair colour with text/shape/ARIA state (see the confidence stars' `aria-pressed` + live-region
  readout in `src/components/primer-concept.ts`). Use only `--primer-*` tokens; new token pairs (text on a
  fill) must clear **WCAG AA 4.5:1** in all three themes.
- **Give figures a text alternative.** Author a real `alt` on `<img>` (`""` if decorative); a
  `<primer-manim>`/`<primer-chart>`/`<primer-geometry>` should carry a `caption` (and manim narration via
  `speak`) describing what it shows.
- **Respect reduced motion.** Any bespoke animation/transition must be gated behind
  `@media (prefers-reduced-motion: reduce)` (a new component shadow sheet needs its own block — see
  `src/components/shared.ts`).
- **Keyboard + focus.** Every interactive element must be reachable and operable by keyboard with a visible
  focus ring, and modal surfaces must trap focus and restore it on close (`trapFocus`).
- **Localize a11y text too.** Route `aria-label`/status strings through `t(...)` (chrome) or `sceneStrings`
  (lesson).

Per-PR quick check: Tab through the page (skip link first, visible ring, nothing unreachable); toggle OS
"reduce motion"; zoom to 200%; spot-check with a screen reader that figures, math, and state changes are
announced.
