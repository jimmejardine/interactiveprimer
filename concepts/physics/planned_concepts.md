# Physics — roadmap (ages 5 → 18)

This was the master plan for building out `concepts/physics/**` from age **5** to age **18**. The
**primary tier (5–11) is complete** (every strand written and enriched to the `gravity.html`
benchmark), and the **GCSE core (14–16) is built** and curated into the UK GCSE course years. This
page has been trimmed to list **only what is still to build** — the remaining "second-tier" GCSE
topics and the whole **A-level** tier. Everything already built has been removed.

**How to read it**

- Each item below is a **leaf** ≈ one teachable page ("one small idea per page"), with the folder under
  `concepts/physics/` where it would live.
- When promoting a leaf to a page, follow `CLAUDE.md`: one idea per page, taught richly; set
  `prerequisites` to the pages directly feeding it (including cross-subject maths), and let levels
  propagate. Misconceptions go in a `<primer-vignette title="Watch out!">` (never `<primer-theorem>`).
- If a leaf below gets built, delete it from this list.

---

## Still to build — GCSE (14–16)

The GCSE tier is now essentially complete. Two small optional leaves remain:

- **Forces** *(folder `forces-and-motion/`)* — a dedicated contact vs non-contact forces / force-types
  page, *if* it isn't judged adequately covered by `pushes-and-pulls` / `resultant-force` /
  `balanced-forces`.
- **Matter** *(folder `matter/`)* — reversible vs irreversible changes *(primary/KS3 level)*.

## Still to build — A-level (16–18)

The A-level tier is now built across all eight strands — mechanics (suvat, projectiles, calculus
motion, resolving forces, friction/inclines, momentum & impulse, conservation, collisions, circular
motion, SHM, gravitational fields & orbits), work–energy & elastic PE, fields & capacitance
(Kirchhoff, internal resistance, potential dividers, electric fields, magnetic force on charges,
Faraday's law, capacitance), waves & quantum (superposition, standing waves, diffraction grating,
polarisation, TIR, photoelectric effect, wave–particle duality), thermal (ideal gas, kinetic theory,
first law), astrophysics (H–R diagram, cosmology), nuclear & particle (fundamental particles,
Standard Model, binding energy, decay law), and the A-level practical/maths skills (propagating
uncertainties, linearising). Curated into `secondary-school/uk/a-level-year-12` and `-year-13`.

One small optional leaf remains:

- **Waves / optics** *(`waves/`)* — the **lens equation** (1/f = 1/v − 1/u) and lens power at A-level
  depth; the GCSE `lenses-and-image-formation` page already covers ray diagrams, image types and
  magnification.

---

## Notes

- **Course re-packagings** live under `concepts/physics/courses/`: the UK tree covers Reception–Year 6,
  **GCSE Year 10–11**, and **A-level Year 12–13**. The only remaining gap is **KS3 (Year 7–9)** year
  pages — the tree jumps from Year 6 to GCSE Year 10, though many lower-secondary leaves already exist
  and would populate KS3 years.
- **Maths dependencies:** GCSE physics needs rearranging formulae & standard form; A-level needs trig,
  vectors and calculus — link those as prerequisites from `concepts/mathematics/`.
- If a leaf above gets built, delete it from this list.
