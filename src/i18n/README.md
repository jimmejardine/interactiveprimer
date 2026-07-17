# src/i18n/ — UI-chrome string catalogs

The framework's translatable strings (menu labels, quiz chrome, offline manager, …), one catalog
per locale: `en.ts` (source of truth) and `es.ts`, consumed via `t("key")` from `../i18n.ts`.
`es.hashes.json` is the staleness sidecar: it records the hash of the English source each Spanish
string was translated from, so `npm run i18n:check` can flag keys whose English changed;
`npm run i18n:bless -- es` re-stamps after re-translating.

Concept-page translations are different machinery — full-page overlays under the root `i18n/`
directory (see its README).
