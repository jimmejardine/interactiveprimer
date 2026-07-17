/**
 * Confidence → colour. Maps a concept's self-attested star rating to a RED→YELLOW→GREEN
 * fill: the rating is read from localStorage and the saturation/lightness come from the
 * active theme, so the ramp stays legible in every theme. Shared by the pathway map
 * (src/components/primer-pathway.ts) and the inline <primer-ref> dot so they shade
 * identically. DOM-aware (unlike the pure maths in src/confidence.ts), hence its own module.
 * @module
 */

import { readEntry, MAX_STARS, CONFIDENCE_PREFIX } from "./confidence-store.ts";

// Re-exported so existing importers of this module keep resolving the prefix here.
export { CONFIDENCE_PREFIX };

/**
 * A concept's colour from its star rating: a RED→YELLOW→GREEN hue ramp proportional to the
 * rating (0 stars = red, half = yellow, full = green). Returns null when the concept hasn't
 * been rated, so callers can fall back to their default (unrated) look.
 */
export function confidenceColor(id: string): string | null {
  const entry = readEntry(id);
  if (entry === null) return null; // not yet rated → default look
  const stars = Math.min(MAX_STARS, Math.max(0, entry.stars));
  const hue = (stars / MAX_STARS) * 120; // 0 → red, 60 → yellow, 120 → green
  // Saturation/lightness are theme-driven so the ramp stays legible in every theme.
  const s = getComputedStyle(document.documentElement);
  const sat = s.getPropertyValue("--primer-conf-sat").trim() || "70%";
  const light = s.getPropertyValue("--primer-conf-light").trim() || "62%";
  return `hsl(${hue}, ${sat}, ${light})`;
}
