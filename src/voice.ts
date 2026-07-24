/**
 * Narration voice preferences: which installed voice to speak with, and the speaking rate
 * and pitch. A learner setting, persisted like the theme (src/theme.ts) and locale
 * (src/i18n.ts) and read by src/speech.ts on every `speak()` call, so the choice applies to
 * all animation narration.
 *
 * Voice is stored as a `SpeechSynthesisVoice.voiceURI`; `null`/absent means "automatic" — let
 * the active locale pick a voice (the historical behaviour). A chosen voice only applies when
 * its language matches the narration language, so switching locale still narrates in the right
 * language. Rate/pitch are plain numbers (default 1).
 *
 * The browser loads its voice list asynchronously (`getVoices()` is empty until the
 * `voiceschanged` event), so this module also exposes {@link onVoicesChanged} for the menu to
 * (re)populate its list once voices arrive.
 * @module
 */

import { bcp47 } from "./i18n.ts";
import { safeGet, safeSet } from "./storage.ts";

export const VOICE_KEY = "primer:voice";
export const RATE_KEY = "primer:speech-rate";
export const PITCH_KEY = "primer:speech-pitch";

/** Clamp ranges for the sliders (also enforced on read, so a hand-edited value can't misbehave). */
export const RATE_MIN = 0.5;
export const RATE_MAX = 2;
export const PITCH_MIN = 0;
export const PITCH_MAX = 2;
const DEFAULT_RATE = 1;
const DEFAULT_PITCH = 1;

/** Whether the Web Speech API is usable here (shared with src/speech.ts). */
export function speechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function readNumber(key: string, fallback: number, lo: number, hi: number): number {
  const raw = safeGet(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
}

/** Announce a preference change so live components (the menu) can re-reflect. */
function announce(): void {
  if (typeof document !== "undefined") {
    document.dispatchEvent(new CustomEvent("speech-change"));
  }
}

/** The stored speaking rate (0.5–2, default 1). */
export function getRate(): number {
  return readNumber(RATE_KEY, DEFAULT_RATE, RATE_MIN, RATE_MAX);
}

/** Persist the speaking rate (clamped) and announce the change. */
export function setRate(n: number): void {
  safeSet(RATE_KEY, String(clamp(n, RATE_MIN, RATE_MAX)));
  announce();
}

/** The stored voice pitch (0–2, default 1). */
export function getPitch(): number {
  return readNumber(PITCH_KEY, DEFAULT_PITCH, PITCH_MIN, PITCH_MAX);
}

/** Persist the voice pitch (clamped) and announce the change. */
export function setPitch(n: number): void {
  safeSet(PITCH_KEY, String(clamp(n, PITCH_MIN, PITCH_MAX)));
  announce();
}

/** The stored preferred voiceURI, or null for "automatic" (locale-picked). */
export function getVoicePref(): string | null {
  const uri = safeGet(VOICE_KEY);
  return uri && uri.length > 0 ? uri : null;
}

/** Persist the preferred voice (a voiceURI, or null/"" to clear back to automatic). */
export function setVoicePref(uri: string | null): void {
  safeSet(VOICE_KEY, uri ?? "");
  announce();
}

/** All installed voices, or [] when unsupported / not yet populated. */
function allVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  try {
    return window.speechSynthesis.getVoices() ?? [];
  } catch {
    return [];
  }
}

const baseLang = (tag: string) => tag.toLowerCase().replace("_", "-").split("-")[0];

/**
 * The voices worth offering: those whose base language matches `lang` (defaulting to the
 * active locale's BCP-47 tag), e.g. every `en-*` voice. If none match (or the list isn't
 * populated yet), fall back to all installed voices so the picker is never needlessly empty.
 */
export function listVoices(lang?: string): SpeechSynthesisVoice[] {
  const all = allVoices();
  const want = baseLang(lang ?? bcp47());
  const matching = all.filter((v) => baseLang(v.lang) === want);
  return matching.length > 0 ? matching : all;
}

/**
 * The user's chosen voice for a given narration language, or null to defer to the locale
 * auto-pick. Only returns the stored voice when it is installed AND its base language matches
 * `lang` — so a chosen English voice never hijacks Dutch narration.
 */
export function resolvePreferredVoice(lang: string): SpeechSynthesisVoice | null {
  const uri = getVoicePref();
  if (!uri) return null;
  const want = baseLang(lang);
  return allVoices().find((v) => v.voiceURI === uri && baseLang(v.lang) === want) ?? null;
}

/**
 * Subscribe to the browser's `voiceschanged` event (fired when the async voice list arrives or
 * changes). Returns an unsubscribe function. No-op (returns a no-op) where unsupported.
 */
export function onVoicesChanged(cb: () => void): () => void {
  if (!speechSupported()) return () => {};
  const target = window.speechSynthesis;
  target.addEventListener("voiceschanged", cb);
  return () => target.removeEventListener("voiceschanged", cb);
}
