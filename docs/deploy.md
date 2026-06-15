# Deploying to interactiveprimer.com (GitHub Pages)

The site is a **no-build static site**: GitHub Pages serves the repository root verbatim. There is no
server and no build step — Pages serves exactly what is committed on **`main`**.

## One-time setup

### 1. Repository (already in this repo)

- **`CNAME`** (repo root) — contains `interactiveprimer.com`; this is the custom-domain marker Pages reads.
- **`.nojekyll`** (repo root) — disables Jekyll so every file is served as-is.

### 2. Enable Pages

GitHub → **Settings → Pages → Build and deployment**:

- **Source:** Deploy from a branch
- **Branch:** `main`, folder **`/ (root)`** → Save

(Equivalent via CLI: `gh api repos/jimmejardine/interactiveprimer/pages -X POST -f source.branch=main -f source.path=/`.)

The **Custom domain** field is satisfied by the committed `CNAME`; GitHub runs a DNS check against it.

### 3. DNS (at the domain registrar for interactiveprimer.com)

| Type | Host | Value |
|---|---|---|
| A | `@` (apex) | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `jimmejardine.github.io.` |

(If the registrar supports `ALIAS`/`ANAME`/flattened CNAME at the apex, that can replace the A/AAAA
records.) GitHub auto-redirects `www` ↔ apex once both are configured.

### 4. HTTPS

After DNS propagates and the "DNS check successful" banner appears in Settings → Pages, tick
**Enforce HTTPS** (the free Let's Encrypt certificate provisions automatically — usually minutes).

## Why an apex (root) domain is required

Pages and the concept pages reference assets with **absolute** paths (`/js/boot.js`, `/css/primer.css`,
`/dist/graph.json`, `/concepts/...`). These resolve only when the site is served from the domain root,
which the apex custom domain provides. A project-path URL (`jimmejardine.github.io/interactiveprimer/`)
would break every absolute path.

## Keeping the live site current

There is no build step on the server, so anything generated locally must be **committed**:

- After adding or editing concepts, run **`npm run graph`** and commit the updated **`dist/graph.json`**
  (the navigation pathway fetches it at runtime; a stale file means a stale/incomplete map).
- New concept pages, quizzes, and animations are just committed `.html`/`.js` — they go live on the
  next push to `main`.
