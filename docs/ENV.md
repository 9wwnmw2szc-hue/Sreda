# Environment variable manifest — БизнеСоты

Names only. Never put real secrets in git.

## Required (web + workers)

| Name | Notes |
|---|---|
| `APP_URL` | Exact origin. Production: `https://biznesoty.ru` |
| `DATABASE_URL` | Shared Postgres for web + workers (Railway reference) |
| `BETTER_AUTH_SECRET` | ≥ 32 chars; same across web + workers |
| `NEXT_PUBLIC_APP_NAME` | `БизнеСоты` |
| `NEXT_PUBLIC_DATA_SOURCE` | `api` in production builds |

## Channel flags

| Name | Notes |
|---|---|
| `TELEGRAM_WEBHOOKS_ENABLED` | `true` only when telegram-worker is live |
| `VK_WEBHOOKS_ENABLED` | `true` only when vk-worker is live |

## Meta (optional)

`META_WEBHOOKS_ENABLED`, `WHATSAPP_WEBHOOKS_ENABLED`, `INSTAGRAM_WEBHOOKS_ENABLED`,
`META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`,
`META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`, `META_INSTAGRAM_LOGIN_CONFIG_ID`

## AI (optional)

`AI_API_TOKEN`, `AI_MODEL` — if missing, AI features must fail gracefully (no web crash).

## Storage

`ATTACHMENT_STORAGE` (`s3` or `filesystem`), `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `ATTACHMENT_STORAGE_PATH`

See also `.env.example` and `deploy/app.env.example`.
