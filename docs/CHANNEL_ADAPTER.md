# Channel adapter contract

Adapters live under `src/server/{telegram,vk,meta}`. Shared customer bot logic is **not** inside adapters: it is `src/server/bot/routeBot` and solution flows.

## Responsibilities

| Step | Adapter does | Adapter must not |
|---|---|---|
| Verify | Provider signature / secret / confirmation | Trust browser session |
| Dedup | Insert update id; ignore duplicates | Replay side effects |
| Resolve tenant | Load connection → `business_id` | Accept client-supplied business id |
| Normalize | Map inbound text/attachments/buttons to domain input | Write leads/orders directly with raw provider payloads as source of truth |
| Invoke | Call `routeBot` / communications / Meta inbox handlers inside a DB transaction | Bypass membership / entitlement checks in domain |
| Outbound | Enqueue `*_outbox` in the same TX as domain writes | Call external HTTP send APIs from the web request path for normal replies |

## Outbox

Each platform has its own outbox table (`telegram_outbox`, `vk_outbox`, `meta_outbox`) with delivery states: `pending` → `sending` → `sent` / `failed` / `uncertain`. Workers claim rows, call provider APIs, retry with backoff. Exactly-once delivery is **not** promised; idempotency relies on provider message ids where available.

## Shared bot queue type

```ts
type BotQueue = (text, buttons?, attachmentIds?) => Promise<void>;
```

Buttons may be plain labels or Telegram `request_contact` objects (`src/server/bot/types.ts`).

## Meta specifics

`MetaChannelService` handles webhook verify challenge, signature check, WhatsApp/Instagram connection lifecycle, and `deliverOne()` from `meta_outbox`. Delivery is owned by **telegram-worker** when Meta flags are enabled (no separate meta-worker process).

## Adding a platform (checklist)

1. Extend `ChannelPlatform` + migrations for connection/runtime/update/outbox.
2. Implement verify + inbound + outbox deliver.
3. Wire webhook route under `src/app/api/…`.
4. Reuse `routeBot` / communications; do not fork CRM writes.
5. Add worker loop or fold into an existing worker with a clear ownership comment.
6. Tests for dedupe, bad signature, and tenant isolation.
