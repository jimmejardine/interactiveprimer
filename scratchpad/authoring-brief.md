# Authoring brief — MSc "Networks, the Internet & Distributed Programming" lesson pages

You are authoring lesson pages for an existing educational site (Interactive Primer). **Before writing,
READ these files** to internalise conventions:

1. `D:\Repos\interactiveprimer\CLAUDE.md` — the authoring rules (MANDATORY).
2. `D:\Repos\interactiveprimer\concepts\computer-science\distributed-systems\the-cap-theorem.html` — a
   benchmark page (depth, prose, a geometry diagram, vignettes, a big quiz).
3. `D:\Repos\interactiveprimer\concepts\computer-science\networks\programming\the-socket-api.html` — the
   reference page for THIS course (runnable code + two-column geometry timeline + quiz). Match this quality.

## Audience & depth
Master's (MSc) level, but taught the Primer way: a warm real-world hook, ideas in multiple representations,
worked examples, one or two `<primer-vignette>` digressions (INCLUDING a `<primer-vignette title="Watch
out!">` naming a classic misconception), a visual aid where it helps, and a **randomised `<primer-quiz>`
with ≥12 questions in the bank** (only ~6 drawn). A page that is just an intro + a quiz is too thin — go
deep. Vary the structure page to page; do NOT use an identical template each time.

## Hard rules (from CLAUDE.md — do not violate)
- Page skeleton EXACTLY: `<!doctype html><html lang="en"><body>` → FIRST element `<script src="/js/boot.js"></script>`
  → `<primer-title>…</primer-title>` → `<primer-card>`s. Do NOT write `<head>`, `<main>`, `<primer-page>`.
- The `concept-meta` JSON block and every `<script type="module">` go AFTER `</html>`.
- NO `id` and NO `title` in concept-meta (id = file path minus .html; title = the `<primer-title>` element).
- **Do NOT set `declaredLevel`** on any page (levels deferred for this new course). Add `completedDate: "2026-07-10"`.
- `prerequisites` array: use EXACTLY the ids given in your page spec. These are backward edges (point to
  concepts this page builds on). Never invent an id.
- **Colour rule**: in ANY chart/geometry, colours come ONLY from `const colors = themeColors()` passed into
  the builder as `colors` — use `colors.bg/ink/line/cat[0]/cat[1]/…`. NEVER hardcode hex/rgb/hsl or named
  colours. Give every element an explicit theme colour. In JSXGraph, text colour = `strokeColor`.
- **Code blocks**: write examples in TypeScript. In `<primer-code>` bodies, ESCAPE `<` `>` `&` as `&lt;`
  `&gt;` `&amp;`. Add `run` ONLY to complete, output-producing examples whose logic is pure (no DOM, no
  network, no real sockets — QuickJS sandbox, `console.log` is the only output). Good runnable demos:
  simulate a sliding window, compute a CRC/checksum, parse an HTTP request string, run AIMD arithmetic,
  hash into a consistent-hashing ring, frame/deframe a byte stream. Illustrative socket/server code that
  can't really run should be a NON-run `<primer-code>` block.
- `<primer-math>` for LaTeX (inline default, `display` for block). `<primer-theorem name="…">` ONLY for
  stating an actual theorem/law/definition (multiple claims → `<ul>` bullets). Warnings/misconceptions go in
  a `<primer-vignette title="Watch out!">`, NOT a theorem.
- A `scene-strings` block (`<script type="application/json" class="scene-strings">`) sits DIRECTLY BEFORE
  the card/element that uses it; route translatable strings for scenes/quizzes through `sceneStrings("key")`.
- Place `<primer-quiz name="…@1">` directly (NOT inside a primer-card, no heading around it).

## Quiz authoring pitfalls (these break pages — avoid)
- Quiz `variables` tokens are whitespace-free: `a=[1:10] b=[1:10]`; ranges `[lo:hi]` int, `[lo;hi]` real,
  `[x,y,z]` choice. A choice value cannot contain a space — use `_` (renders as a space). Don't name a
  variable `max`/`min`/other evaluator functions.
- Multiple-choice options: exactly one `correct: true` per question. Keep distractors plausible.
- Route a translatable `preamble`/`prompt`/instructions through `sceneStrings`; keep pure maths literal.
- Version the quiz name with `@1`.

## Geometry / chart quick reference
- Geometry figure: `<primer-geometry scene="name" caption="real text alt"></primer-geometry>` +
  `registerGeometryScene("name", ({board, step, colors, sceneStrings, label}) => {…}, {boundingbox:[xmin,ymax,xmax,ymin], keepAspect, title: () => makeStrings("name")("title")})`.
  `step(caption, fn)` tags elements for reveal; base content (no step) is always visible. For a segment/line
  from raw coords, endpoints auto-hide (add an explicit `point` for a visible dot). Numbers/Greek/° stay
  literal Unicode. A random figure must show on load (use base content or `playOverlay: true`).
- Chart (function on axes): `<primer-chart scene="name"></primer-chart>` + optional
  `<primer-chart-sliders name="grp">` BELOW it. `registerCharts([{name, f, line, legend}], {xmin,xmax,ymin,ymax,…}, slidersArg)`.
  `f: (x, sliders) => y` or array of such. Same colour rule. For a growing curve set explicit ymin/ymax.
- Import from "primer": `registerGeometryScene, registerCharts, registerChartSliders, registerQuiz, makeStrings, themeColors`.
- EVERY chart/geometry needs a real `caption` (text alternative).

## Output
Write each page to its exact path under `D:\Repos\interactiveprimer\concepts\`. The path IS the id.
Use `<primer-ref soft to="…">` for see-also links to other concepts (must be a real existing id or one of
the course's pages). For a concept not yet written, use `<primer-ref todo to="label">text</primer-ref>`.
Do NOT run npm/graph — the coordinator validates at the end. Just write correct, deep, varied pages.
