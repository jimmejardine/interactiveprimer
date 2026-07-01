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

- **Working scientifically (secondary)** *(folder `working-scientifically/`)* — SI base & derived
  units; prefixes & standard form; scalars vs vectors; precision, accuracy & resolution; uncertainty &
  significant figures; interpreting graphs (gradient & area-under-graph meanings); systematic vs random
  error; anomalies, reliability & validity. *(None built; the 4 built WS pages are primary-level.)*
- **Forces** *(folder `forces-and-motion/`)* — pressure in fluids & upthrust *(only the primary
  `floating-and-sinking` intro exists)*; a dedicated contact vs non-contact forces / force-diagram page
  *(if not adequately covered by `resultant-force`/`balanced-forces`)*.
- **Energy** *(folder `energy/`)* — thermal transfer: conduction, convection & radiation; reducing
  unwanted transfers / insulation.
- **Electricity** *(folder `electricity/`)* — static electricity & charging by friction; thermistors &
  LDRs (and their I–V / sensing circuits).
- **Waves** *(folder `waves/`)* — lenses & image formation (the eye & the camera); colour & filters;
  echoes & ultrasound; hearing & the ear.
- **Matter & particle model** *(folder `matter/`)* — pressure in liquids (depth) & atmospheric
  pressure; the gas laws (Charles's & the pressure law, beyond the built Boyle's law); reversible vs
  irreversible changes *(primary-level)*.
- **Earth & space** *(folder `earth-and-space/`)* — orbits of moons, planets & satellites; galaxies &
  the scale of the universe.
- **Atomic & nuclear** *(folder `atomic/`)* — uses & dangers of radiation, background radiation;
  nuclear fission; nuclear fusion (in stars & reactors).

## Still to build — A-level (16–18)

The **entire A-level tier is unbuilt** across all eight strands — the largest remaining block.

- **Mechanics** *(`forces-and-motion/`)* — equations of motion (suvat); projectile motion; motion
  graphs from calculus (v = ds/dt, a = dv/dt); free-body diagrams & resolving forces; friction &
  inclined planes; momentum & impulse; conservation of momentum; elastic/inelastic collisions;
  circular motion (centripetal force); simple harmonic motion; gravitation (Newton's law, orbits).
- **Energy** *(`energy/`)* — vector work–energy theorem; elastic potential energy at A-level depth.
- **Electricity & fields** *(`electricity/`, `electromagnetism/`)* — Kirchhoff's laws; internal
  resistance & EMF; potential dividers; electric fields (Coulomb's law, field & potential); magnetic
  fields & forces on currents/charges; electromagnetic induction (Faraday's & Lenz's laws);
  capacitance (charge, energy, RC circuits).
- **Waves & quantum** *(`waves/`)* — superposition & interference; standing/stationary waves;
  diffraction & the diffraction grating; polarisation; total internal reflection & optical fibres;
  lenses (deeper); the photoelectric effect & photons; wave–particle duality & the de Broglie
  wavelength.
- **Thermal physics** *(`matter/`)* — absolute (kelvin) temperature; the ideal gas equation; kinetic
  theory of gases; the first law of thermodynamics (intro).
- **Astrophysics (option)** *(`earth-and-space/`)* — stellar properties & the Hertzsprung–Russell
  diagram; cosmology & the fate of the universe.
- **Particle & nuclear** *(`atomic/`)* — fundamental particles (quarks & leptons); antimatter & the
  standard model (intro); mass–energy equivalence (E = mc²); binding energy & stability; the
  radioactive decay law (calculus link).
- **Working scientifically (A-level)** *(`working-scientifically/`)* — combining & propagating
  uncertainties; linearising relationships / lines of best fit.

---

## Notes

- **Course re-packagings** live under `concepts/physics/courses/`: the UK tree covers Reception–Year 6
  and **GCSE Year 10–11**. There are **no KS3 (Year 7–9)** year pages (the tree jumps from Year 6 to
  GCSE Year 10) and **no A-level** year pages yet — add those as the corresponding concepts land.
- **Maths dependencies:** GCSE physics needs rearranging formulae & standard form; A-level needs trig,
  vectors and calculus — link those as prerequisites from `concepts/mathematics/`.
- If a leaf above gets built, delete it from this list.
