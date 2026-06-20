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

  "concept.confidence.prompt": "¿Qué tan seguro te sientes con este concepto?",
  "feedback.needsAttention": "Esta página necesita atención",
  "feedback.thanks": "Gracias — marcada para revisión.",
  "concept.confidence.legend": "Tu confianza",
  "concept.confidence.rate": "Califica {n} de {max}",
  "concept.confidence.rateTitle": "{n} / {max}",
  "concept.level.label": "Nivel {level}",
  "concept.level.word": "Nivel",
  "concept.level.declaredTitle": "Nivel declarado",
  "concept.level.implicitTitle": "Nivel implícito (heredado de los prerrequisitos)",

  "quiz.heading": "Cuestionario rápido",
  "quiz.check": "Comprobar respuestas",
  "quiz.score": "Obtuviste {score} / {total}.",
  "quiz.empty": "No hay preguntas para esta prueba.",
  "quiz.buildError": "No se pudo construir la prueba ({error}).",
  "quiz.answerPlaceholder": "Escribe tu respuesta",
  "quiz.correctAnswer": "Respuesta correcta",
  "quiz.chartOption": "Gráfica {n}",
  "quiz.retry": "Intentar de nuevo",
  "quiz.result.perfect": "¡Perfecto! 🎉",
  "quiz.result.great": "¡Genial! 🌟",
  "quiz.result.good": "¡Bien hecho! 👍",
  "quiz.result.ok": "¡Buen intento! 🙂",
  "quiz.result.low": "Sigue practicando 💪",

  "manim.play": "Reproducir animación",
  "manim.pause": "Pausa",
  "manim.resume": "Reanudar",
  "manim.replay": "Repetir",
  "manim.noScene": "No hay ninguna escena registrada como «{name}».",
  "manim.runError": "No se pudo ejecutar esta animación: {error}",

  "geometry.rewind": "Volver al inicio",
  "geometry.prev": "Paso anterior",
  "geometry.next": "Paso siguiente",
  "geometry.forward": "Ir al final",
  "geometry.play": "Reproducir",
  "geometry.pause": "Pausa",
  "geometry.expand": "Todos los pasos",
  "geometry.collapse": "Contraer",

  "video.play": "Reproducir vídeo",
  "video.unavailable": "No se pudo cargar este vídeo.",

  "pathway.label": "Ruta de conceptos",
  "pathway.more": "+{extra} más",

  "menu.label": "Menú",
  "menu.home": "Inicio",
  "menu.explore": "Explorar",
  "menu.feedback": "Comentarios",
  "menu.theme": "Tema",
  "menu.language": "Idioma",
  "menu.progress": "Progreso",
  "menu.save": "Guardar progreso",
  "menu.restore": "Restaurar progreso",
  "progress.restoreTitle": "Restaurar progreso",
  "progress.restorePrompt":
    "Ya tienes puntuaciones guardadas. ¿Combinar el archivo (conservando la puntuación más reciente de cada concepto) o sobrescribir todo con el archivo?",
  "progress.merge": "Combinar",
  "progress.overwrite": "Sobrescribir",
  "progress.overwriteConfirm":
    "Esto borra todas tus puntuaciones actuales y las reemplaza con el archivo. No se puede deshacer.",
  "progress.overwriteConfirmYes": "Borrar y sobrescribir",
  "progress.cancel": "Cancelar",
  "progress.imported": "Se importaron {n} conceptos.",
  "progress.importError": "No se pudo leer ese archivo ({error}).",
  "theme.light": "Claro",
  "theme.dark": "Oscuro",
  "theme.fun": "Divertido",
};
