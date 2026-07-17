/**
 * Best-effort sound effects. `playSound("quiz-pass")` plays `/sounds/quiz-pass.wav`. It is
 * called from a user gesture (the quiz "Check answers" click), so it satisfies browser
 * autoplay rules; a missing file or blocked playback is silently ignored so the lesson is
 * never disrupted.
 * @module
 */

/**
 * Play `/sounds/<name>.wav` once, quietly and best-effort.
 * @param name  File stem under /sounds (e.g. "quiz-pass", "quiz-fail").
 */
export function playSound(name: string): void {
  if (typeof Audio !== "function") return;
  try {
    const audio = new Audio(`/sounds/${name}.wav`);
    audio.volume = 0.6;
    const played = audio.play?.();
    if (played && typeof played.catch === "function") played.catch(() => {});
  } catch {
    /* best-effort: no sound is better than a thrown error */
  }
}
