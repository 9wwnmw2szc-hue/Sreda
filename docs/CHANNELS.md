# Channels

Platform type: `ChannelPlatform` in `src/server/channels/types.ts`.

| Platform | Status in codebase | Webhook / entry |
|---|---|---|
| `telegram` | Production-path for staging | `/api/telegram/[connectionId]` |
| `vk` | Production-path for staging | `/api/vk/[connectionId]` |
| `whatsapp` | Meta Cloud API code present | `/api/meta/webhook` (+ OAuth) |
| `instagram` | Meta Messaging code present | same Meta webhook |
| `max` | Typed in frontend labels only | **no adapter** |

Env flags (see `.env.example`): `TELEGRAM_WEBHOOKS_ENABLED`, `VK_WEBHOOKS_ENABLED`, `META_WEBHOOKS_ENABLED` / `WHATSAPP_*` / `INSTAGRAM_*`. Workers refuse to start unless the matching flag is `true`.

## Meta (WhatsApp / Instagram) readiness

Code is merged; **do not treat as LIVE** until env + App Review are complete.

| UI state | Meaning |
|---|---|
| Не настроено | Meta env / app id missing |
| Требуется настройка Meta | App credentials present; business OAuth not finished |
| Подключено | OAuth + webhook verify succeeded for this business |
| Ошибка | Runtime/webhook signature/tenant resolution failed |
| Требуется повторное подключение | Token revoked / expired / re-auth needed |

Checklist before claiming staging Meta smoke:
1. `META_WEBHOOKS_ENABLED=true` and matching verify token / app secret (never log values).
2. Webhook signature verification on inbound.
3. Tenant resolution via `business_connection` + `meta_runtime`.
4. Outbox path for outbound; 24h WhatsApp customer-care window enforced.
5. Instagram messaging rules respected.
6. Fake “Подключено” without successful OAuth is forbidden.

`max` remains non-blocking for Closed Beta — see [CHANNEL_ADAPTER.md](CHANNEL_ADAPTER.md).

## Connection model

- Row: `business_connection` (status `pending` → `connected` / `error` / `disconnected`).
- Secrets: `connection_secret` (encrypted bot/community tokens; optional VK publish token).
- Runtime: `telegram_runtime` / `vk_runtime` / `meta_runtime`.
- Uniqueness: one external account id per platform globally — cannot attach the same bot to two businesses.

## Operator UX

Connections UI: `/connections`. Tokens entered in UI, never as `NEXT_PUBLIC_*`. Meta uses app credentials from env + per-business OAuth state (`meta_oauth_state`).

## Staff vs customer

- Customer chats drive CRM / bot flows.
- Staff push notifications require a **verified** `provider_identity` bound to the member (migration 051 clears polluted destinations). See [SECURITY.md](SECURITY.md).

## Channel-admin

Binding employees as channel admins: `src/server/channel-admin/*`, docs in `docs/channel-admin/README.md`.
