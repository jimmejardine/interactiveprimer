# css/ — the hand-authored stylesheet

`primer.css` is the site's single look-and-feel stylesheet: the `--primer-*` design tokens (per
theme: light / dark / fun), the page shell, cards, and per-component styling that lives outside
shadow roots. It is **not** built or hashed — the generated `js/boot.js` injects it on concept
pages and the standalone pages link it directly, so it must stay at this stable path (the service
worker revalidates it as a tiny stable-entry asset).

Rules of thumb: every colour comes from a `--primer-*` token (WCAG AA in all themes); component-
internal styles live with their component in `src/components/`; fonts and third-party CSS (KaTeX,
JSXGraph) are build outputs under `/dist/assets/`, not here.
