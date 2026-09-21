# Billing

## Current state (Closed Beta)

- Owner UI `/billing` is a **placeholder** (`PagePlaceholder`): no checkout, no card capture, no live payment provider.
- Solution “prices” in `productSolutions.ts` are **catalog copy** for activation UX, not invoices.
- Entitlements are rows in `business_solution` (`active` / `trial` / `expired` / `disabled`, optional `expires_at`).
- Platform admins with `admin.subscriptions.manage` can **override** solution status/expiry (`overrideSolution`, audit `subscription.override`). This is operational, not payment confirmation.

There is **no** integrated ЮKassa, Stripe, or other PSP in this repository as a live path. Do not document fake providers as connected.

## Planned direction

Provider-agnostic billing domain:

1. Canonical entitlement events (activate / renew / expire / grace) applied to `business_solution`.
2. Payment provider adapters behind a narrow interface (confirm webhook → entitlement mutation).
3. Owner billing UI reads server truth only; client never “activates because redirect returned”.
4. Idempotent provider event ids; no entitlement change without a verified event or explicit admin override with audit reason.

Until that lands, Closed Beta relies on free/trial activation rules in product code plus admin overrides.
