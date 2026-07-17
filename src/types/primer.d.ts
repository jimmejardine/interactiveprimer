// Ambient declaration for the bare `"primer"` specifier that every concept page's inline
// `<script type="module">` imports (and that js/boot.js resolves at runtime via its import map).
//
// Why this exists: tsc resolves relative imports inside src/ directly, but WebStorm does not
// reliably apply path mappings to scripts embedded in HTML — so navigation/completion went
// dark exactly in the concept-page builders. An ambient `declare module` is loaded globally by
// the TS service and honored in every context (including embedded HTML scripts), which restores
// go-to-definition on the library API there.
//
// `export *` does NOT forward through an ambient module from a re-export-only barrel, so the
// public names are listed explicitly. KEEP THIS LIST IN SYNC WITH src/primer.ts's exports — the
// types still flow from the real modules via the re-export, so only the names live here.
declare module "primer" {
  export {
    registerManimScene,
    getManimScene,
    registerChart,
    getChart,
    registerGeometryScene,
    getGeometryScene,
    registerQuiz,
    getQuiz,
    registerCharts,
    registerChartSliders,
    computeRange,
    THEMES,
    getTheme,
    applyTheme,
    initTheme,
    themeColors,
    LOCALES,
    getLocale,
    applyLocale,
    t,
    getSceneStrings,
    makeStrings,
    speak,
    cancelSpeech,
    parseConceptMeta,
    getConceptMeta,
    BASE_LEVEL,
    maxLevel,
    formatLevel,
    resolveLevels,
    validateGraph,
    generateQuiz,
    generateQuestion,
    shuffle,
  } from "../primer.ts";
}
