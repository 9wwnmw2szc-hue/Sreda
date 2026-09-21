# Соты (Sreda)

SaaS для малого бизнеса: готовые решения в мессенджерах и веб-кабинете.

Репозиторий: **Sreda**. Продуктовое имя в UI и auth: **Соты**.

## 1. Что это

**Соты** — Next.js App Router SaaS: один аккаунт → несколько бизнесов → активируемые решения и каналы.

Рабочие решения:

| Код | Назначение |
|---|---|
| `leads` | Приём заявок |
| `orders` | Каталог и заказы |
| `booking` | Онлайн-запись |
| `admin_messages` | Inbox / связь с администратором |
| `autopost` | Публикации в каналы |

Каналы: **Telegram**, **VK**, код **WhatsApp / Instagram** (Meta Graph API). Тип `max` есть в UI-типах, адаптера нет — не блокер Closed Beta.

Последняя миграция: `052_product_variant_prices_enabled.sql`.  
В main влит PR **#53**: ProductEditor, BookingSetupWizard, bot UX, customer profile, money formatter.

Staging: проект **Sreda-staging** (Railway). Production deploy из этого документа не описывается и не предполагается.

## 2. Стек

- **Web:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Auth:** better-auth (username/password, server sessions)
- **DB:** PostgreSQL + Kysely; миграции в `/migrations`
- **Workers:** `telegram-worker` (Telegram + Meta outbox + shared jobs), `vk-worker`
- **Storage:** S3-compatible attachments (или filesystem локально)
- **Runtime:** Node.js ≥ 22.18

## 3. Локальный запуск

Нужны PostgreSQL и переменные из `.env.example` (минимум `DATABASE_URL`, `BETTER_AUTH_SECRET` ≥ 32 символа, `APP_URL`).

```bash
npm ci
cp .env.example .env.local   # заполнить секреты
npm run db:migrate
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

Workers (отдельно, после явного включения webhook-флагов):

```bash
TELEGRAM_WEBHOOKS_ENABLED=true npm run worker:telegram
VK_WEBHOOKS_ENABLED=true npm run worker:vk
```

## 4. Проверки

| Команда | Назначение |
|---|---|
| `npm test` | Юнит/интеграционные тесты (`tests/*.test.mjs`) |
| `npm run test:http` | HTTP-сценарии |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production-сборка (`next build --webpack`) |
| `npm run staging:check` | Проверка staging-конфига (без утечки секретов) |
| `npm run audit:responsive` | Playwright-аудит адаптивности |

CI (`.github/workflows/verify.yml`): `test` → `lint` → `typecheck` → `build` → `test:http` → Docker image smoke.

## 5. Архитектура (кратко)

```
User → Business → Solutions + Channels + Business Data
```

- UI: `src/app`, `src/components`, `src/hooks`, `src/services`
- Домен: `src/server/*` (не импортировать из клиентских компонентов)
- Каналы нормализуют события и вызывают общие use case (`src/server/bot`, leads/orders/booking/…)
- Исходящие сообщения — через outbox; доставку делают workers

Подробнее: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 6. Workers

| Процесс | Скрипт | Роль |
|---|---|---|
| telegram-worker | `npm run worker:telegram` | Telegram outbox, Meta outbox (если включено), уведомления, autopost, booking/calendar reminders |
| vk-worker | `npm run worker:vk` | Только VK outbox + heartbeat |

Конфиги Railway: `deploy/railway/web.json`, `worker.json`, `vk-worker.json`.

## 7. Staging

- Окружение: **Sreda-staging** на Railway
- Ветка деплоя: **main**
- Сервисы: web + telegram-worker + vk-worker + Postgres (+ S3)
- Pre-deploy: `node --import tsx scripts/db-migrate.mts`
- Health: `/api/health/web` (web), `/api/health` (включая workers)

Из этого README **не** выполняется production-выкат.

## 8. Документация

| Документ | Содержание |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Слои и границы модулей |
| [DATABASE.md](docs/DATABASE.md) | Домены данных |
| [SOLUTIONS.md](docs/SOLUTIONS.md) | Каталог решений |
| [CHANNELS.md](docs/CHANNELS.md) | Площадки и подключения |
| [CHANNEL_ADAPTER.md](docs/CHANNEL_ADAPTER.md) | Контракт адаптера |
| [PERMISSIONS.md](docs/PERMISSIONS.md) | Роли tenant и platform admin |
| [WORKERS.md](docs/WORKERS.md) | Очереди и heartbeats |
| [BILLING.md](docs/BILLING.md) | Текущее состояние оплаты |
| [SECURITY.md](docs/SECURITY.md) | Auth, tenant, уведомления, recovery |
| [BACKUP.md](docs/BACKUP.md) | Бэкапы и restore checklist |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Staging / инфраструктура |
| [RELEASE.md](docs/RELEASE.md) | Чеклист релиза |
| [E2E.md](docs/E2E.md) | Сквозные проверки |
| [ROADMAP.md](docs/ROADMAP.md) | Отложенные пункты |
| [BETA-STATE-2026-09-21.md](docs/BETA-STATE-2026-09-21.md) | Снимок SHA / PR #53 |

Исторические заметки этапов: `docs/architecture/`, `docs/design/`, `docs/testing/` — не заменяют этот индекс для Closed Beta.
