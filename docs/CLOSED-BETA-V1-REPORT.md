# Closed Beta v1.0 — финальный отчёт (§79)

Дата: 2026-09-21. Окружение: **Sreda-staging** only. Production не деплоился.

## 1. MAIN SHA до начала hardening

`429e21d60090671b541f41d1eb72d3a8ac503e2a` — merge PR **#53**  
(Products, booking setup, bot navigation, order modal contrast)

## 2. Рассмотренные PR (релевантные Closed Beta)

| PR | Title | Result |
|---|---|---|
| #53 | Products, booking setup, bot navigation, order modal contrast | **MERGED** → `429e21d` |
| #54 | Soty Closed Beta v1.0 hardening | **MERGED** → `45e1694` |
| #52…#40 | Partner QA, Meta, admin, deletion, UI polish | MERGED earlier (база) |

Legacy draft #6–#13 — не merge-кандидаты.

## 3. PR #53 result

**MERGED** 2026-09-21T17:43:10Z.  
Head: `cursor/soty-products-booking-bot-ux-258e`.  
Merge commit: `429e21d60090671b541f41d1eb72d3a8ac503e2a`.  
Включено: ProductEditor / variants / photos / inventory, BookingSetupWizard, bot screen nav, `request_contact`, customer profile, money formatter, order modal contrast, migration **052**.

## 4. Созданные branches

- `cursor/soty-beta-v1-hardening-258e` — основная интеграционная ветка Closed Beta
- `cursor/soty-beta-v1-report-258e` — синхронизация README + этот отчёт (после merge #54)

## 5. Созданные PR

- [#54](https://github.com/9wwnmw2szc-hue/Sreda/pull/54) — **Soty Closed Beta v1.0 hardening** (MERGED)

## 6. Merge SHA (#54)

`45e1694603485b71bc63eee4e94ea6cba4a161ce`

## 7. FINAL_MAIN_SHA

`45e1694603485b71bc63eee4e94ea6cba4a161ce`

Railway **Sreda-staging** (все code services, `commitHash` совпадает):

| Service | Deployment | Status | commitHash |
|---|---|---|---|
| web | `e9ce188d-…` | SUCCESS | `45e1694…` |
| telegram-worker | `58febb7d-…` | SUCCESS | `45e1694…` |
| vk-worker | `56551c90-…` | SUCCESS | `45e1694…` |

## 8. Migrations (additive)

Уже на staging до hardening: … → **052** `product_variant_prices_enabled`.

Добавлены в #54 и применены на staging (verified в web/worker logs):

| # | File |
|---|---|
| 053 | `product_low_stock_threshold.sql` |
| 054 | `client_merge_search.sql` |
| 055 | `billing_domain.sql` |
| 056 | `ai_usage_event.sql` |
| 057 | `notification_types_product_events.sql` |
| 058 | `self_service_policies.sql` |

**LATEST_MIGRATION:** `058_self_service_policies.sql`

## 9. Изменённые / доведённые domain modules

- `src/server/search` — глобальный tenant-scoped search
- `src/server/clients` — controlled merge + audit
- `src/server/billing` — provider-agnostic domain (Noop/Mock в tests; без fake payment success в UI)
- `src/server/ai/usage.ts` — usage accounting + daily limits
- `src/server/orders` — low-stock notify (dedupe), customer cancel policies
- `src/server/booking` — customer cancel/reschedule policies
- `src/server/communications` — `waiting_since`, internal notes, reply templates
- `src/server/import` — entity import (customers/products)
- `src/server/analytics` — privacy-conscious product events + admin activation funnel
- `src/server/observability` / `http` — request/correlation IDs, structured logs
- `src/server/account` — sessions list / revoke
- Settings IA, onboarding checklist, design tokens (тёмная тема Соты)

## 10. Новые / расширенные API (примеры)

- `/api/v1/businesses/[id]/search`
- `/api/v1/businesses/[id]/clients/merge`
- `/api/v1/businesses/[id]/import`
- `/api/v1/businesses/[id]/reply-templates`
- `/api/v1/account/sessions`
- Health: `/api/health`, `/api/health/web`, `/api/health/live`
- Billing entitlement surfaces через существующие solutions/settings (без live payment charge)

## 11. Tests

- ~44 `tests/*.test.mjs` файлов; полный прогон CI зелёный на merge #54
- Новые: `beta-hardening`, `billing-domain`, `search-merge`, `closed-beta-ai-import`, `self-service-policies`, …
- Playwright scaffold: `e2e/critical-path.spec.mjs`

## 12. Staging smoke / health

- `GET /api/health` → 200 `{ ok, web, database, telegram, vk, autopost, booking_reminders }`
- `GET /api/health/web` → 200
- `GET /api/health/live` → 200
- Migrations 052–058 verified в deploy logs
- Visual smoke screenshots: `/opt/cursor/artifacts/screenshots/staging-walkthrough/`  
  (`login-390`, `register-390`, `login-1440`, `dashboard-or-login-390`)

## 13. Документация

Обновлены/созданы: README, ARCHITECTURE, DATABASE, SOLUTIONS, CHANNELS, CHANNEL_ADAPTER, PERMISSIONS, WORKERS, BILLING, SECURITY, BACKUP, DEPLOYMENT, RELEASE, E2E, ROADMAP, BETA-STATE, этот отчёт.

## 14. Блокеры / сознательно вне Closed Beta DoD

| Item | Status |
|---|---|
| Выбор реального RU payment provider | **Blocked** — нужна явная санкция владельца; архитектура + adapter без fake success |
| Meta WhatsApp/Instagram App Review / live credentials | **External** — код есть; UI показывает готовность, не fake «Подключено» |
| Полноценный email password-reset | Recovery codes / PIN path есть; email delivery зависит от mail provider config |
| MAX channel | P2 / not Beta blocker — adapter doc only |
| Production deploy | **Запрещён** ТЗ |
| Staging DB reset / new Postgres | **Не делалось** |

## 15. Quality bar (§78) — фактический статус

| Критерий | Статус |
|---|---|
| Register → create business | Staging UI smoke OK |
| Понятный UI / settings IA | Hardened |
| Activate solution + TG/VK connect | Существующий контур; health workers OK |
| Catalog / booking setup | PR #53 + self-service policies |
| Process customer action | Domain + bot menu (вкл. «Мои заказы») |
| Find client / timeline / merge | Search + merge + CRM |
| Notifications | Center + types; low-stock dedupe |
| Invite staff | Existing invitations + permissions |
| Data survives worker restart | Outbox/claim model; workers Online |
| Tenant isolation | Server-side + tests |
| Backup/restore procedure | Documented in BACKUP.md (restore drill — ops checklist) |

## Verdict

**Closed Beta v1.0 engineering gate закрыт на `45e1694` в Sreda-staging.**  
Оплата live и Meta production readiness остаются внешними блокерами; всё остальное из ТЗ, что не требует secrets/provider choice/production, доведено в main.
