# i18n/ — translation overlays (content)

Per-locale overlays for concept pages: `i18n/<locale>/<concept-id>.html` mirrors `concepts/` and
carries the translated prose for that one page (English is the default and fallback). Overlays are
**fetched as data** by the renderer and swapped into the page — they are not standalone pages (a
direct visit redirects to the canonical lesson with `?lang=`). Each overlay ends with a
`<!-- sourceHash: … -->` comment tying it to the English source revision; `npm run i18n:check`
flags overlays whose source has since changed, `npm run i18n:bless` re-stamps.

Currently: `es/` (Spanish). UI-chrome strings are separate — they live in the framework at
`src/i18n/` (see its README).
