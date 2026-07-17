# src/components/ — the Primer custom elements

One file per web component; importing a file registers its element (all of them are pulled in by
`../primer.ts`). These are what authors write in concept pages: `<primer-card>`, `<primer-math>`,
`<primer-quiz>`, `<primer-geometry>`, `<primer-chart>`, `<primer-manim>`, `<primer-code>`,
`<primer-video>`, `<primer-ref>`, … plus the page chrome built automatically (`<primer-concept>`,
`<primer-pathway>`, `<primer-menu>`, `<primer-up-next>`).

Shared helpers: `shared.ts` (element registration/await, escaping, common CSS snippets),
`jsxgraph-board.ts` (the JSXGraph board wrapper behind charts/geometry), `slider-panel.ts`,
`code-editor-css.ts`. Styling uses only `--primer-*` tokens so every element re-themes; heavy
libraries are loaded lazily inside the component that needs them, so a page without (say) a manim
scene never downloads manim.
