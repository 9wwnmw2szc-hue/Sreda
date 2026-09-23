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

## Lifecycle status (canonical SoT)

`SolutionService.list()` returns `lifecycleStatus` plus legacy `status` for backward compat:

| lifecycleStatus | Meaning | Legacy `status` |
|---|---|---|
| `not_connected` | No entitlement | `available` |
| `setup_in_progress` | Open setup draft or incomplete readiness | `setup_required` |
| `active` | Entitled and ready | `active` |
| `paused` | Owner soft-pause | `paused` |
| `error` | Entitled but channel/worker fail | `paused` |
| `disabled` | Owner disabled (data retained) | `available` + `entitlementStatus=disabled` |
| `expired` | Trial/subscription expired | `available` + `entitlementStatus=expired` |

Priority: disabled → expired → paused → not_connected → setup_in_progress → error → active.

### Cancel / disable / reset

| Action | API | Effect |
|---|---|---|
| Pause | `POST …/solutions` `{ code, status: "paused" }` | Soft-pause; audits `solution.paused` |
| Disable | `{ code, enabled: false }` | Entitlement off; data kept; audits `solution.disabled`; resolves setup notifications |
| Reenable / resume | `{ code, enabled: true }` | From disabled → `solution.reenabled`; from paused → `solution.resumed` |
| Cancel setup | `{ action: "cancel_setup", code }` | Draft cancelled; solution **disabled**; audits `solution.setup_cancelled` |
| Reset settings | `{ action: "reset_settings", code }` | Config reset (booking services deactivated; leads draft cleared; orders catalog kept); audits `solution.settings_reset` |

Requires `solutions.manage` (owner/admin). Operators get 403.

Auto-expire of abandoned drafts (`setup-draft-worker`) restores previous `active`/`trial`/`paused` when present; otherwise disables.

## Catalog-only / legacy

| Code | Status |
|---|---|
| `moderation` | Present in server catalog; not in owner activation allowlist |
| `sales` | Legacy alias → normalized to `orders` |

## Runtime behaviour

- Bot menu is built from **active** solutions (`getAvailableCustomerActions`). Disabled/paused omit the action; deny copy: `Эта функция временно недоступна.`
- Booking reminder worker skips queueing when booking entitlement is off.
- Unfinished setup is tracked in `solution_setup_draft` (touch / complete / cancel); abandoned drafts get a one-shot reminder.
- `leads`: form draft in `lead_setup`, fields/statuses, take-into-work in CRM; lead save advances setup draft.
- `orders`: catalog, variants (migration 052 enables per-variant prices), stock, bot cart/checkout flow (`orders-flow`).
- `booking`: services/specialists/slots, reminders via worker, bot booking flow; setup wizard persists draft step; `reset_setup` / `reset_settings` deactivates catalog without deleting clients/history.
- `admin_messages`: shared inbox; free-tier messaging limits are product copy / soft caps, not a payment gateway.
- `autopost`: schedule/recurring posts; delivery rows tied to channel outbox; `expires_at` re-checked before publish.

## Readiness gates

`SolutionService` checks entitlement first (no setup_required/active without grant), then connected channels + solution-specific prerequisites (e.g. products for orders, services for booking, targets for autopost) before presenting “ready / setup required / paused / error”.
