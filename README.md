# Среда

SaaS для малого бизнеса: готовые решения в Telegram и ВКонтакте.

## Dashboard — утверждённое визуальное направление

Frontend на Next.js (App Router) + TypeScript + Tailwind CSS.
Этап 4: серверные аккаунты и бизнесы на PostgreSQL, регистрация по логину и паролю с повтором пароля, вход по логину и паролю. Telegram/VK, заявки и платежи ещё не подключены. Инструкция запуска и границы проверки: [STAGE4.md](docs/architecture/STAGE4.md).

## Запуск

```bash
npm ci
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000) — редирект на `/dashboard`.

## Скрипты

- `npm run dev` — локальная разработка
- `npm run build` — production-сборка
- `npm run start` — запуск production-сборки
- `npm run lint` — ESLint
- `npm run typecheck` — проверка TypeScript

## Архитектура

```
User → Business → Connections + Solutions + Business Data
```

Слои:

```
UI → hooks → services → mock / API
```

## Структура

```
src/
  app/(app)/     # маршруты приложения
  components/    # UI и layout
  hooks/         # клиентские хуки
  services/      # доступ к данным
  mocks/         # mock-данные
  types/         # TypeScript-типы
  config/        # навигация и design-конфиг
  lib/           # утилиты
```

## Дизайн и проверка

[Реализация, координаты, ограничения и acceptance](docs/design/IMPLEMENTATION.md).

[Утверждённый референс](docs/design/sreda-approved-desktop-mobile.png).

Скриншоты реального интерфейса: [1440](docs/design/review/desktop-decor-1440.jpg), [1280](docs/design/review/desktop-decor-1280.jpg), [900](docs/design/review/tablet-decor-900.jpg), [390](docs/design/review/mobile-baseline-390.jpg).

Основной законченный визуальный экран — `/dashboard`. Каталог `/solutions` и `/solutions/leads/setup` реализуют интерактивный предпросмотр настройки. Другие страницы демонстрируют структуру будущих разделов.

[Визуальный стандарт и состояния интерфейса — этап 1](docs/design/UI-BASELINE.md).

[Путь первого подключения и границы прототипа — этап 2](docs/product/LEAD-ONBOARDING.md).

Для разработки и тестов: Node.js 22.18+; `npm test` проверяет восстановление и валидацию черновиков.
