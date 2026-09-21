# Closed Beta v1.0 — Final Acceptance

Date: 2026-09-21
Target SHA: 45e1694603485b71bc63eee4e94ea6cba4a161ce
Environment: Sreda-staging only

## Verdict

**CLOSED BETA NOT ACCEPTED**

P0 real channel E2E (Telegram/VK customer flows) and real booking customer E2E remain UNVERIFIED. Restore drill not executed.

## GitHub

- origin/main HEAD = 45e1694603485b71bc63eee4e94ea6cba4a161ce
- Contains merge PR #54
- Open: PR #55 docs-only; legacy drafts #6–#13 (not merge candidates)
- Feature branches with 0 commits ahead of main are historical tips

## Railway

| SERVICE | SOURCE BRANCH | DEPLOYMENT ID | DEPLOYED SHA | STATUS |
|---|---|---|---|---|
| web | main | e9ce188d-df5a-4ee2-a63f-58f7c4f71a6f | 45e1694603485b71bc63eee4e94ea6cba4a161ce | SUCCESS |
| telegram-worker | main | 58febb7d-3c48-4bc3-9448-066e870d8760 | 45e1694603485b71bc63eee4e94ea6cba4a161ce | SUCCESS |
| vk-worker | main | 56551c90-aaf9-4b51-bcdf-134aab718cc3 | 45e1694603485b71bc63eee4e94ea6cba4a161ce | SUCCESS |

No other code workers.

## Migrations (deploy logs verified)

053–058: APPLIED (OK migration … verified). Head 058_self_service_policies.sql

## Quality gate

### CI Verify on 45e1694 (authoritative)

- TEST FILES: 44 (`tests/*.test.mjs`)
- TOTAL TESTS: 333
- PASSED: 333
- FAILED: 0
- SKIPPED: 0
- lint: pass (4 unused-var warnings in billing noop stubs)
- typecheck: pass
- build: pass
- test:http: 11 passed / 0 failed
- docker image import smoke: pass

### Local agent re-run (informational)

- TOTAL 333 / PASS 322 / FAIL 0 / SKIPPED 11
- Skipped group: concurrency tests requiring PostgreSQL multi-connection (`TEST_DATABASE_URL`); run in CI
- Local `npm run build` fails on `/_global-error` prerender in this agent Node image — CI + Railway Docker build succeed on same SHA (environment-specific, not treated as product FAIL)
- Local `test:http` needs TEST_DATABASE_URL (CI covers)

### Playwright smoke vs staging

- 2 passed (login/register overflow + health)

## Staging real tests executed

PASS:
- Register → recovery continue → create business
- Activate orders + booking solutions via API
- Product «Тестовые шорты» variants; M/Чёрный stock 1→0; second checkout OUT_OF_STOCK; cancel restore 0→1; repeat cancel blocked; public number #1001
- Tenant isolation GET cross-business → 404 for product/orders/clients/conversations/bookings
- Health web/db/telegram/vk workers ok
- Auth UI pages 390/1440 no horizontal overflow (tested routes)

UNVERIFIED:
- Real Telegram customer bot catalog→checkout→Мои заказы
- Real Telegram security (customer must not get staff notify) with verified staff binding
- Real VK E2E
- Booking: create service/schedule/slot/customer booking on staging (API shape not completed; UI wizard not fully driven)
- Worker manual stop/restart on staging (avoided; automated claim tests only)
- Backup restore drill

EXTERNAL BLOCKER:
- Live payment provider
- Meta App Review / WhatsApp+Instagram live
- Telegram/VK customer E2E requires bot/community tokens + customer messenger accounts not available to this agent without secrets

## Actions to ACCEPTED

1. Execute real Telegram customer E2E on staging bot (menu, catalog, variants, request_contact, order #, stock, Мои заказы)
2. Execute Telegram security E2E with verified BusinessMember binding (or mark staff path separately if binding absent)
3. Execute real VK inbound/outbound + inbox routing E2E
4. Complete booking wizard on staging: service «Тестовая стрижка» 60m + schedule + customer booking + cancel/reschedule policy
5. Isolated TEST RESTORE of Railway snapshot into temporary DB; document result; destroy temp resource
