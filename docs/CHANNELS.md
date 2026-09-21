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
