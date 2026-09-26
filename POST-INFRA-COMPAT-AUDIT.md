# FULL POST-INFRASTRUCTURE COMPATIBILITY AUDIT — BizneSoty / Sreda

**Дата:** 2026-09-26  
**Репозиторий:** https://github.com/kavkauzdenov/Sreda  
**Ветка отчёта:** `cursor/post-infra-compat-audit-258e`  
**Scope:** код + публичные HTTP/DNS проверки. SSH к production VPS / чтение `/opt/*` / изменение WireGuard **не выполнялись** (нет доступа агента; секреты не запрашивались).

---

## 0. Краткий вердикт

| Область | Статус |
|---|---|
| Публичный сайт `https://biznesoty.ru` | **OK** (HTTPS, landing→dashboard) |
| `/api/health` | **OK** — web/db/telegram=ok; vk/autopost/booking_reminders=disabled |
| `/api/health/web` | **OK** |
| Telegram flow (код) | **Совместим** с `TELEGRAM_WEBHOOKS_ENABLED=true`; start не блокируется `SolutionService` defaults |
| OpenAI / Telegram egress (DNS vs Known AllowedIPs) | **Совпадают** с текущими A-записями |
| Meta Graph egress (DNS vs Known AllowedIPs) | **Расхождение** — текущий `graph.facebook.com` → `31.13.66.4`, не `31.13.72.*` |
| Auth / APP_URL / cookies (код) | **Согласованы** (единый origin) |
| Host source vs Docker image | **Не проверено на VPS** (нужен SSH) — см. §20 |
| WireGuard | **Не менялся** |

---

## 1. Контекст production (из ТЗ + публичная проверка)

| Параметр | Значение |
|---|---|
| RU VPS (ТЗ) | 178.21.11.78 — `/opt/biznesoty`, `/opt/sreda` |
| NL VPS (ТЗ) | 178.217.100.169 |
| Domain | https://biznesoty.ru |
| Контейнеры (ТЗ) | deploy-app-1, deploy-caddy-1, deploy-db-1, deploy-telegram-worker-1 |
| Image (ТЗ) | biznesoty:latest |
| WG | selective (не full-tunnel): Telegram/Meta/OpenAI → NL; VK → direct |

Публично подтверждено 2026-09-26:

```json
{"ok":true,"checks":{"web":"ok","database":"ok","telegram":"ok","vk":"disabled","autopost":"disabled","booking_reminders":"disabled"}}
```

---

## 2. Уже проверенные infra-состояния (из ТЗ — не повторялись на VPS)

Использованы как исходная точка: wg0 up, handshake OK, default route через ens3, Known AllowedIPs, NL ip_forward/NAT, HTTP reachability Meta 400 / OpenAI 404 / Telegram 200 = TCP/TLS endpoint достижим.

---

## 3. TELEGRAM — особый фокус

### Как включается

`src/server/runtime.ts`:

```ts
telegramEnabled: process.env.TELEGRAM_WEBHOOKS_ENABLED === "true"
```

Строгое сравнение с `"true"`.

### `SolutionService` и `private readonly telegramEnabled = false`

**Файл:** `src/server/solutions/service.ts` (constructor defaults).

| Вопрос | Ответ |
|---|---|
| Почему hardcoded false? | Fail-closed **default параметров** конструктора, не «всегда выкл» |
| Legacy? | Да, по смыслу — дефолт для внутренних `new SolutionService(tx)` без флагов |
| Влияет на UI readiness? | Да — `list()` AND-ит `ready` с флагом |
| Блокирует start? | **Нет** — start идёт через `TelegramService(..., getRuntime().telegramEnabled)` |
| Конфликт с runtime? | На основном HTTP-пути **нет**: `createSolutionHandler(getRuntime())` передаёт флаги |
| Менять false→true вслепую? | **Нет** — правильная семантика: readiness = env + heartbeat + runtime status |

**Вердикт:** не CRITICAL для start. HIGH только если кто-то вызовет `list()` без флагов из runtime (основной route этого не делает).

### Условия ошибок

| Код | Когда |
|---|---|
| `TELEGRAM_DISABLED` | `TELEGRAM_WEBHOOKS_ENABLED !== "true"` на web |
| `SETUP_REQUIRED` | draft/решение не даёт entitlement |
| `CONNECTION_REQUIRED` | нет connected `business_connection` telegram |
| UI «после подготовки сервера» | точное сообщение сервера при `TELEGRAM_DISABLED` (passthrough через apiClient) |

Production health `telegram=ok` ⇒ флаг включён и heartbeat жив.

---

## 4. HOST SOURCE VS DOCKER IMAGE

| Проверка | Результат |
|---|---|
| git revision на `/opt/biznesoty` | **Нет доступа** (SSH) |
| commit production image | **Нет доступа** |
| Соответствие кода в контейнере (runtime/telegram/solutions) | **Нет доступа** |

**Рекомендация на VPS (read-only):**

```bash
cd /opt/biznesoty && git rev-parse HEAD && git status -sb
docker inspect deploy-app-1 --format '{{.Image}} {{.Config.Image}}'
docker exec deploy-app-1 sh -c 'grep -n telegramEnabled /app/src/server/runtime.ts /app/src/server/solutions/service.ts 2>/dev/null || find /app -name "runtime.js" | head'
# Prefer: сравнить label/commit, зашитый при сборке образа, с git HEAD
```

Не считать host tree = production runtime без проверки image.

---

## 5. ENVIRONMENT AUDIT (по репозиторию)

Критические имена (секреты **не** выводились):

- `TELEGRAM_WEBHOOKS_ENABLED`, `VK_WEBHOOKS_ENABLED`
- `META_*` / `WHATSAPP_*` / `INSTAGRAM_*`
- `APP_URL`, `DATABASE_URL`, `BETTER_AUTH_SECRET`
- `NEXT_PUBLIC_DATA_SOURCE` (build-time в Dockerfile = `api`)
- `AI_API_TOKEN`, `AI_MODEL`, `S3_*`

| Риск | Severity | Статус |
|---|---|---|
| Compose: app и worker делят один `app.env` | — | OK by design |
| Railway: env синхронизируется вручную | HIGH (ops) | Документировать checklist |
| Boolean только `"true"` | MEDIUM | Намеренно; не ломать |
| `deploy/app.env.example` без Meta | HIGH | **Исправлено в этом PR** |
| Дублирующие config sources | LOW | runtime единый |

---

## 6. TELEGRAM FLOW TRACE (код)

```
UI (LeadsSetupView / ConnectionsView)
 → apiClient (message passthrough)
 → POST /api/v1/businesses/[id]/telegram/start
 → createSolutionHandler(getRuntime())
 → TelegramService.start(enabled from env)
 → SolutionService.business / entitlement / connection
 → business_connection + connection_secret + telegram_runtime
 → setWebhook → Telegram API
 → telegram-worker (heartbeat, outbox, receive path)
```

Gates: origin/session/rate-limit → TELEGRAM_DISABLED → SETUP_REQUIRED → CONNECTION_REQUIRED → webhook.

---

## 7–8. OPENAI / META / VK + Browser vs Server

| Endpoint | Side | Hostname | Через WG? | AllowedIPs match (DNS 2026-09-26) |
|---|---|---|---|---|
| OpenAI | Server | `api.openai.com` | Да | **Да** (`162.159.140.245`, `172.66.0.243`) |
| Telegram Bot | Server | `api.telegram.org` | Да | **Да** (`149.154.166.110`) |
| Meta Graph / WA / IG | Server | `graph.facebook.com` | Да | **Нет** (`31.13.66.4` ∉ `31.13.72.*`) |
| FB SDK | Browser | `connect.facebook.net` | Нет (клиент) | N/A для WG VM |
| VK API | Server | `api.vk.com` | Direct | OK (не в WG) |

`redirect: "error"` на server fetch — host hopping минимален.  
IPv6 AAAA есть у OpenAI/Telegram/Meta — **не** в Known AllowedIPs (риск dual-stack).

**WireGuard AllowedIPs не менялись** — требуется явное подтверждение владельца.

---

## 9. CADDY / DOMAIN / HTTPS

| Host | Результат |
|---|---|
| `biznesoty.ru` | HTTPS OK |
| `biznesoty.online` | OK → redirect на biznesoty.ru |
| `www.biznesoty.ru` | **TLS fail** (нет валидного сертификата на alias) |

**Исправлено в репо:** `deploy/Caddyfile` — TLS + reverse_proxy для `www.{$SREDA_DOMAIN}`, `biznesoty.online`, `xn--90aifd0ahuj5f.xn--p1ai`. Нужен redeploy Caddy на VPS.

---

## 10. DATABASE (код + публичный health)

- App health показывает `database=ok`
- Compose: `DATABASE_URL` → host `db` (не localhost)
- Worker и app делят тот же `app.env` → один DATABASE_URL
- Миграции: `deploy/release.sh` → profile `migrate`
- Production data **не изменялись**

---

## 11. WORKERS

| Worker | Код | Prod health |
|---|---|---|
| telegram-worker | profile `telegram`, gate `TELEGRAM_WEBHOOKS_ENABLED` | heartbeat ok |
| vk-worker | profile `vk` | disabled (флаг off) |
| Meta outbox | внутри telegram-worker | зависит от META_* flags |

Дубликаты контейнеров с VPS не проверялись (нужен `docker ps`).

---

## 12. DOCKER / COMPOSE

Source of truth для Yandex: `/opt/sreda/deploy/compose.yml` + `/opt/sreda/app.env` + image registry tag.

**Исправлено:**

1. `deploy/compose.yml` — healthcheck app → `/api/health/web`
2. `deploy/release.sh` — сначала web health, затем full `/api/health` если включены telegram/vk

---

## 13. ROUTING AUDIT

Требование selective routing соблюдено в коде (нет full-tunnel, нет HTTP_PROXY).  
**Инфра-риск:** Meta Graph DNS drift относительно /32 AllowedIPs.

---

## 14. APPLICATION COMPATIBILITY SEARCH

| Паттерн | Находка |
|---|---|
| `...Enabled = false` | Только defaults в `SolutionService` — см. §3 |
| Feature flags env | `=== "true"` везде для webhooks |
| Hardcoded API hosts | openai/telegram/vk/graph — ожидаемо |
| localhost prod risk | Нет опасного egress на localhost |
| Railway hosts | canonical-host + e2e/docs (staging) |
| NEXT_PUBLIC | `DATA_SOURCE` bake в image |

---

## 15. AUTH / COOKIES / PROXY

- Better Auth: `trustedOrigins = [APP_URL origin]`
- Secure cookies при https APP_URL
- `credentials: "same-origin"` совместим с canonical host
- Alias hosts намеренно **не** в trustedOrigins

---

## 16. HEALTH / READINESS

| Endpoint | Назначение |
|---|---|
| `/api/health/live` | процесс |
| `/api/health/web` | web+DB (deploy gate app) |
| `/api/health` | + worker heartbeats |

Production: health telegram=ok согласован с живым worker. Расхождение «health ok / UI не готов» при выключенном флаге объясняется `TELEGRAM_DISABLED`, не stale health.

---

## 17. UI COMPATIBILITY

- `LeadsSetupView` / `ConnectionsView` показывают server `error.message` as-is
- Нет hardcoded frontend «сервер не подготовлен» aparte от passthrough
- Success copy оптимистичен (start ≠ worker proof) — LOW UX

---

## 18. BUILD / TYPECHECK / TEST

Прогон на ветке аудита (2026-09-26):

| Команда | Результат |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS (4 pre-existing warnings в billing stubs) |
| `NODE_ENV=production npm run build` | PASS |
| `npm test` | 381 pass / 2 fail / 11 skip |

2 failing unit tests (также известны на `main`, не регрессия этого PR):

- `dashboard lead service reads real API data…`
- `lead page client saves statuses…`

Исправление lead-тестов **не** входило в scope infra-compat; не смешивались с deploy-фиксами.

---

## 19–20. ИСПРАВЛЕНИЯ В ЭТОМ PR + IMAGE

### Изменённые файлы

| Файл | Почему |
|---|---|
| `deploy/compose.yml` | App health не должен зависеть от worker heartbeats |
| `deploy/release.sh` | Двухэтапный gate: web → full при включённых workers |
| `deploy/app.env.example` | Meta/WA/IG keys — иначе Yandex env неполный |
| `deploy/Caddyfile` | TLS для alias/www (исправление www TLS fail) |
| `POST-INFRA-COMPAT-AUDIT.md` (этот файл) | Вывод по ТЗ |

### Не менялось (намеренно)

- WireGuard AllowedIPs / full-tunnel
- Secrets / `.env` / BETTER_AUTH_SECRET / DATABASE_PASSWORD
- `SolutionService` defaults false → true
- Production DB / volumes / DNS records
- Отключение Telegram/OpenAI/Meta

### Host/image mismatch

**Не подтверждён и не опровергнут** без SSH. Команды для VPS — в §4 и §23.

---

## Список проблем

### CRITICAL

*(нет подтверждённых CRITICAL в коде, блокирующих текущий Telegram на biznesoty.ru)*

### HIGH

1. **Meta Graph AllowedIPs drift**  
   - Проблема: DNS `graph.facebook.com` → `31.13.66.4` (и др.), AllowedIPs держит `31.13.72.8/52/174`  
   - Impact: Meta/WhatsApp/Instagram **server** egress через NL может обходить WG или падать  
   - Fix: на RU VPS `dig +short graph.facebook.com A` → добавить актуальные /32 в AllowedIPs **после подтверждения**; не добавлять огромные CIDR; учесть IPv6 или `sysctl` prefer IPv4  
   - **Не применено автоматически**

2. **www.biznesoty.ru без TLS**  
   - Impact: alias недоступен по HTTPS  
   - Fix: обновлённый Caddyfile + reload Caddy на VPS

3. **Неполный `app.env.example` (Meta)** — исправлено в репо

4. **App Docker health = full `/api/health`** — исправлено в репо

### MEDIUM

5. Strict `"true"` boolean parsing — документировать ops  
6. Railway env drift между web/worker — checklist  
7. Meta delivery heartbeat не в `/api/health`  
8. IPv6 dual-stack vs IPv4-only AllowedIPs  
9. Host tree vs image — обязательная проверка перед выводами о «старом коде в проде»

### LOW

10. Оптимистичные UI success messages после start  
11. Docs drift (health path Railway vs Yandex)  
12. Hardcoded OpenAI URL без `OPENAI_BASE_URL`

---

## 21. Интеграционные тесты (доступные без SSH)

| Тест | Результат |
|---|---|
| A. Web biznesoty.ru | PASS (307→dashboard) |
| B. DB via health | PASS (`database=ok`) |
| C. Telegram health | PASS (`telegram=ok`); полный UI→API start **не** гонялся (нужна сессия) |
| D. OpenAI DNS/AllowedIPs | PASS match (код-путь есть) |
| E. Meta DNS/AllowedIPs | **FAIL match** (код-путь есть; сеть — риск) |
| F. WhatsApp | через Graph — тот же риск, что Meta |
| G. VK | код → api.vk.com direct — OK |
| H. Auth | код ок; live login не автоматизировался |
| I. Caddy HTTPS canonical | PASS; www FAIL до redeploy Caddy |
| J. Selective WG | код/доки ок; Meta IP drift — ops |

---

## 22. Что НЕ делалось (по ТЗ)

- Full-tunnel WG  
- Удаление БД/volumes/secrets  
- Вывод секретов / commit `.env`  
- Отключение каналов  
- Массовый refactor  
- Предположения о image без проверки на VPS  
- Изменение AllowedIPs без подтверждения

---

## 23. Команды на production для применения/допроверки

```bash
# 1) Caddy aliases (после pull этого коммита в /opt/sreda)
cd /opt/sreda && docker compose -f deploy/compose.yml up -d caddy

# 2) Meta AllowedIPs — ТОЛЬКО после явного ОК
# dig +short graph.facebook.com A
# затем точечно добавить /32 в wg0 AllowedIPs на RU и peer на NL
# wg syncconf / wg-quick down+up — по вашему runbook
# НЕ добавлять 0.0.0.0/0

# 3) Host vs image
cd /opt/biznesoty && git rev-parse HEAD
docker inspect deploy-app-1 --format '{{.Config.Image}} {{.Image}}'
# сравнить с tag/sha из /opt/sreda/deploy/.env (SREDA_IMAGE)

# 4) Redeploy app с новым compose health (если обновляете release tooling)
# использовать существующий release.sh с immutable image tag — не docker system prune
```

---

## 24. Ответы на финальный чеклист ТЗ

1. **Найдено:** Meta WG IP drift; www TLS; compose health coupling; неполный app.env.example; SolutionService fail-closed defaults (не блок start).  
2. **Исправлено в репо:** compose health, release gate, app.env.example Meta, Caddy aliases, этот отчёт.  
3. **Файлы:** см. §19.  
4. **Почему:** совместимость deploy/TLS/env с текущей infra без ломки архитектуры.  
5. **Из infra:** selective WG + DNS drift Meta; Caddy single-host до фикса.  
6. **Host/image mismatch:** неизвестно без SSH.  
7. **Telegram:** health ok; код flow согласован с env.  
8. **OpenAI:** DNS в AllowedIPs; путь в коде есть.  
9. **Meta/IG/WA:** код ok; **сеть WG — риск drift**.  
10. **Auth:** модель single-origin ok.  
11. **DB:** health ok.  
12. **Worker:** telegram heartbeat ok.  
13. **Selective WG:** задумка ok; Meta IPs устарели.  
14. **Осталось:** обновить AllowedIPs (по подтверждению), redeploy Caddy, SSH-сверка image/commit.  
15. **Команды:** §23.

---

*Аудит выполнен по коду репозитория + публичным проверкам. Production SSH / WireGuard / secrets — вне scope агента.*
