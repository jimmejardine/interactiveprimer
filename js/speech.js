// @ts-check
/**
 * Spoken narration via the browser's Web Speech API — no audio files. Scenes use it to
 * narrate an animation:
 *
 *   import { registerManimScene, speak } from "primer";
 *   await Promise.all([scene.play(...), speak("one")]);
 *
 * `speak` resolves when the utterance finishes, so it can be awaited in lockstep with
 * `scene.play(...)`. On a browser without speech support it resolves immediately, so animations
 * still run (just silently). Speech may only start from a user gesture (the Play button) per
 * browser autoplay policy.
 *
 * Localization is automatic: with no explicit `lang`, narration uses the ACTIVE locale's voice
 * (via `bcp47()`), so a scene author just writes `speak(text)` and it is pronounced in the
 * current language. (This module therefore depends on js/i18n.js.)
 * @module
 */

import { bcp47 } from "./i18n.js";

/**
 * @typedef {object} SpeakOptions
 * @property {number} [rate]   Speaking rate (0.1–10, default 1).
 * @property {number} [pitch]  Voice pitch (0–2, default 1).
 * @property {string} [lang]   BCP-47 language tag, e.g. "en-US". Advanced override — defaults
 *   to the active locale's tag, so scene authors normally omit it.
 */

/** @returns {boolean} Whether the Web Speech API is usable here. */
function supported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

// Warm up the (asynchronously-loaded) voice list as early as possible, so a voice matching
// the requested language is usually available by the time the learner presses Play.
if (supported()) {
  try {
    window.speechSynthesis.getVoices();
  } catch {
    /* best-effort */
  }
}

/**
 * Pick an installed voice matching a BCP-47 tag: an exact match first, then any voice in the
 * same base language (e.g. "en-US" → any "en-*"). Returns null when the voice list isn't
 * populated yet, so the caller falls back to just setting `utterance.lang`.
 *
 * This matters because setting `utterance.lang` ALONE does not change the voice in many
 * browsers — the default (OS-language) voice keeps speaking, so e.g. English narration on a
 * Dutch machine comes out with a Dutch accent. Selecting an actual matching voice fixes that.
 * @param {string} lang
 * @returns {SpeechSynthesisVoice | null}
 */
function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;
  const want = lang.toLowerCase();
  const base = want.split("-")[0];
  return (
    voices.find((v) => v.lang.toLowerCase().replace("_", "-") === want) ||
    voices.find((v) => v.lang.toLowerCase().replace("_", "-").split("-")[0] === base) ||
    null
  );
}

/**
 * Speak `text` aloud, resolving when it finishes. Resolves immediately (a silent no-op)
 * where speech isn't supported. The language defaults to the ACTIVE locale's BCP-47 tag
 * (`bcp47()`) — pass `opts.lang` only to override it. An installed voice for that language is
 * selected (see {@link pickVoice}) so the words are pronounced in that language, not merely
 * read by the default voice.
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
    // Default to the active locale's voice so scene authors don't deal with lang/bcp47.
    const lang = opts.lang ?? bcp47();
    utterance.lang = lang;
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;

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
