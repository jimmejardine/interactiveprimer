// @ts-check
/**
 * Spoken narration via the browser's Web Speech API — no dependencies, no audio
 * files. Scenes use it to narrate an animation:
 *
 *   import { registerScene, speak } from "primer";
 *   await Promise.all([scene.play(...), speak("one")]);
 *
 * `speak` resolves when the utterance finishes, so it can be awaited in lockstep
 * with `scene.play(...)`. On a browser without speech support it resolves
 * immediately, so animations still run (just silently). Speech may only start from
 * a user gesture (the Play button) per browser autoplay policy.
 * @module
 */

/**
 * @typedef {object} SpeakOptions
 * @property {number} [rate]   Speaking rate (0.1–10, default 1).
 * @property {number} [pitch]  Voice pitch (0–2, default 1).
 * @property {string} [lang]   BCP-47 language tag, e.g. "en-US".
 */

/** @returns {boolean} Whether the Web Speech API is usable here. */
function supported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

/**
 * Speak `text` aloud, resolving when it finishes. Resolves immediately (a silent
 * no-op) where speech isn't supported. No specific voice is selected, so the
 * browser's default voice speaks without waiting for the async voice list to load.
 * @param {string} text
 * @param {SpeakOptions} [opts]
 * @returns {Promise<void>}
 */
export function speak(text, opts = {}) {
  if (!supported() || !text) return Promise.resolve();

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (opts.rate !== undefined) utterance.rate = opts.rate;
    if (opts.pitch !== undefined) utterance.pitch = opts.pitch;
    if (opts.lang !== undefined) utterance.lang = opts.lang;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };

    utterance.onend = finish;
    utterance.onerror = finish;

    // Safety net: some engines fail to fire `onend` for short or cancelled
    // utterances, which would otherwise stall an awaiting animation loop forever.
    const timer = setTimeout(finish, Math.max(1500, text.length * 90));

    window.speechSynthesis.speak(utterance);
  });
}

/** Stop any in-progress and queued narration (e.g. when an animation replays). */
export function cancelSpeech() {
  if (supported()) window.speechSynthesis.cancel();
}

/** Pause any in-progress narration (best-effort; pairs with {@link resumeSpeech}). */
export function pauseSpeech() {
  if (supported()) {
    try {
      window.speechSynthesis.pause();
    } catch {
      /* best-effort */
    }
  }
}

/** Resume narration paused by {@link pauseSpeech}. */
export function resumeSpeech() {
  if (supported()) {
    try {
      window.speechSynthesis.resume();
    } catch {
      /* best-effort */
    }
  }
}
