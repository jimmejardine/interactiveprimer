/**
 * The single source of truth for the set of supported locales — id + endonym label, in display
 * order. `en` is the default + fallback. Deliberately DEPENDENCY-FREE (no catalogs, no DOM, no
 * storage) so it can be imported anywhere cheaply: `src/i18n.ts` builds `LOCALES`/`t()` on top of
 * it, and `scripts/build.mjs` imports {@link LOCALE_IDS} to stamp the `__SUPPORTED_LOCALES__`
 * placeholder into the generated pre-paint scripts (dist/boot.js, dist/prepaint.js) — so adding a
 * language means editing THIS list (plus its catalog in `src/i18n/`), not a dozen hardcoded arrays.
 * @module
 */

export const LOCALES = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
  { id: "nl", label: "Nederlands" },
] as const;

/** A supported locale id. */
export type LocaleId = (typeof LOCALES)[number]["id"];

/** Just the ids, in display order (`["en", "es", "nl"]`). */
export const LOCALE_IDS: readonly LocaleId[] = LOCALES.map((l) => l.id);
