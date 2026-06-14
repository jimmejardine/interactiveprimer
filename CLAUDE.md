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

## Authoring elements (use inside `<primer-card>`)

- `<primer-card>` — top-level content block; use one or more per page.
- `<primer-math>` — LaTeX. Body text is the source: inline by default, block with the
  `display` attribute. e.g. `<primer-math display>\int_0^1 x\,dx</primer-math>`.
- `<primer-manim scene="name" caption="…">` — plays a registered animation on a Play
  button (lazy-loads manim-web; supports replay). See scenes below.
- `<primer-quiz count="3">` — a random multiple-choice test. Author the bank inline:

  ```html
  <primer-quiz count="3">
    <script type="application/json">
      [
        { "prompt": "What is $2 + 3$?",
          "options": [
            { "text": "$5$", "correct": true },
            { "text": "$6$", "correct": false }
          ] }
      ]
    </script>
  </primer-quiz>
  ```

  `count` questions are picked at random and their options shuffled. Prompts and
  option text may contain inline LaTeX delimited by `$…$`.

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
- manim-web is young (v0.3.x): keep scenes simple, and the component shows a friendly
  message if a scene throws, so prefer small, defensive scenes.

## Helpers re-exported from `primer` (for inline scripts)

`registerScene`, `getScene`, `speak`, `cancelSpeech`, `getConceptMeta`,
`parseConceptMeta`, `BASE_LEVEL`, `maxLevel`, `formatLevel`, and the graph helpers
(`resolveLevels`, `validateGraph`, …). Pinned KaTeX/manim-web versions live in
`js/boot.js`.

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
