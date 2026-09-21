# Billing domain (Closed Beta)

Provider-agnostic billing architecture. **YooKassa / Stripe are not integrated** until explicitly confirmed.

## Source of truth

| Concern | Store | Notes |
|---|---|---|
| **Entitlement** (may use solution) | `business_solution` | `status` ∈ active\|trial\|expired\|disabled; `starts_at` / `expires_at` |
| Provider subscription ledger | `business_subscription` + `business_subscription_item` | Future payment state only |
| Catalog prices (docs / UI) | `billing_plan` + `src/lib/productSolutions.ts` | Seed mirrors product catalog kopecks |

There is **no** separate `billing_entitlement` table — that would duplicate `business_solution`, which admin subscriptions and bot runtimes already use.

Platform admins with `admin.subscriptions.manage` may **override** solution status/expiry (`overrideSolution`, audit `subscription.override`). That is operational, not payment confirmation.

## Domain module

`src/server/billing/`:

- `getEntitlement(businessId, solutionCode)` — read entitlement from `business_solution`
- `assertEntitlement` — throw `ENTITLEMENT_REQUIRED` when not entitled
- `assertCanGrantEntitlement` — Closed Beta no-op; **hook for paid activation**
- `BillingProvider` — `createCheckout`, `handleWebhook`
  - `NoopBillingProvider` — production default; checkout returns 501, no fake success
  - `MockBillingProvider` — **test-only**; construction throws in `NODE_ENV=production`

## Activation path

`SolutionService.activate` and leads setup completion call `assertCanGrantEntitlement` before writing `business_solution`. Today that always allows (Closed Beta). After a real provider is chosen, replace the no-op with: confirmed webhook / active subscription item → then upsert entitlement.

Client never activates “because redirect returned”. Provider event ids must be idempotent.

## Runtime hook points

Prefer `getEntitlement` / `assertEntitlement` instead of ad-hoc SQL:

| Path | Status |
|---|---|
| Autopost availability (`posts/availability`) | Uses `getEntitlement` |
| Customer bot actions (`solutions/customer-actions`) | Still inline `business_solution` query — migrate when touching |
| Telegram/VK autopost SQL filters | Still inline — migrate when touching |
| Admin subscriptions UI | Lists `business_solution` (correct) |

## UI honesty

- `/billing` shows real active solutions + catalog prices (not `PagePlaceholder`)
- Status copy: «Решения подключены · оплата не подключена»
- Next step: «Подключение оплаты — следующий шаг»
- No «payment succeeded» UI; `NoopBillingProvider.createCheckout` refuses
- Dashboard `TariffCard` shows catalog estimate, not a fake next charge

## Migration

`055_billing_domain.sql` — additive `billing_plan`, `business_subscription`, `business_subscription_item`.
