# Deployment — БизнеСоты (biznesoty)

## Canonical public origin

**Production APP_URL:** `https://biznesoty.ru` (exact HTTPS origin, no trailing slash).

Redirect-only aliases (never APP_URL / never Better Auth `trustedOrigins`):

| Host | Notes |
|---|---|
| `www.biznesoty.ru` | → `biznesoty.ru` |
| `biznesoty.online` | → `biznesoty.ru` |
| `www.biznesoty.online` | → `biznesoty.ru` |
| `бизнесоты.рф` / `xn--90aifd0ahuj5f.xn--p1ai` | → `biznesoty.ru` |

Host policy: `src/server/http/canonical-host.ts` + Next.js `src/proxy.ts` (308 GET/HEAD; 403 unsafe methods on aliases). Exempt: `/api/health*`, `/api/telegram/*`, `/api/vk/*`, `/api/meta/webhook`.

**Do not set `APP_URL=https://biznesoty.ru` until DNS is verified and the TLS certificate is ready.**

## Railway (authoritative for Closed Beta / new environments)

```
GitHub (main)
  → Railway project
      → PostgreSQL (shared)
      → web
      → telegram-worker
      → vk-worker
```

### Config files in repo

| Service | Config |
|---|---|
| web | `deploy/railway/web.json` |
| telegram-worker | `deploy/railway/telegram-worker.json` (also `worker.json` compatibility copy) |
| vk-worker | `deploy/railway/vk-worker.json` |

### Web (`deploy/railway/web.json`)

- Build: Dockerfile
- Pre-deploy: `node --import tsx scripts/db-migrate.mts`
- Start: `npm run start -- --hostname 0.0.0.0` (respects Railway `PORT`)
- Health: `/api/health/web` (timeout 120s)
- Restart: ON_FAILURE, max 5

### Workers

- Telegram start: `npm run worker:telegram`
- VK start: `npm run worker:vk`
- No public HTTP domain required
- Share the same `DATABASE_URL` / `APP_URL` / secrets as web (Railway variable references)
- Pre-deploy also runs migrations (idempotent) so a worker can start before web on a fresh DB

### Recommended bring-up order

1. Create PostgreSQL service.
2. Create **web**; set `DATABASE_URL` as a **Railway reference** to Postgres (do not paste passwords into docs).
3. Set remaining env (see `.env.example` / section below) — never commit secrets.
4. Deploy web (migrations run in preDeploy).
5. Confirm `GET /api/health/web` → 200.
6. Create **telegram-worker** with the same env references; enable `TELEGRAM_WEBHOOKS_ENABLED` only when ready.
7. Create **vk-worker** similarly.
8. Wire domains / integrations / E2E.

### Historical note

Existing Closed Beta may still live in Railway project **Sreda-staging** (legacy project name). Attaching `biznesoty.ru` there means the public brand points at staging until a future production move. Session cookies from `*.up.railway.app` do not transfer to `biznesoty.ru` — users may need to sign in again after cutover.

## Required environment names (values never documented here)

**Core:** `APP_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_DATA_SOURCE`

**Workers / channels:** `TELEGRAM_WEBHOOKS_ENABLED`, `VK_WEBHOOKS_ENABLED`

**Meta (optional):** `META_WEBHOOKS_ENABLED`, `WHATSAPP_WEBHOOKS_ENABLED`, `INSTAGRAM_WEBHOOKS_ENABLED`, `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`, `META_INSTAGRAM_LOGIN_CONFIG_ID`

**AI (optional):** `AI_API_TOKEN`, `AI_MODEL`

**Storage:** `ATTACHMENT_STORAGE`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `ATTACHMENT_STORAGE_PATH`, `S3_URL_STYLE`

**SMTP (optional):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`

Full authoritative list: [docs/ENV.md](ENV.md).

## Optional self-hosted / Yandex path

- Compose + Caddy under `deploy/`
- Manual workflow `.github/workflows/deploy-yandex.yml`
- Install prefix examples use `/opt/biznesoty/`

## Pre-deploy habits

1. Merge only through CI Verify on the commit you deploy.
2. Migrate on a DB copy first when schema changes are risky.
3. Toggle webhooks off during worker cutovers if dual-process overlap is possible.
4. Keep staging bots/tokens isolated from any future production bots.
