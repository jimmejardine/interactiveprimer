// @ts-check
/**
 * The single module every concept page imports. Importing it for its side effects
 * registers all Primer custom elements:
 *
 *   <script type="module">import "primer";</script>
 *
 * It also re-exports the pieces a page might script against (scene registration,
 * the domain helpers) so a page needs only this one import.
 * @module
 */

// Registering side effects: each module defines its custom element on import.
import "./components/primer-page.js";
import "./components/primer-concept.js";
import "./components/primer-title.js";
import "./components/primer-card.js";
import "./components/primer-theorem.js";
import "./components/primer-vignette.js";
import "./components/primer-ref.js";
import "./components/primer-math.js";
import "./components/primer-code.js";
import "./components/primer-manim.js";
import "./components/primer-chart.js";
import "./components/primer-chart-3d.js";
import "./components/primer-chart-sliders.js";
import "./components/primer-geometry.js";
import "./components/primer-geometry-problem.js";
import "./components/primer-program.js";
import "./components/primer-video.js";
import "./components/primer-quiz.js";
import "./components/primer-pathway.js";
import "./components/primer-up-next.js";
import "./components/primer-menu.js";

// Re-exports for page scripts.
export { registerManimScene, getManimScene, registerChart, getChart, register3dChart, get3dChart, registerGeometryScene, getGeometryScene, registerGeometryProblem, getGeometryProblem, registerProgram, getProgram, registerQuiz, getQuiz } from "./scenes.js";
export { registerCharts, registerChartSliders, computeRange, subscribeSliders, getSliderGroup } from "./charts.js";
export { THEMES, getTheme, applyTheme, initTheme, themeColors } from "./theme.js";
export { LOCALES, getLocale, applyLocale, t } from "./i18n.js";
export { getSceneStrings, makeStrings } from "./scene-strings.js";
export { speak, cancelSpeech } from "./speech.js";
export { parseConceptMeta, getConceptMeta } from "./concept-meta.js";
export { BASE_LEVEL, maxLevel, formatLevel } from "./levels.js";
export {
  ROOT_ID,
  indexConcepts,
  findRoots,
  resolvePrerequisites,
  effectiveLevel,
  resolveLevels,
  validateGraph,
  neighborhood,
} from "./graph.js";
export { generateQuiz, generateQuestion, shuffle } from "./quiz.js";
