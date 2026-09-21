# Database domains

PostgreSQL + Kysely. Forward-only SQL in `/migrations` (latest: **052**). Runner: `npm run db:migrate` (`scripts/db-migrate.mts`, advisory lock).

This page lists **domains**, not a full schema dump. Source of truth for columns: `src/server/db/schema.ts` and domain `*/schema.ts` files.

## Identity & account

| Tables (selected) | Purpose |
|---|---|
| `user`, `account`, `session` | better-auth identity (username/password) |
| `recovery_code`, `account_security_event` | One-time recovery codes + security audit |
| `account_pin` | Optional site PIN |
| `account_deletion_request` | Soft account deletion flow |
| `provider_identity` | Verified User ↔ messenger identity (staff notify) |

## Workspace / tenant

| Tables | Purpose |
|---|---|
| `business` | Tenant root (timezone, branding, AI profile, onboarding) |
| `business_member` | Roles: `owner` \| `admin` \| `operator` |
| `business_invitation` | Invite by public user id |
| `business_audit_log` | Member/client/system actions (no secrets) |
| `business_deletion_request` | Owner-initiated business deletion |
| `business_creation` | Idempotency for create-business |

## Solutions & entitlements

| Tables | Purpose |
|---|---|
| `business_solution` | Activation status + `expires_at` |
| `solution_config` | Per-solution JSON + revision |
| `lead_setup` | Leads wizard draft + revision |
| `integration_key` | Revocable channel-link key |

Legacy code `sales` normalizes to `orders` in application code.

## Channels & runtime

| Tables | Purpose |
|---|---|
| `business_connection` | telegram / vk / whatsapp / instagram |
| `connection_secret` | AES-GCM encrypted tokens (`key_version`) |
| `telegram_*` / `vk_*` / `meta_*` | runtime, dialog, update dedupe, outbox |
| `meta_oauth_state` | OAuth handshake state |
| `worker_heartbeat` | telegram, vk, autopost, reminders, meta |

## CRM & communications

| Domain modules | Tables live under |
|---|---|
| Clients | `src/server/clients/schema.ts` — `client`, identities, history |
| Leads | `lead` (+ statuses / forms migrations) |
| Messages | communication dialogues/messages |
| Staff notifications | `notification_binding`, notification queue tables |

## Commerce & booking

| Domain | Notes |
|---|---|
| Orders / catalog | products, variants, stock, carts, orders (`orders` schema) |
| Booking | services, specialists, schedules, appointments, reminders |
| Calendar | entity events / reminders |
| Posts (autopost) | drafts, schedules, deliveries, targets |

## Attachments & analytics

| Domain | Notes |
|---|---|
| Attachments | S3/filesystem metadata; cleaned on access revoke |
| Analytics | uploaded files, exports, AI summaries |

## Platform admin

`platform_admin`, `platform_admin_audit_log`, `platform_suspension`, `platform_admin_bootstrap`.

## Invariants (enforced in app + FKs)

- Tenant rows carry `business_id`; cross-tenant FKs rejected.
- One external bot/community id is not shared across two businesses (`external_account_id` uniqueness by platform).
- Channel credentials never leave server APIs in plaintext.
- Migrations are append-only; do not rewrite applied files on shared environments.
