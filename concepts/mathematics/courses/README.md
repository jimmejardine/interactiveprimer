# Curriculum courses — roadmap

The site organises maths by **topic**; this folder adds a **curriculum layer** that re-packages the
existing concepts into the way schools actually teach — **year by year**, per national system.

Documentation only (the graph build scans `*.html`, not `.md`).

## How these work

- Each **year course** is a `course: true` hub page. Its members are existing concepts, listed with
  `<primer-ref soft to="…">` — soft refs add **no prerequisite edge**, so a course can pull concepts
  from anywhere in the tree without creating cycles. The build harvests `courseMembers` from those
  refs; the page auto-appears in the landing "Search courses" box, the menu, and the gold course spine.
- **Coverage gaps** (topics we haven't authored yet — most of geometry, trigonometry, probability,
  plus ratio/surds/standard form) are shown as muted `<primer-ref todo>` chips: a visible curriculum
  placeholder that creates no edge and isn't validated. `npm run graph` tallies them as a build-out
  roadmap; when a gap page is later written, drop the `todo` and it becomes a real member.
- **No `declaredLevel`** on any page here (project convention for new branches). Hubs are plain
  landing pages (not `course: true`); year pages are the courses.

## Structure

```
courses/courses                              (hub)
courses/primary-school/primary-school        (hub)
courses/primary-school/za/za                 (hub) → grade-r, grade-1..7   [CAPS: Foundation R–3, Intermediate 4–6, Senior 7]
courses/secondary-school/secondary-school    (hub)
courses/secondary-school/uk/uk               (hub) → year-7..9, gcse-year-10..11, a-level-year-12..13
courses/secondary-school/ib/ib               (hub) → myp-year-1..5, dp-year-1..2
courses/secondary-school/za/za               (hub) → grade-8..9, grade-10..12   [CAPS: Senior 8–9, FET 10–12]
```

Country codes are internet suffixes (`uk`); `ib` = International Baccalaureate. MYP years mirror UK
KS3→GCSE; DP years mirror A-level. Courses freely share members (soft refs make that safe).

## Build-out priority (what the todo chips point at)

Geometry (angles, polygons, circle theorems, area/volume, transformations, constructions, bearings);
trigonometry (SOHCAHTOA, sine/cosine rules, radians, identities); probability (basics, tree diagrams,
conditional, Venn); number (ratio & proportion, standard form, surds); stats (frequency tables,
cumulative frequency, box plots). Authoring these turns the todo chips into real members across many years.
