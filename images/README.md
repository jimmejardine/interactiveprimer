# images/ — site art and static images

Shared imagery served as-is (no build):

- **`icons/`** — favicons + PWA/app icons (referenced by the generated boot.js head-injection and
  `site.webmanifest`).
- **`clipart/`** — reusable illustration assets embedded by concept pages.
- Root files — the social/OG banners (`banner.jpg`, `banner-portrait.jpg`), the course shield, and
  small UI art (`rocket.gif`, `gears.svg`, `foot-steps.svg`, `up-next.png`).

Concept-specific figures generally live next to their page under `concepts/`, not here. PNGs can be
trimmed with `npm run trim:png`.
