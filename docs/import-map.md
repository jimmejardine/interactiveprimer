# The per-page toolchain (import map)

Every concept page is a plain `.html` file that loads the Primer toolchain at
runtime — **no build step**. The mechanism is a native browser
[import map](https://developer.mozilla.org/docs/Web/HTML/Element/script/type/importmap)
plus a single shared module.

Paste this identical block into the `<head>` of every concept page:

```html
<!-- KaTeX font CSS (glyphs) -->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
/>

<!-- Resolve the Primer toolchain's bare imports -->
<script type="importmap">
  {
    "imports": {
      "katex": "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.mjs",
      "manim-web": "https://cdn.jsdelivr.net/npm/manim-web@0.3.18/dist/manim-web.browser.js",
      "primer": "/js/primer.js"
    }
  }
</script>

<!-- Register the custom elements -->
<script type="module">
  import "primer";
</script>
```

Every concept page must also include a **metadata block** — the single source of
truth for the concept's place in the knowledge tree. Its `id` must equal the page's
path under `concepts/` (without `.html`):

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

Then write the page body with the Primer custom elements
(`<primer-page>`, `<primer-concept>`, `<primer-math>`, `<primer-manim>`,
`<primer-quiz>`).

## Notes

- **Versions are pinned** (`katex@0.16.11`, `manim-web@0.3.18`) so pages are
  reproducible. Bump them in one place: this file and the page templates.
- **Self-hosting later** is a drop-in change: copy the pinned bundles under
  `/vendor/` and point the import-map URLs there. No code changes required.
- **Type-checking** the JS (`npm run typecheck`, i.e. `tsc --noEmit`) reads
  KaTeX's and manim-web's bundled `.d.ts` files, so you get full IntelliSense and
  checking against their APIs even though we author plain `.js`.
