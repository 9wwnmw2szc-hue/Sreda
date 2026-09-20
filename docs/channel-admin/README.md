# Channel admin (Telegram / VK)

One business-admin domain with three UIs:

| Surface | Who | Purpose |
| --- | --- | --- |
| Web cabinet | Business members | Bind/revoke Telegram or VK identities, settings |
| Channel bot (`/admin`) | Bound members | Operate leads, orders, bookings, profile from the messenger |
| Platform admin | Soty staff | Unrelated — never mixed with channel admin |

Customer bot dialogs (`/start`, заявки, каталог) stay separate. A messenger user only gets business-admin rights after a web-issued one-time challenge is consumed and `business_channel_admin` is active **and** `business_member` is active.

Binding flow: Settings → Доступ → challenge → user sends `admin_<token>` (or `/start admin_<token>` in Telegram) → `provider_identity` + `business_channel_admin`.

Wizard state lives only in `channel_admin_session` (draft JSON). Authoritative data and permissions always come from DB membership + binding, re-checked on every mutation.
