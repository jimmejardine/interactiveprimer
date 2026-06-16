// @ts-check
/**
 * English chrome strings — the framework's own UI text (NOT lesson content, which lives
 * in concept pages and per-locale overlays). This catalog is the SOURCE OF TRUTH for the
 * key set: every other locale mirrors these keys, and `scripts/i18n-check.js` hashes these
 * English values to detect stale/missing translations.
 *
 * Keys are stable ids (e.g. `quiz.check`), not the English text, so re-wording a value
 * never churns translation keys. `{var}` placeholders are filled by i18n.js's `t(...)`.
 * @module
 */

/** @type {Record<string, string>} */
export default {
  "app.name": "Interactive Primer",

  "concept.confidence.prompt": "How confident are you with this concept?",
  "concept.confidence.legend": "Your confidence",
  "concept.confidence.rate": "Rate {n} out of {max}",
  "concept.confidence.rateTitle": "{n} / {max}",
  "concept.level.label": "Level {level}",
  "concept.level.word": "Level",
  "concept.level.declaredTitle": "Declared level",
  "concept.level.implicitTitle": "Implicit level (inherited from prerequisites)",

  "quiz.heading": "Quick test",
  "quiz.check": "Check answers",
  "quiz.score": "You scored {score} / {total}.",
  "quiz.empty": "No quiz questions provided.",
  "quiz.buildError": "Couldn't build the test ({error}).",
  "quiz.answerPlaceholder": "Type your answer",
  "quiz.correctAnswer": "Correct answer",
  "quiz.retry": "Try again",
  "quiz.result.perfect": "Perfect! 🎉",
  "quiz.result.great": "Brilliant! 🌟",
  "quiz.result.good": "Well done! 👍",
  "quiz.result.ok": "Good try! 🙂",
  "quiz.result.low": "Keep practising 💪",

  "manim.play": "Play animation",
  "manim.pause": "Pause",
  "manim.resume": "Resume",
  "manim.replay": "Replay",
  "manim.noScene": "No scene registered as “{name}”.",
  "manim.runError": "Couldn't run this animation: {error}",

  "video.play": "Play video",
  "video.unavailable": "Couldn't load this video.",

  "pathway.label": "Concept pathway",
  "pathway.more": "+{extra} more",

  "menu.label": "Menu",
  "menu.theme": "Theme",
  "menu.language": "Language",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.fun": "Fun",
};
