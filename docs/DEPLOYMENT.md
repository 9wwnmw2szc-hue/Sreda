# Deployment

## Closed Beta staging (authoritative for this beta)

| Item | Value |
|---|---|
| Project | **Sreda-staging** (Railway) |
| Git branch | **main** |
| Services | web, telegram-worker, vk-worker, Postgres, private S3 |
| Image | Dockerfile at repo root (`node:22`, `NEXT_PUBLIC_DATA_SOURCE=api`) |

Railway configs:

- `deploy/railway/web.json` — migrate pre-deploy, `npm start -- --hostname 0.0.0.0`, health `/api/health/web`
- `deploy/railway/worker.json` — telegram-worker
- `deploy/railway/vk-worker.json` — vk-worker

Shared variables: `APP_URL` (HTTPS origin, no trailing slash), `DATABASE_URL`, `BETTER_AUTH_SECRET`, S3_*, optional AI_*, webhook enable flags after bots exist.

### Public brand domains (prepared; cutover is owner-gated)

Canonical public origin (after DNS + TLS ready): **`https://biznesoty.ru`**

Redirect-only aliases (never APP_URL / never Better Auth trustedOrigins):

- `https://biznesoty.online`
- `https://бизнесоты.рф` (punycode `xn--90aifd0ahuj5f.xn--p1ai`)
- `https://www.biznesoty.ru` (optional)

Host policy lives in `src/server/http/canonical-host.ts` and Next.js `src/proxy.ts`:

- Browser GET/HEAD on aliases → **308** to `APP_URL` (path + query preserved)
- Unsafe methods on aliases → **403** (CSRF/origin not weakened)
- `/api/health*` and provider webhooks (`/api/telegram/*`, `/api/vk/*`, `/api/meta/webhook`) skip host redirect so Railway healthchecks and existing webhook URLs keep working during migration
- After `APP_URL` switches to `https://biznesoty.ru`, browser hits to `*.up.railway.app` redirect to the brand host; webhook paths on Railway remain reachable until bots are re-registered

**Do not set `APP_URL=https://biznesoty.ru` until Railway shows the custom domain verified and certificate ready.** Until then keep the current Railway origin.

**Note:** attaching `biznesoty.ru` to project **Sreda-staging** means the public brand points at staging infrastructure until a future production move. Sessions cookies from the Railway hostname will not transfer — users may need to sign in again after cutover.

Diagnostics: `npm run staging:check` and optional `--database` (read-only checksums/heartbeats).

**This document does not authorize production deploy.** Staging only for Closed Beta hardening.

## Optional self-hosted / Yandex path (prepared, not beta default)

- Compose + Caddy under `deploy/`
- Manual workflow `.github/workflows/deploy-yandex.yml` (workflow_dispatch, `main` only, requires prior Verify success)
- `deploy/release.sh` pulls immutable `cr.yandex/.../sreda:<sha>` image, migrates, health-checks
- Profiles enable telegram/vk workers based on `app.env` flags

Treat Yandex as a future production candidate once beta exit criteria are met — not the current ship path.

## Pre-deploy habits

1. Merge only through CI Verify on the commit you deploy.
2. Migrate on a DB copy first when schema changes are risky.
3. Toggle webhooks off during worker cutovers if dual-process overlap is possible.
4. Keep staging bots/tokens isolated from any future production bots (one webhook URL per bot).
