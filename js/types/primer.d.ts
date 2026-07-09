// Ambient declaration for the bare `"primer"` specifier that every concept page's inline
// `<script type="module">` imports (and that js/boot.js resolves at runtime via its import map).
//
// Why this exists: `paths` in jsconfig.json points tsc at js/primer.js, but WebStorm does not
// reliably apply jsconfig `paths` to scripts embedded in HTML — so navigation/completion went
// dark exactly in the concept-page builders. An ambient `declare module` is loaded globally by
// the TS service and honored in every context (including embedded HTML scripts), which restores
// go-to-definition on the library API there.
//
// `export *` does NOT forward through an ambient module from a re-export-only JS barrel, so the
// public names are listed explicitly. KEEP THIS LIST IN SYNC WITH js/primer.js's exports — the
// JSDoc types still flow from the real modules via the re-export, so only the names live here.
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
  } from "../primer.js";
}
