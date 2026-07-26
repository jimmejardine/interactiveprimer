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
 * current language. (This module therefore depends on src/i18n.ts.)
 * @module
 */

import { bcp47 } from "./i18n.ts";
import { speechSupported, getRate, getPitch, resolvePreferredVoice } from "./voice.ts";

export interface SpeakOptions {
  /** Speaking rate (0.1–10). Overrides the learner's stored rate for this call. */
  rate?: number;
  /** Voice pitch (0–2). Overrides the learner's stored pitch for this call. */
  pitch?: number;
  /** BCP-47 language tag, e.g. "en-US". Advanced override — defaults
   *  to the active locale's tag, so scene authors normally omit it. */
  lang?: string;
  /** A specific voiceURI to speak with. Overrides the learner's stored voice for this call. */
  voice?: string;
}

/** Whether the Web Speech API is usable here (defined in src/voice.ts, shared here). */
const supported = speechSupported;

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
 */
/** An installed voice with the given voiceURI, or null if none is present. */
function findVoice(uri: string): SpeechSynthesisVoice | null {
  return window.speechSynthesis.getVoices().find((v) => v.voiceURI === uri) ?? null;
}

function pickVoice(lang: string): SpeechSynthesisVoice | null {
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
 * Build an utterance for `text`, applying the effective rate/pitch/voice/lang (a per-call opt
 * wins; otherwise the learner's stored preference, then the locale auto-pick). Shared by
 * {@link speak} and {@link speakSequence}.
 */
function makeUtterance(text: string, opts: SpeakOptions): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  // Effective rate/pitch: a per-call opt (scene author intent) wins; otherwise the learner's
  // stored preference (default 1) applies.
  utterance.rate = opts.rate ?? getRate();
  utterance.pitch = opts.pitch ?? getPitch();
  // Default to the active locale's voice so scene authors don't deal with lang/bcp47.
  const lang = opts.lang ?? bcp47();
  utterance.lang = lang;
  // Voice precedence: explicit per-call voiceURI → the learner's stored voice (if it matches
  // this language) → the locale auto-pick.
  const voice =
    (opts.voice ? findVoice(opts.voice) : null) ?? resolvePreferredVoice(lang) ?? pickVoice(lang);
  if (voice) utterance.voice = voice;
  return utterance;
}

/** Length-scaled safety timeout: some engines never fire `onend` for short/cancelled utterances. */
function safetyMs(text: string): number {
  const MIN_SPEECH_MS = 1500;
  const MS_PER_CHAR = 90;
  return Math.max(MIN_SPEECH_MS, text.length * MS_PER_CHAR);
}

/**
 * Speak `text` aloud, resolving when it finishes. Resolves immediately (a silent no-op)
 * where speech isn't supported. The language defaults to the ACTIVE locale's BCP-47 tag
 * (`bcp47()`) — pass `opts.lang` only to override it. An installed voice for that language is
 * selected (see {@link pickVoice}) so the words are pronounced in that language, not merely
 * read by the default voice.
 */
export function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!supported() || !text) return Promise.resolve();

  return new Promise((resolve) => {
    const utterance = makeUtterance(text, opts);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };

    utterance.onend = finish;
    utterance.onerror = finish;
    const timer = setTimeout(finish, safetyMs(text));

    window.speechSynthesis.speak(utterance);
  });
}

/** A running {@link speakSequence}: `cancel()` stops it; `done` resolves when it ends (or is cancelled). */
export interface SpeechSequence {
  cancel(): void;
  done: Promise<void>;
}

/** Callbacks for {@link speakSequence}, fired as each chunk starts and ends (by chunk index). */
export interface SequenceHooks {
  onChunkStart?(index: number): void;
  onChunkEnd?(index: number): void;
}

/**
 * Speak `chunks` in order, each as its OWN utterance, firing `onChunkStart(i)` as chunk `i`
 * begins and `onChunkEnd(i)` as it ends. Speaking one chunk per utterance gives reliable
 * per-chunk progress (for e.g. sentence highlighting) across all voices — unlike
 * `utterance.onboundary`, which many voices (notably remote/Google ones) never fire.
 *
 * Returns a handle: `cancel()` stops immediately, `done` resolves when the last chunk finishes
 * OR on cancel. A no-op (resolves at once) where speech is unsupported. Applies the learner's
 * stored voice/rate/pitch via {@link makeUtterance}.
 */
export function speakSequence(chunks: string[], hooks: SequenceHooks = {}): SpeechSequence {
  const items = chunks.filter((c) => c && c.trim().length > 0);
  if (!supported() || items.length === 0) {
    return { cancel: () => {}, done: Promise.resolve() };
  }

  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  const finishAll = () => {
    if (timer) clearTimeout(timer);
    resolveDone();
  };

  const speakAt = (i: number) => {
    if (cancelled) return;
    if (i >= items.length) {
      finishAll();
      return;
    }
    hooks.onChunkStart?.(i);
    const utterance = makeUtterance(items[i], {});

    let advanced = false;
    const next = () => {
      if (advanced || cancelled) return;
      advanced = true;
      clearTimeout(timer);
      hooks.onChunkEnd?.(i);
      speakAt(i + 1);
    };
    utterance.onend = next;
    utterance.onerror = next;
    timer = setTimeout(next, safetyMs(items[i]));

    window.speechSynthesis.speak(utterance);
  };

  // cancel() before the first tick still resolves `done`; guard re-entrancy with `cancelled`.
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (supported()) window.speechSynthesis.cancel();
    finishAll();
  };

  speakAt(0);
  return { cancel, done };
}

/** Stop any in-progress and queued narration (e.g. when an animation replays). */
export function cancelSpeech(): void {
  if (supported()) window.speechSynthesis.cancel();
}

/** Pause any in-progress narration (best-effort; pairs with {@link resumeSpeech}). */
export function pauseSpeech(): void {
  if (supported()) {
    try {
      window.speechSynthesis.pause();
    } catch {
      /* best-effort */
    }
  }
}

/** Resume narration paused by {@link pauseSpeech}. */
export function resumeSpeech(): void {
  if (supported()) {
    try {
      window.speechSynthesis.resume();
    } catch {
      /* best-effort */
    }
  }
}
