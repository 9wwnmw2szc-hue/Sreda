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
