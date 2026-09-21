# Solutions

Catalog source: `src/lib/productSolutions.ts` + `src/server/solutions/catalog.ts`.

## Activatable (owner UI)

| Code | Name | Price (catalog) | Primary UI |
|---|---|---|---|
| `leads` | Приём заявок | 250 ₽ | `/solutions/leads/setup`, `/leads` |
| `orders` | Приём заказов | 250 ₽ | `/orders` (+ ProductEditor) |
| `booking` | Онлайн-запись | 250 ₽ | `/bookings` (+ BookingSetupWizard) |
| `admin_messages` | Связь с администратором | 0 ₽ (soft cap 300 msgs/mo in copy) | `/messages` |
| `autopost` | Автопостинг | 250 ₽ | `/posts` |

Activation allowlist: `ACTIVATABLE_SOLUTIONS`. Status stored in `business_solution`.

## Catalog-only / legacy

| Code | Status |
|---|---|
| `moderation` | Present in server catalog; not in owner activation allowlist |
| `sales` | Legacy alias → normalized to `orders` |

## Runtime behaviour

- Bot menu is built from **active** solutions (`getAvailableCustomerActions`).
- `leads`: form draft in `lead_setup`, fields/statuses, take-into-work in CRM.
- `orders`: catalog, variants (migration 052 enables per-variant prices), stock, bot cart/checkout flow (`orders-flow`).
- `booking`: services/specialists/slots, reminders via worker, bot booking flow.
- `admin_messages`: shared inbox; free-tier messaging limits are product copy / soft caps, not a payment gateway.
- `autopost`: schedule/recurring posts; delivery rows tied to channel outbox; `expires_at` re-checked before publish.

## Readiness gates

`SolutionsService` checks connected channels + solution-specific prerequisites (e.g. products for orders, services for booking, targets for autopost) before presenting “ready / setup required”.
