# Security

## Authentication

- better-auth username/password (`src/server/identity`), app name «Соты».
- Sessions: HttpOnly cookies, `cookieCache` disabled, DB-backed tokens, CSRF/Origin checks on mutating routes.
- Password min length 10; change password revokes other sessions; login races check current password hash.
- Rate limits on auth endpoints (DB + app-level counters).

## Recovery codes

- Eight one-time codes issued after registration / on demand with current password.
- Stored as hashes only; plaintext shown once at issue time.
- `/recover`: username + code + new password; no auto-login; sessions revoked on success.
- Spec detail: `docs/architecture/RECOVERY-CODES.md`.

## Tenant isolation

- Every business API path goes through membership + permission.
- Foreign/missing resources → identical 404.
- Workers derive business from verified `business_connection`, never from client input.
- Channel secrets encrypted (AES-GCM); never returned by API or written to audit payloads.

## Staff notifications

- Destinations are explicit User ↔ messenger claims (`provider_identity`).
- Customer chatting with the business bot **cannot** become a staff notify target by accident.
- Migration **051** nulls `notification_binding.chat_id` that lack a matching verified identity.
- Binding flows: web settings + channel claim helpers in `src/server/notifications/`.

## Platform admin

- Separate cookie-gated `/admin` console; no impersonation.
- Bootstrap via CLI secrets only; all sensitive actions audited in `platform_admin_audit_log`.

## Account / business deletion

- Soft deletion request flows with hashed tokens and impact snapshots (migrations 048–049).
- Confirmations are explicit; do not treat UI copy as already-purged production data.

## Operational notes

- `BETTER_AUTH_SECRET` also participates in credential encryption derivation today — rotation needs a planned re-encrypt path before production key rotation drills.
- Webhooks disabled by default; enable only after isolated staging bots are configured.
- Logs: structured codes without message bodies / tokens.
