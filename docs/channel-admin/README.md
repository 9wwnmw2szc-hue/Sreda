# Channel admin (Telegram / VK)

One business-admin domain with three UIs:

| Surface | Who | Purpose |
| --- | --- | --- |
| Web cabinet | Business members | Bind/revoke Telegram or VK identities, settings |
| Channel bot (`/admin`) | Bound members | Operate leads, orders, bookings, profile from the messenger |
| Platform admin | Soty staff | Unrelated — never mixed with channel admin |

Customer bot dialogs (`/start`, заявки, каталог) stay separate. A messenger user only gets business-admin rights after a web-issued one-time challenge is consumed and `business_channel_admin` is active **and** `business_member` is active.

## Binding

1. Settings → Доступ через Telegram / VK → challenge
2. User sends `admin_<token>` (or `/start admin_<token>` in Telegram)
3. Backend creates/updates `provider_identity` + `business_channel_admin`
4. Every admin action re-resolves identity → user → BusinessMember → permissions

Revoke (web) or member removal clears binding + session immediately.

## Models

| Table | Role |
| --- | --- |
| `provider_identity` | Stable TG/VK user id ↔ Soty user |
| `business_channel_admin` | Per-business admin grant for a bound identity |
| `channel_admin_challenge` | One-time, TTL, hashed token |
| `channel_admin_session` | Wizard FSM only (not source of truth) |

Reuses: `business`, `business_member`, OrderService, BookingService, audit log, solutions.

## Parity matrix

| Function | Web | TG | VK | Domain | Permission |
| --- | --- | --- | --- | --- | --- |
| Bind / revoke channel admin | ✓ | consume challenge | consume challenge | ChannelAdminBindingService | settings.manage |
| Business name / greeting | ✓ | ✓ | ✓ | business update + audit | settings.manage |
| Leads list / status | ✓ | ✓ | ✓ | lead + history | leads.write |
| Orders list / status | ✓ | ✓ | ✓ | OrderService.transitionStatus | orders.write |
| Bookings list / cancel/complete | ✓ | ✓ | ✓ | BookingService.changeInTransaction | booking.write |
| Autopost list | ✓ | read | read | post table | posts.manage / clients.read |
| Stats snapshot | ✓ | ✓ | ✓ | counts | analytics.view |
| Inbox reply | ✓ | deep link to web | deep link to web | — | — |
| Catalog bulk / analytics Excel | ✓ | web link | web link | — | — |

Wizard state lives only in `channel_admin_session`. Authoritative data and permissions always come from DB membership + binding, re-checked on every mutation.

## Web-only (intentional)

- Bulk product import / large table editing
- Advanced analytics / Excel export
- Full Inbox compose UI (channel opens site link)
- Autopost create with media/recurrence (list + site link for now)
- Full schedule wizard (hours/exceptions) — use web; name/greeting available in channel

## Security

- `/admin` alone never grants rights
- Username / display name / business id in payload are not trust roots
- Forged other-business entity ids are scoped by `business_id` on every query
- Nested OrderService `runInTx` is transaction-safe (`isTransaction` reuse)
