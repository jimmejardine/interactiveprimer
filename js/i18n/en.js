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
  "feedback.needsAttention": "This page needs attention",
  "feedback.thanks": "Thanks — flagged for review.",
  "concept.confidence.legend": "Your confidence",
  "concept.confidence.rate": "Rate {n} out of {max}",
  "concept.confidence.rateTitle": "{n} / {max}",
  "concept.level.label": "Level {level}",
  "concept.level.word": "Level",
  "concept.level.declaredTitle": "Declared level",
  "concept.level.implicitTitle": "Implicit level (inherited from prerequisites)",

  "quiz.heading": "Quick quiz",
  "quiz.check": "Check answers",
  "quiz.score": "You scored {score} / {total}.",
  "quiz.empty": "No quiz questions provided.",
  "quiz.buildError": "Couldn't build the test ({error}).",
  "quiz.answerPlaceholder": "Type your answer",
  "quiz.correctAnswer": "Correct answer",
  "quiz.chartOption": "Graph option {n}",
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

  "geometry.rewind": "Rewind to start",
  "geometry.prev": "Previous step",
  "geometry.next": "Next step",
  "geometry.forward": "Skip to end",
  "geometry.play": "Play",
  "geometry.pause": "Pause",
  "geometry.expand": "All steps",
  "geometry.collapse": "Collapse",
  "geometry.refresh": "Refresh",

  "geometryProblem.toolAnswer": "Fill in",
  "geometryProblem.toolLine": "Draw line",
  "geometryProblem.toolParallel": "Mark ∥",
  "geometryProblem.toolEqual": "Mark =",
  "geometryProblem.toolRight": "Right ∟",
  "geometryProblem.toolUndo": "Undo",
  "geometryProblem.goal": "Find every unknown angle, ending with the highlighted one.",
  "geometryProblem.blankLabel": "unknown angle",
  "geometryProblem.solved": "Solved! Every step checks out.",
  "geometryProblem.notYet": "Not yet —",
  "geometryProblem.noTheorems": "No relevant theorems learned yet — come back after the lessons above.",

  "video.play": "Play video",
  "video.unavailable": "Couldn't load this video.",

  "pathway.label": "Concept pathway",
  "pathway.more": "+{extra} more",

  "contextmenu.open": "Open",

  "ref.todo": "todo",
  "ref.todoTitle": "Planned — not written yet",

  "menu.label": "Menu",
  "menu.home": "Home",
  "menu.explore": "Explore",
  "menu.collapse": "Collapse",
  "menu.feedback": "Feedback",
  "menu.theme": "Theme",
  "menu.language": "Language",
  "menu.progress": "Progress",
  "menu.course": "Course",
  "menu.save": "Save progress",
  "menu.restore": "Restore progress",
  "progress.restoreTitle": "Restore progress",
  "progress.restorePrompt":
    "You already have saved scores. Merge the file (keeping the most recent score per concept), or overwrite everything with the file?",
  "progress.merge": "Merge",
  "progress.overwrite": "Overwrite",
  "progress.overwriteConfirm":
    "This erases all your current scores and replaces them with the file. This can't be undone.",
  "progress.overwriteConfirmYes": "Erase and overwrite",
  "progress.cancel": "Cancel",
  "progress.imported": "Imported {n} concepts.",
  "progress.importError": "Couldn't read that file ({error}).",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.fun": "Fun",
  "course.none": "Not in a course",
  "course.exit": "Exit course",
  "course.focus": "Focus on this course",
  "course.focused": "✓ Focused — tap to leave",
  "course.change": "You're focused on another course. Switch to this one?",
  "course.switch": "Switch",
  "course.keep": "Keep current",
  "course.importClash": "The imported progress is from the course “{course}”. Switch to it?",
  "course.filtered": "Course:",

  "welcome.title": "Welcome back",
  "welcome.progress": "You're {done} / {total} concepts through {course}.",
  "welcome.resume": "Click here to continue with {concept}.",
  "welcome.no": "No thanks",
  "welcome.yes": "Yes please",
};
