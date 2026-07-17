# test/ — unit tests (node:test)

`npm test` runs `node --test`, which discovers `*.test.ts` here and executes the TypeScript
directly (Node's built-in type stripping — no build, no loader). Tests import the framework
straight from `../src/*.ts` and cover the pure logic: graph validation and levels, quiz generation
and the variables/expression evaluator, the geometry engine, progress/confidence stores and stats,
charts maths, i18n plumbing, parsers and formatters.

DOM-dependent behaviour (components, rendering, widgets) is NOT tested here — that's the headless
page sweep, `npm run test:pages` (see `scripts/smoke-pages.mjs`). Both run in CI via `npm run
check` (typecheck + tests + graph + i18n).
