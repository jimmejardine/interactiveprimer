# Interactive Primer — cloud sync Worker

Optional, passwordless cloud sync of a learner's star ratings across devices. It is a **separate
deploy** from the (build-less) static site: a single Cloudflare **module Worker** (`src/index.js`)
backed by one **KV namespace**, sending sign-in codes via **Resend**.

The Worker reuses the site's own merge logic — it imports `mergeProgress` from
`../../js/progress-core.js`, so a `PUT /api/progress` reconciles two snapshots exactly the way the
browser does. `wrangler`/esbuild bundles that relative import; do not copy the file.

## How it works

- **Auth is passwordless.** The learner enters their email → gets a 6-character code → the Worker
  returns a signed, HttpOnly session cookie (`psess`, 90 days).
- **`uid = HMAC-SHA256(email, AUTH_SECRET)`** (hex). Because `AUTH_SECRET` is fixed, the same email
  always maps to the same user/data. A separate per-user **`salt`** (rotatable) is what actually
  validates a session, so "Log out everywhere" / "Forget me" invalidate all devices.
- **Storage (KV binding `PROGRESS`):**
  - `uid` → `{ salt, saltIssued, version:1, course, updatedAt, scores: { "<conceptId>": [stars, first, last] } }`
  - `otp:<uid>` → `{ codeHash, attempts }` (TTL 10 min)
  - `rl:<uid>` / `rl:<ip>` → rate-limit counter (TTL 10 min, cap 5 code requests)

## Endpoints (base `/api`, all JSON)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/request` | `{ email }` → email a 6-char code. Always answers `{ ok:true }` (never reveals if the email exists). |
| POST | `/api/auth/verify` | `{ email, code }` → set session cookie. |
| POST | `/api/auth/logout` | Clear this device's cookie. |
| POST | `/api/auth/logout-all` | Rotate the salt → invalidate every session. |
| GET | `/api/progress` | `{ entries, course }`. |
| PUT | `/api/progress` | `{ entries, course }` → server-side `mergeProgress`, returns merged. |
| DELETE | `/api/progress` | Full erasure ("Forget me") + clear cookie. |
| OPTIONS | `*` | CORS preflight (204). |

## Setup

1. **Install & log in**

   ```bash
   npm i -g wrangler        # or: npx wrangler ...
   wrangler login
   ```

2. **Create the KV namespace** and paste the id into `wrangler.toml` (replace `<KV_NAMESPACE_ID>`):

   ```bash
   wrangler kv namespace create PROGRESS
   ```

3. **Set secrets** (never commit these):

   ```bash
   wrangler secret put AUTH_SECRET      # long random string — derives uid + signs sessions. KEEP IT STABLE forever (changing it orphans all data).
   wrangler secret put RESEND_API_KEY   # from https://resend.com
   ```

   Optional plain vars (in `wrangler.toml` `[vars]` or the dashboard):
   - `EMAIL_FROM` — verified Resend sender, e.g. `Interactive Primer <login@interactiveprimer.com>`.
   - `SITE_ORIGIN` — **dev only**, the site origin to reflect for CORS, e.g. `http://localhost:8080`.

4. **Resend** — verify the sender domain used in `EMAIL_FROM` (add its DNS records in the Resend
   dashboard). `sendCode()` sends a plain inline-HTML email containing the 6-character code.

5. **Route** — serve the API from the site's origin so it's same-origin in production (no CORS):
   set `interactiveprimer.com/api/*` → this Worker. Do it in the Cloudflare dashboard
   (Workers → your worker → Triggers → Routes) or uncomment the `[[routes]]` block in `wrangler.toml`.

6. **Deploy**

   ```bash
   wrangler deploy
   ```

## Local development

```bash
wrangler dev
```

`wrangler dev` binds a local KV by default. Because the dev site (`http://localhost:8080`) and the
Worker run on different origins, set `SITE_ORIGIN=http://localhost:8080` (in `[vars]`) so CORS
reflects that origin with credentials. Set the secrets locally too — create a `.dev.vars` file
(git-ignored) with `AUTH_SECRET=...` and `RESEND_API_KEY=...`.
