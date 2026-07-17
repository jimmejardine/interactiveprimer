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
import "./components/primer-page.ts";
import "./components/primer-concept.ts";
import "./components/primer-title.ts";
import "./components/primer-card.ts";
import "./components/primer-table.ts";
import "./components/primer-theorem.ts";
import "./components/primer-vignette.ts";
import "./components/primer-ref.ts";
import "./components/primer-math.ts";
import "./components/primer-code.ts";
import "./components/primer-manim.ts";
import "./components/primer-chart.ts";
import "./components/primer-chart-3d.ts";
import "./components/primer-chart-sliders.ts";
import "./components/primer-geometry.ts";
import "./components/primer-geometry-problem.ts";
import "./components/primer-program.ts";
import "./components/primer-video.ts";
import "./components/primer-quiz.ts";
import "./components/primer-pathway.ts";
import "./components/primer-up-next.ts";
import "./components/primer-menu.ts";

// Re-exports for page scripts.
export { registerManimScene, getManimScene, registerChart, getChart, register3dChart, get3dChart, registerGeometryScene, getGeometryScene, registerGeometryProblem, getGeometryProblem, registerProgram, getProgram, registerQuiz, getQuiz } from "./scenes.ts";
export { registerCharts, registerChartSliders, computeRange, subscribeSliders, getSliderGroup } from "./charts.ts";
export { THEMES, getTheme, applyTheme, initTheme, themeColors } from "./theme.ts";
export { LOCALES, getLocale, applyLocale, t } from "./i18n.ts";
export { getSceneStrings, makeStrings } from "./scene-strings.ts";
export { speak, cancelSpeech } from "./speech.ts";
export { parseConceptMeta, getConceptMeta } from "./concept-meta.ts";
export { BASE_LEVEL, maxLevel, formatLevel } from "./levels.ts";
export { resolveLevels, validateGraph } from "./graph.ts";
export { generateQuiz, generateQuestion, shuffle } from "./quiz.ts";
