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
import "./components/primer-math.js";
import "./components/primer-manim.js";
import "./components/primer-quiz.js";

// Re-exports for page scripts.
export { registerScene, getScene } from "./scenes.js";
export { LEVELS, levelRank, maxLevel, levelLabel } from "./levels.js";
export {
  indexConcepts,
  resolvePrerequisites,
  effectiveLevel,
  resolveLevels,
} from "./graph.js";
export { generateQuiz, generateQuestion, shuffle } from "./quiz.js";
