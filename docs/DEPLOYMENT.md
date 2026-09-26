# Deployment — БизнеСоты (biznesoty)

## One product, three brand entry hosts

There is **one** web app, **one** auth system, **one** dashboard.
Brand domains are entry points — not separate sites.

### Canonical (APP_URL)

```
https://biznesoty.ru
```

Exact HTTPS origin, no trailing slash. This is the only production `APP_URL`
and the only Better Auth `trustedOrigins` / `baseURL` origin.

### Redirect-only aliases (308 GET/HEAD → canonical)

| Host | Role |
|---|---|
| `www.biznesoty.ru` | apex www |
| `biznesoty.online` | brand alias |
| `www.biznesoty.online` | brand alias www |
| `бизнесоты.рф` / `xn--90aifd0ahuj5f.xn--p1ai` | Cyrillic brand alias |

Behaviour (browser-safe methods only):

```
https://biznesoty.online/login?next=/orders
  → 308 https://biznesoty.ru/login?next=/orders

https://бизнесоты.рф/register
  → 308 https://biznesoty.ru/register

https://www.biznesoty.ru/dashboard
  → 308 https://biznesoty.ru/dashboard
```

Path and query are preserved. Unsafe methods (`POST`/`PUT`/`PATCH`/`DELETE`)
on alias hosts are **403** (not body-preserving redirects).

Never set as `APP_URL` and never add to Better Auth `trustedOrigins`:

- `https://biznesoty.online`
- `https://бизнесоты.рф`
- `https://www.biznesoty.ru`
- `https://www.biznesoty.online`

Implementation: `src/server/http/canonical-host.ts` + Next.js `src/proxy.ts`.

Exempt from canonical redirect (must keep working on Railway technical host):

- `/api/health`, `/api/health/web`, `/api/health/live`
- `/api/telegram/*`, `/api/vk/*`, `/api/meta/webhook`

### Public user journey (canonical)

```
biznesoty.ru/          → public landing
  → Войти              → /login
  → Попробовать        → /register
  → (auth success)     → /dashboard (existing app)
```

Alias hosts 308 into the same journey on `biznesoty.ru`.

**Do not set `APP_URL=https://biznesoty.ru` until DNS is verified and the TLS certificate is READY.**

Code being ready ≠ domains already attached in Railway/DNS.

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
8. Attach custom domains in Railway (canonical + aliases); wait for TLS READY.
9. Set `APP_URL=https://biznesoty.ru` only after step 8.
10. Wire integrations / E2E.

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
