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
- `<primer-chart scene="name">` — a manim **chart** (a function plotted on axes). Two modes:
  **static** (no body) draws once; **interactive** carries sliders + number boxes that re-plot
  the curve live. Add the controls with an inline `params` config and read them in the chart
  builder. See charts below.
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
  - `"compare": "polynomial"` grades the answer as a single-variable polynomial: term order
    and spacing don't matter, and the box becomes a MathLive math editor (type `^` for an
    exponent). `answer` is the expanded polynomial as a string, e.g.
    `{ "prompt": "Expand $(x+3)(x+4)$", "answer": "x^2 + 7x + 12", "compare": "polynomial" }`.
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
  import { registerScene, speak } from "primer";

  registerScene("addNumberLine", async (host, manim) => {
    const { Scene, Circle, Create } = manim;       // `manim` = manim-web namespace
    const scene = new Scene(host);                  // `host` = element to draw into
    await Promise.all([                             // animate and narrate in lockstep
      scene.play(new Create(new Circle())),
      speak("Start at a, then count on."),
    ]);
  });
</script>
```

- `speak(text, { rate, pitch, lang })` returns a Promise that resolves when narration
  finishes (silent no-op if the browser lacks speech). `cancelSpeech()` stops it; the
  manim component already cancels speech on replay.
- **NEVER pick your own colours — always use the theme.** A scene must take every colour from
  `const v = vizColors()` (imported from `primer`). Do **not** use manim's named colour
  constants (`BLUE`, `RED`, `WHITE`, …), do **not** hardcode hex/`hsl`/`rgb`, and do **not**
  write an `|| BLUE`-style fallback (`vizColors()` always returns valid colours). This is what
  keeps every diagram on-theme and mutually consistent, and re-themes them on a theme change.
  `vizColors()` returns `{ bg, ink, line, cat }`: `bg` backdrop, `ink` for labels/text, `line`
  for axes/strokes/number lines, and `cat` — an **ordered categorical palette** (a generated
  golden-angle sequence, so early entries are maximally distinct). Take `v.cat[0]`, `v.cat[1]`,
  … in order so all diagrams share the same colours. A replay after a theme change re-reads them.
- **No animation item should be colourless.** Give every mobject an explicit theme colour
  (`v.cat[i]`, `v.line`, or `v.ink`). manim's defaults are white and vanish on light themes
  — e.g. a `NumberLine` with no `color` is invisible on the light backdrop. Watch sub-parts:
  a `NumberLine`'s `color` is the **stroke** (line + ticks) only — its number labels are
  filled text and must be coloured separately, e.g.
  `for (const l of line.getNumberLabels?.() ?? []) { l.setColor?.(v.ink); l.setFill?.(v.ink, 1); }`.
- manim-web is young (v0.3.x): keep scenes simple, and the component shows a friendly
  message if a scene throws, so prefer small, defensive scenes.

## Charts (interactive manim plots)

A **chart builder** is registered with `registerChart(name, builder)` and referenced by a
`<primer-chart scene="name">`. Unlike an animated scene, a builder sets up its `Scene` + `Axes`
**once** and returns an `update(params)` the component calls — initially, on every control
change, and after a theme change. Reusing one `Scene` (re-plotting only the curve) avoids
spinning up a new WebGL context per change.

```html
<primer-chart scene="sinLab">
  <script type="application/json">
    { "params": [ { "name": "A", "label": "Amplitude (A)", "min": 0, "max": 3, "step": 0.1, "value": 1 } ] }
  </script>
</primer-chart>

<script type="module">
  import { registerChart, vizColors } from "primer";
  registerChart("sinLab", (host, manim) => {
    const { Scene, Axes } = manim;
    const v = vizColors();
    const scene = new Scene(host);
    const axes = new Axes({ xRange: [-6.28, 6.28, 1.57], yRange: [-3, 3, 1], color: v.line, tips: false });
    scene.add(axes);
    let curve = null;
    return (p) => {                                   // p = current control values, e.g. { A: 2 }
      if (curve) scene.remove(curve);
      curve = axes.plot((x) => (p.A ?? 1) * Math.sin(x), { color: v.cat[0], strokeWidth: 4, numSamples: 200 });
      scene.add(curve);                                // autoRender redraws
    };
  });
</script>
```

- Same colour rule as scenes: **every** colour from `vizColors()` (axes `v.line`, curves
  `v.cat[i]`), never a manim constant or hardcoded value. Omitting axis number labels keeps
  small charts clean (and dodges the white-label default).
- A **static** chart (no `params` config / a builder whose `update` ignores `p`) draws once —
  this is what quiz **chart options** use.
- Keep the number of live charts modest (each is a WebGL context; browsers cap ~16). The
  component disposes its context on disconnect.

## Helpers re-exported from `primer` (for inline scripts)

`registerScene`, `getScene`, `registerChart`, `getChart`, `speak`, `cancelSpeech`, `vizColors`, `getConceptMeta`,
`parseConceptMeta`, `BASE_LEVEL`, `maxLevel`, `formatLevel`, the theme API (`THEMES`,
`getTheme`, `applyTheme`, `initTheme`), and the graph helpers (`resolveLevels`,
`validateGraph`, …). Pinned KaTeX/manim-web versions live in `js/boot.js`.

## Themes & page chrome (automatic)

You don't author any of this per page. `boot.js` applies the saved theme (light / dark /
fun) with no flash and mounts a top-right hamburger menu (the theme switcher). Colours come
from `--primer-*` tokens defined per theme in `css/primer.css`, so headings, cards, the
explorer and badges re-theme themselves; the only theme-coupled JS is animations (use
`vizColors()` above). Levels start at 0; a real number that propagates via `max`.

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
