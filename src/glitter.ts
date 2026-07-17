/**
 * A confined glitter celebration for a good quiz score. `glitter(host, intensity)` overlays
 * a short canvas particle burst on `host` (the quiz card), and the intensity scales the
 * spectacle. The threshold/ramp lives in the pure `glitterIntensity()` so it's unit-testable.
 *
 * No top-level DOM access, so this module imports cleanly in Node (only `glitter()` touches
 * the document, at call time).
 * @module
 */

/** Minimum intensity at exactly the 70% threshold, so a 7/10 still gets a little glitter. */
const MIN_INTENSITY = 0.15;

/**
 * How much glitter a score deserves: nothing below 70%, then a ramp from a small floor at
 * exactly 70% up to full at 100%. Pure.
 * @param fraction  Fraction correct, 0–1.
 * @returns Intensity in [0, 1]; 0 means "no glitter".
 */
export function glitterIntensity(fraction: number): number {
  if (fraction < 0.7) return 0;
  const ramp = Math.max(0, Math.min(1, (fraction - 0.7) / 0.3));
  return MIN_INTENSITY + (1 - MIN_INTENSITY) * ramp;
}

/** Bright, celebratory particle colours (golds, white, festive accents). */
const COLORS = ["#f5b301", "#ffd84d", "#ffffff", "#5b6ee1", "#2ca58d", "#e0556b"];

/**
 * Play a one-shot glitter burst confined to `host`. No-op when there's nothing to celebrate,
 * the platform can't animate, or the learner prefers reduced motion.
 * @param host       Element to overlay + clip the effect to (give it position
 *                   + overflow:hidden in CSS).
 * @param intensity  0–1 (see {@link glitterIntensity}); scales count/size/energy.
 */
export function glitter(host: HTMLElement, intensity: number): void {
  const i = Math.max(0, Math.min(1, intensity));
  if (i <= 0 || typeof document === "undefined" || typeof requestAnimationFrame !== "function") {
    return;
  }
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return; // honour reduced-motion: skip the animation entirely
  }

  // One burst at a time per host.
  host.querySelector(":scope > canvas.glitter")?.remove();

  const rect = host.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (w === 0 || h === 0) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement("canvas");
  canvas.className = "glitter";
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  host.appendChild(canvas);

  // Count + energy scale with intensity (≈40 just over 70%, ≈240 at 100%).
  const count = Math.round(40 + 200 * i);
  const maxLife = 1100 + 1200 * i; // ms
  const speed = 7 + 11 * i; // launch speed
  const gravity = 0.05; // px per frame²-ish (scaled by dt below)
  const originX = w / 2;
  const originY = h * 0.78; // fan up from the lower-centre

  const parts: { x: number, y: number, vx: number, vy: number, size: number, color: string, rot: number, vrot: number, life: number, max: number, tw: number }[] = [];
  for (let n = 0; n < count; n++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9; // upward fan
    const sp = speed * (0.4 + Math.random() * 0.6);
    parts.push({
      x: originX + (Math.random() - 0.5) * w * 0.2,
      y: originY,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      size: 3 + Math.random() * (3 + 4 * i),
      color: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.4,
      life: 0,
      max: maxLife * (0.6 + Math.random() * 0.4),
      tw: Math.random() * Math.PI * 2, // twinkle phase
    });
  }

  let prev = null as number | null;
  const frame = (now: number) => {
    if (!canvas.isConnected) return; // host re-rendered → stop
    const dt = prev === null ? 16 : Math.min(48, now - prev);
    prev = now;
    const step = dt / 16;
    ctx.clearRect(0, 0, w, h);
    let alive = 0;
    for (const p of parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      alive++;
      p.vy += gravity * step * 16;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rot += p.vrot * step;
      p.tw += 0.3 * step;
      const fade = 1 - p.life / p.max;
      const twinkle = 0.55 + 0.45 * Math.sin(p.tw);
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade) * twinkle;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (alive > 0) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
}
