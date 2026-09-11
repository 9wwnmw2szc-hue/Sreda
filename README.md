# Среда

SaaS для малого бизнеса: готовые решения в Telegram и ВКонтакте.

## Dashboard — утверждённое визуальное направление

Frontend на Next.js (App Router) + TypeScript + Tailwind CSS.
Данные пока из mock-слоя через services. Backend / Telegram / VK API не подключены.

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

Скриншоты реального интерфейса: [1440](docs/design/review/desktop-decor-1440.jpg), [1280](docs/design/review/desktop-decor-1280.jpg), [900](docs/design/review/tablet-decor-900.jpg), [390](docs/design/review/mobile-390.jpg).

Основной законченный визуальный экран — `/dashboard`. Остальные страницы пока демонстрируют структуру будущих разделов.
