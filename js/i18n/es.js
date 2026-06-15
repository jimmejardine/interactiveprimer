// @ts-check
/**
 * Spanish chrome strings. Mirrors js/i18n/en.js key-for-key (en is the source of truth);
 * `{var}` placeholders and leading glyphs (↑ ▶ ⏸ ↻) are preserved. Holds NO lesson prose
 * and NO scene narration — those live in the per-locale overlay HTML under /i18n/es/.
 *
 * After editing these, run `npm run i18n:bless -- es` to re-stamp js/i18n/es.hashes.json
 * so `npm run i18n:check` knows these translations are up to date.
 * @module
 */

/** @type {Record<string, string>} */
export default {
  "app.name": "Cartilla Interactiva",

  "page.backToTree": "↑ Volver al árbol del conocimiento",

  "concept.confidence.prompt": "¿Qué tan seguro te sientes con este concepto?",
  "concept.confidence.legend": "Tu confianza",
  "concept.confidence.rate": "Califica {n} de {max}",
  "concept.confidence.rateTitle": "{n} / {max}",
  "concept.level.label": "Nivel {level}",
  "concept.level.word": "Nivel",
  "concept.level.declaredTitle": "Nivel declarado",
  "concept.level.implicitTitle": "Nivel implícito (heredado de los prerrequisitos)",

  "quiz.heading": "Prueba rápida",
  "quiz.check": "Comprobar respuestas",
  "quiz.score": "Obtuviste {score} / {total}.",
  "quiz.empty": "No hay preguntas para esta prueba.",
  "quiz.buildError": "No se pudo construir la prueba ({error}).",

  "manim.play": "Reproducir animación",
  "manim.pause": "Pausa",
  "manim.resume": "Reanudar",
  "manim.replay": "Repetir",
  "manim.noScene": "No hay ninguna escena registrada como «{name}».",
  "manim.runError": "No se pudo ejecutar esta animación: {error}",

  "pathway.label": "Ruta de conceptos",
  "pathway.more": "+{extra} más",

  "menu.label": "Menú",
  "menu.theme": "Tema",
  "menu.language": "Idioma",
  "theme.light": "Claro",
  "theme.dark": "Oscuro",
  "theme.fun": "Divertido",
};
