# The per-page toolchain (one include)

Every concept page is a plain `.html` file that loads the Primer toolchain at
runtime — **no build step**. A page needs only **one** script tag plus its concept
metadata; everything else (stylesheets, the
[import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap),
custom-element registration, and the page shell) is handled by
[`/js/boot.js`](../js/boot.js).

## Authoring a page

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Addition — Interactive Primer</title>

    <!-- 1) The whole toolchain, in one tag. -->
    <script src="/js/boot.js"></script>

    <!-- 2) The concept's metadata (see below). -->
    <script type="application/json" class="concept-meta">
      {
        "id": "mathematics/arithmetic/addition",
        "title": "Addition",
        "prerequisites": ["mathematics/arithmetic/counting"]
      }
    </script>
  </head>
  <body>
    <!-- 3) The content, as one or more cards. -->
    <primer-card>
      <p>Addition combines two amounts into one total …</p>
      <primer-math display>a + b = c</primer-math>
    </primer-card>
  </body>
</html>
```

`boot.js` injects the CSS and import map and loads the renderer, which reads the
`concept-meta` block and wraps your cards in the page shell (header with subject,
level badge and prerequisite links; the title; a self-attested confidence control;
and a footer). You write only the cards — no `<primer-page>`/`<primer-concept>`
wrappers.

## The metadata block

Every page must include a **metadata block** — the single source of truth for the
concept's place in the knowledge tree. Its `id` must equal the page's path under
`concepts/` (without `.html`):

```html
<script type="application/json" class="concept-meta">
  {
    "id": "mathematics/arithmetic/addition",
    "title": "Addition",
    "prerequisites": ["mathematics/arithmetic/counting"],
    "declaredLevel": 2.5,
    "root": false
  }
</script>
```

`prerequisites` defaults to `[]`, `declaredLevel` is optional (levels start at 0 and
propagate downstream), and `root: true` marks an entry point. The page's Web
Components and the [`scripts/build-graph.js`](../scripts/build-graph.js) validator
both read this block.

## Inside the body

Author content as one or more `<primer-card>` cards. Inside a card you can use the
Primer custom elements: `<primer-math>`, `<primer-manim>`, `<primer-quiz>`.

A page that shows an animation registers a manim-web scene with one inline module
script, then references it from a `<primer-manim scene="…">`:

```html
<primer-card>
  <primer-manim scene="addNumberLine" caption="Counting on"></primer-manim>
</primer-card>

<script type="module">
  // The bare "primer" specifier resolves against the import map boot.js injected.
  import { registerScene } from "primer";
  registerScene("addNumberLine", async (host, manim) => { /* … */ });
</script>
```

## Notes

- **Versions are pinned in one place** — [`js/boot.js`](../js/boot.js) holds the
  pinned `katex` and `manim-web` versions. Bump them there; pages never mention them.
- **Self-hosting later** is a drop-in change: copy the pinned bundles under
  `/vendor/` and point the URLs in `js/boot.js` there. No page changes required.
- **`boot.js` is a classic, render-blocking script on purpose.** It runs in `<head>`
  before the parser reaches the body, so the import map is in place before any module
  script (including an inline scene script) resolves its bare imports.
- **Type-checking** the JS (`npm run typecheck`, i.e. `tsc --noEmit`) reads KaTeX's
  and manim-web's bundled `.d.ts` files, so you get full IntelliSense and checking
  against their APIs even though we author plain `.js`.
