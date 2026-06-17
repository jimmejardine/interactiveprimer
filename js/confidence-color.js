// @ts-check
/**
 * Confidence → colour. Maps a concept's self-attested star rating to a RED→YELLOW→GREEN
 * fill: the rating is read from localStorage and the saturation/lightness come from the
 * active theme, so the ramp stays legible in every theme. Shared by the pathway map
 * (js/components/primer-pathway.js) and the inline <primer-ref> dot so they shade
 * identically. DOM-aware (unlike the pure maths in js/confidence.js), hence its own module.
 * @module
 */

/** Confidence (star) storage key prefix — mirrors js/components/primer-concept.js. */
export const CONFIDENCE_PREFIX = "primer:confidence:";

/** Stars at full mastery — must match primer-concept.js. */
const MAX_STARS = 10;

/**
 * A concept's colour from its star rating: a RED→YELLOW→GREEN hue ramp proportional to the
 * rating (0 stars = red, half = yellow, full = green). Returns null when the concept hasn't
 * been rated, so callers can fall back to their default (unrated) look.
 * @param {string} id
 * @returns {string | null}
 */
export function confidenceColor(id) {
  let raw;
  try {
    raw = localStorage.getItem(CONFIDENCE_PREFIX + id);
  } catch {
    return null; // localStorage unavailable (private mode, file://)
  }
  if (raw === null) return null; // not yet rated → default look
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const stars = Math.min(MAX_STARS, Math.max(0, n));
  const hue = (stars / MAX_STARS) * 120; // 0 → red, 60 → yellow, 120 → green
  // Saturation/lightness are theme-driven so the ramp stays legible in every theme.
  const s = getComputedStyle(document.documentElement);
  const sat = s.getPropertyValue("--primer-conf-sat").trim() || "70%";
  const light = s.getPropertyValue("--primer-conf-light").trim() || "62%";
  return `hsl(${hue}, ${sat}, ${light})`;
}
