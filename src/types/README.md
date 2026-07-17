# src/types/ — shared type definitions

- **`domain.ts`** — the core domain model as real exported types: concepts and the resolved graph
  (`ConceptMeta`, `Concept`, `ResolvedConcept`, `Diagnostic`), and the quiz model (authored and
  generated question shapes, `Bindings`, `Variable`, …). Import with `import type`.
- **`primer.d.ts`** — an ambient `declare module "primer"` mirroring the barrel's export list, so
  IDEs resolve the bare `"primer"` specifier inside concept pages' inline `<script type="module">`
  blocks (where path mappings don't reach). **Keep its list in sync with `../primer.ts`.**

Module-specific types live with their module (e.g. chart types in `../charts.ts`), not here.
