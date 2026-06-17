# The per-page toolchain (one include)

Every concept page is a plain `.html` file that loads the Primer toolchain at
runtime — **no build step**. A page has **no `<head>` at all**: just the concept
metadata, the content cards, and one script tag. Everything the head used to hold —
the title, viewport, stylesheets, the
[import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap),
custom-element registration, and the page shell — is handled by
[`/js/boot.js`](../js/boot.js). (The charset comes from the server's
`Content-Type: text/html; charset=utf-8` header.)

## Authoring a page

```html
<!doctype html>
<html lang="en">
  <body>
    <!-- 1) The whole toolchain, in one tag — always first in the body. -->
    <script src="/js/boot.js"></script>

    <!-- 2) The concept's metadata (see below). -->
    <script type="application/json" class="concept-meta">
      {
        "id": "arithmetic/addition",
        "title": "Addition",
        "prerequisites": ["arithmetic/counting"]
      }
    </script>

    <!-- 3) The content, as one or more cards. -->
    <primer-card>
      <p>Addition combines two amounts into one total …</p>
      <primer-math display>a + b = c</primer-math>
    </primer-card>
  </body>
</html>
```

`boot.js` injects the viewport, the CSS, and the import map, and loads the renderer.
The renderer reads the `concept-meta` block, sets the document title, and wraps your
cards in the page shell (the title with its level badge to the right; a self-attested
confidence control; and a footer). Prerequisites are not shown on the page — the
knowledge graph surfaces them. You write only the metadata and the cards — no
`<head>`, no `<primer-page>`/`<primer-concept>` wrappers.

## The metadata block

Every page must include a **metadata block** — the single source of truth for the
concept's place in the knowledge tree. Its `id` must equal the page's path under
`concepts/` (without `.html`):

```html
<script type="application/json" class="concept-meta">
  {
    "id": "arithmetic/addition",
    "title": "Addition",
    "prerequisites": ["arithmetic/counting"],
    "declaredLevel": 2.5,
    "root": false
  }
</script>
```

`prerequisites` defaults to `[]`, `declaredLevel` is optional (levels start at 0 and
propagate downstream), and `root: true` marks an entry point. Two further optional
fields aid curation and are surfaced by the graph tool: `completedDate` and
`needsReviewDate`, each an ISO `YYYY-MM-DD` string. The page's Web Components and the
[`scripts/build-graph.js`](../scripts/build-graph.js) validator both read this block.

## Inside the body

Author content as one or more `<primer-card>` cards. Inside a card you can use the
Primer custom elements: `<primer-math>`, `<primer-manim>`, `<primer-quiz>`.

A quiz is authored inline — its question bank is a child
`<script type="application/json">`, an array of questions. `count` of them are
chosen at random and their options shuffled; prompts and option text may contain
inline math wrapped in `$…$`:

```html
<primer-quiz count="3">
  <script type="application/json">
    [
      {
        "prompt": "What is $2 + 3$?",
        "options": [
          { "text": "$5$", "correct": true },
          { "text": "$6$", "correct": false }
        ]
      }
    ]
  </script>
</primer-quiz>
```

A page that shows an animation registers a manim-web scene with one inline module
script, then references it from a `<primer-manim scene="…">`. Because `boot.js` is
first in the body, the import map is already present, so the scene's bare `"primer"`
import just works:

```html
<primer-card>
  <primer-manim scene="addNumberLine" caption="Counting on"></primer-manim>
</primer-card>

<script type="module">
  import { registerManimScene } from "primer";
  registerManimScene("addNumberLine", async (host, manim) => { /* … */ });
</script>
```

A scene can also narrate aloud with `speak(text)` (re-exported from `primer`), which
uses the browser's built-in speech and resolves when the phrase finishes — so it can
be awaited in lockstep with `scene.play(...)`. Speech only starts on the Play click
(per browser autoplay rules) and is silently skipped where unsupported; replaying
cancels any in-progress narration.

```js
import { registerManimScene, speak } from "primer";
registerManimScene("countOne", async (host, manim) => {
  const scene = new manim.Scene(host);
  await Promise.all([scene.play(/* … */), speak("one")]);
});
```

## Notes

- **Versions are pinned in one place** — [`js/boot.js`](../js/boot.js) holds the
  pinned `katex` and `manim-web` versions. Bump them there; pages never mention them.
- **Self-hosting later** is a drop-in change: copy the pinned bundles under
  `/vendor/` and point the URLs in `js/boot.js` there. No page changes required.
- **`boot.js` is a classic, render-blocking script on purpose.** Put it first in the
  body. It injects the import map synchronously where it sits, so being first
  guarantees the map is in the DOM before the concept-meta block, the cards, or any
  inline scene module (`import … from "primer"`) is parsed. It also sets `data-theme`
  on `<html>` synchronously (from the saved choice or the OS preference) so there is no
  flash of the wrong theme, and mounts the top-right theme menu — pages author nothing
  theme-related.
- **Type-checking** the JS (`npm run typecheck`, i.e. `tsc --noEmit`) reads KaTeX's
  and manim-web's bundled `.d.ts` files, so you get full IntelliSense and checking
  against their APIs even though we author plain `.js`.
