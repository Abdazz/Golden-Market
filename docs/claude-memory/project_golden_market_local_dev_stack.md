---
name: project-golden-market-local-dev-stack
description: "How to stand up a real local Medusa backend + storefront for Golden Market, and the port/region gotchas on this dev machine"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2e980302-0e5c-4421-8c5b-65c81623197c
  modified: 2026-08-27T17:51:14.587Z
---

Golden Market (this repo) is a Medusa v2 + Next.js 15 DTC starter, monorepo
with `apps/backend` and `apps/storefront`, npm workspaces.

**Why this matters:** the dev sandbox this project is normally worked in has
no reachable Medusa backend, so every prior redesign plan deferred real
visual QA. See [[feedback-visual-verification-required]] for why that's a
real gap, not just a formality.

## Standing up the stack

1. Dev infra (Postgres + Redis) is dockerized at the repo root:
   `docker-compose.yml` (committed) reads `POSTGRES_DB`/`POSTGRES_USER`/
   `POSTGRES_PASSWORD` from a root `.env` (gitignored, copy from
   `.env.example`). Postgres is mapped to host port 5433 by design
   ("5432 already used by another host Postgres" per the compose file's own
   comment) and Redis to 6379.
2. `AGENTS.md` (line ~172) documents "dev ports deviants: backend 9001,
   storefront 8001 (9000/8000 taken by other containers on this host)" —
   **this convention is stale/unreliable**: as of 2026-08-26, port 5433 was
   ALSO already taken (by an unrelated native postgresql systemd service on
   this machine), and ports 9000-9001 were BOTH claimed by an unrelated
   project's `tenderai-minio` container. Always check `ss -tlnp | grep
   ':<port> '` before assuming any of these documented ports are free —
   don't trust the AGENTS.md numbers blindly. If a docker-compose port
   conflicts, use a local `docker-compose.override.yml` (gitignored) with
   the `!override` YAML merge tag on the `ports:` key — plain overriding
   without that tag *concatenates* the port list instead of replacing it,
   causing the container to fail binding the old conflicting port too.
3. Backend `.env` (gitignored, not from a template beyond `.env.template`)
   needs `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`/`COOKIE_SECRET`, and
   critically `RESEND_API_KEY` — the Notification module's `resend` provider
   throws `L'option api_key est requise` and blocks the ENTIRE backend from
   booting if this is empty, even in pure local dev with no intent to send
   email. Any placeholder string works.
4. `medusa db:migrate` runs migrations AND an initial-data-seed migration
   script (`apps/backend/src/migration-scripts/initial-data-seed.ts`) that
   creates a default "Europe" region (dk/fr/de/it/es/se/gb, EUR) plus demo
   categories/products (Shirts, Sweatshirts, Merch, Pants) — this is
   NOT Golden Market's real catalog. As of 2026-08-27 a follow-up script
   (`npm run seed:categories-bf`, step 6 below) removes those demo
   categories once empty and creates the real 6-category taxonomy, so a
   freshly migrated DB still needs that script run, not just steps 5-6.
5. `npm run seed:region-bf` (from `apps/backend`) creates the real target
   region: Burkina Faso, currency XOF, linked to country code `bf`.
6. `npm run import:catalog` (from `apps/backend`) imports the real 29-product
   Golden Market catalog from the committed
   `src/scripts/catalog-import/Golden Market - Catalogue des produits.xlsx`
   — these products only get XOF prices, no EUR prices. Follow it with
   `npm run seed:categories-bf` to remove the demo categories and assign
   the real 6-category taxonomy (see `apps/backend/src/scripts/seed-categories-bf.ts`
   for the exact handle-to-category mapping) — see [[golden-market-category-handle-ampersand-bug]]
   for a gotcha hit while building that script.
7. **Critical gotcha for browsing the storefront:** the `[countryCode]` URL
   segment is a real ISO country code, not a language selector — `/fr/...`
   resolves to *France* (Europe region, EUR prices), `/bf/...` resolves to
   *Burkina Faso* (XOF prices) — the actual target market. Using `/fr/...`
   to test "the French storefront" is a natural but wrong assumption: it
   silently shows no prices for Golden Market's XOF-only catalog and looks
   like a pricing bug when it's actually just the wrong region. Always
   browse Golden Market at `/bf/...`, never `/fr/...`.
8. If `import-catalog.ts` runs while the backend's `PORT` env var doesn't yet
   match the port it's actually served on later, the uploaded image URLs get
   baked into the DB with the wrong port (the script's own `fixImageUrl`
   rewrites Medusa's hardcoded-9000 default using `process.env.PORT` at
   import time) — fix by wiping `product`/`product_variant` rows (cascades
   cleanly) and re-running `import:catalog` once the port is settled, not by
   trying to patch stored URLs after the fact.
9. Storefront `.env.local` needs `NEXT_PUBLIC_MEDUSA_BACKEND_URL`,
   `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (fetch from
   `SELECT token FROM api_key WHERE type='publishable'` once the backend has
   booted once), `NEXT_PUBLIC_DEFAULT_REGION=bf`, `NEXT_PUBLIC_BASE_URL`.
   `package.json`'s own `dev`/`start` scripts hardcode `-p 8000`; run
   `next dev --turbopack -p <port>` directly to use an alternate port.
10. No Chrome extension / claude-in-chrome available in this sandbox for
    interactive browser verification. `google-chrome --headless
    --screenshot=...` works for static single-page shots; for anything
    needing clicks/navigation/form-fill, install Playwright into an isolated
    scratch directory (`npm install playwright` outside the repo, e.g.
    `/tmp/pw-verify`) rather than adding it as a project dependency —
    `npx playwright install chromium` (without `--with-deps`, which needs
    sudo) works fine since `google-chrome` being already installed usually
    covers the needed system libs.

## Update 2026-08-31 (concrete values as configured this day)

The stack is now fully wired on this machine — use these exact ports, they
supersede the guesses above:
- Backend: port **9002** (`apps/backend/.env` has `PORT=9002`,
  `DATABASE_URL=postgres://medusa:medusa_dev_local@localhost:5440/medusa-backend`).
- Storefront: port **8002** (`apps/storefront/.env.local`:
  `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9002`,
  `NEXT_PUBLIC_BASE_URL=http://localhost:8002`, `NEXT_PUBLIC_DEFAULT_REGION=bf`).
- Postgres host port **5440** (not 5433 — remapped by a committed-locally
  `docker-compose.override.yml` with `ports: !override`), Redis 6379.
- Start backend: `npm run backend:dev` (from repo root) — serves 9002, admin
  at /app. Start storefront: `cd apps/storefront && npx next dev --turbopack
  -p 8002` (the `storefront:dev` turbo script hardcodes `-p 8000`, which is
  taken by an unrelated `tenderai` container).
- `mcp__plugin_playwright_playwright__*` MCP tools ARE available this session
  for screenshots/interaction; `mcp__claude-in-chrome__*` was NOT connected.
- E2E suite: `cd apps/storefront && PLAYWRIGHT_BASE_URL=http://localhost:8002
  npx playwright test` — 10 tests, needs backend+storefront already running.

**Do NOT run `npm run build` while `next dev` is running.** They share
`apps/storefront/.next/`; the production build overwrites the dev server's
server manifests and every page then 500s with `ENOENT ... _buildManifest.js.tmp`
or `.../page/build-manifest.json`. Sequence: kill dev → `rm -rf .next` →
build → restart dev.

**Flaky "Rupture de stock" / "strict mode: 2 add-product-button" e2e
failures after a burst of edits are HMR noise, not regressions.** The real
product variants are all named "Default Title" with `manage_inventory: false`
(never actually out of stock); the client `inStock` memo in
`product-actions/index.tsx` briefly reads false before the variant resolves
on a churny dev server. Fix: kill dev, `rm -rf .next`, restart, curl the key
routes to warm them, then re-run — 10/10.

To restock local inventory if ever genuinely needed: `medusa exec` a script
(placed under `apps/backend/src/scripts/`) that calls
`container.resolve(Modules.INVENTORY).updateInventoryLevels([...])`.
