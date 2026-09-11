# Среда

SaaS для малого бизнеса: готовые решения в Telegram и ВКонтакте.

## Этап 1 — фундамент веб-приложения

Frontend на Next.js (App Router) + TypeScript + Tailwind CSS.
Данные пока из mock-слоя через services. Backend / Telegram / VK API не подключены.

## Запуск

```bash
npm install
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
