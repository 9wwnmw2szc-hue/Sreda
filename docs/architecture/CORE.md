# Этап 3 — проект ядра Среды

Статус: архитектурная спецификация. Реализация Identity/Workspace описана в STAGE4.md; остальные модули остаются планом.

## Цель и границы
Дать этапу 4 конкретную основу аккаунтов и бизнесов, а следующим этапам — единый контракт приёма заявок.
В scope: модель данных, права, границы модулей, API, состояния и проверяемые инварианты.
Вне scope: реализация входа, реальные персональные данные, токены, платежи и production.

## Компоненты
- Web: существующие страницы и hooks. Services постепенно переходят с mocks на HTTP.
- HTTP: тонкие обработчики в текущем Next.js, серверная валидация, сессия и вызов прикладного сервиса.
- Identity: пользователи и сессии; Workspaces: бизнесы, членство и разрешения.
- Solutions: каталог, конфигурации, готовность; Leads: диалоги и заявки.
- Channels: Telegram/VK, проверка источника, преобразование события и исходящие сообщения.
- Entitlements: право использования решения; Billing позднее меняет это право через подтверждённые события.
- Jobs: входящие события, outbox, повторные доставки и уведомления. Worker отдельным процессом.
- Audit: критические действия без тела сообщений и секретов.

Предлагаемая структура: src/server/{identity,workspaces,solutions,leads,channels,jobs,audit}, src/server/db и src/server/http.
UI не импортирует server-модули. Доменная логика не импортирует React и SDK Telegram/VK.
Адаптер не пишет заявку напрямую в БД: нормализует событие и вызывает тот же прикладной use case.

## Логическая модель PostgreSQL
UUID для внутренних ID, UTC для времени. Часовой пояс бизнеса хранится отдельно как IANA name.
Для каждой tenant-таблицы business_id обязателен; UNIQUE(business_id,id) позволяет проверять принадлежность составными FK.

| Сущность | Основные поля | Ограничения |
|---|---|---|
| User | id, email_normalized, name, created_at | Уникальный подтверждённый email |
| Session | Схема Better Auth: id, userId, token, expiresAt | Подписанная HttpOnly cookie; токен в БД чувствителен, cookie-cache выключен; отзыв удаляет сессию (A09) |
| Business | id, name, timezone, created_at, archived_at | Архив не удаляет заявки |
| BusinessMember | business_id, user_id, role, status | UNIQUE(business_id,user_id); максимум один активный owner |
| SolutionDefinition | code, availability, config_version | Код leads; глобальный каталог |
| SolutionInstance | id, business_id, solution_code, state, config_json, revision | UNIQUE(business_id,solution_code); валидируемая версия config |
| ChannelConnection | id, business_id, platform, external_account_id, status, last_error_code | UNIQUE(platform,external_account_id); один внешний бот/сообщество не принадлежит двум бизнесам |
| ChannelCredential | connection_id, ciphertext, nonce, key_version | Ссылка на подключение; отдельные серверные права |
| SolutionChannel | business_id, solution_id, connection_id | Составные FK гарантируют один бизнес |
| Customer | id, business_id, display_name | Имя не уникальный идентификатор |
| ChannelIdentity | id, business_id, connection_id, external_user_id, customer_id | UNIQUE(connection_id,external_user_id); составные FK |
| Conversation | id, business_id, solution_id, identity_id, config_snapshot, state, answers, revision | Одна открытая сессия на решение/identity; ответы с ограничениями длины |
| Lead | id, business_id, solution_id, customer_id, conversation_id, source, answers, status, is_test, revision, created_at | UNIQUE(conversation_id); FK внутри одного бизнеса |
| InboundEvent | id, business_id, connection_id, provider_event_id, payload, state, attempts | UNIQUE(connection_id,provider_event_id) |
| OutboxJob | id, business_id, kind, dedupe_key, payload, available_at, lease_until, attempts, state | UNIQUE(business_id,kind,dedupe_key) |
| AuditEvent | id, business_id, actor_id, action, target_id, occurred_at | Минимум данных, без токенов/ответов клиента |
| Entitlement | business_id, solution_code, status, valid_until | UNIQUE(business_id,solution_code); billing — поздний этап |

Business.ownerId из frontend не становится вторым источником истины: владельца определяет BusinessMember.
Создание Business и первого owner — одна транзакция. Удаление/понижение последнего owner запрещено.
Инвариант «ровно один owner» поддерживается транзакционным сервисом; уникальный индекс сам гарантирует только максимум одного.
Политики хранения payload/answers и удаления персональных данных должны быть утверждены до реальных клиентов.

## Матрица доступа
| Действие | owner | admin | operator |
|---|---|---|---|
| Смотреть бизнес, заявки и подключения без секретов | Да | Да | Да |
| Менять статус заявки | Да | Да | Да |
| Менять конфигурацию решения и каналы | Да | Да | Нет |
| Управлять оплатой, архивировать бизнес | Да | Нет | Нет |
| Управлять участниками | Поздний этап | Нет | Нет |

Этап 4 реализует создание owner; наличие других ролей в схеме не означает готовый UI приглашений.
Порядок каждой операции: проверить сессию → получить активное членство → проверить действие → запросить объект с business_id.
Несуществующий и чужой объект дают одинаковый 404. Для разрешённого бизнеса, но запрещённого действия — 403.
Worker не использует browser businessId: бизнес выводится из проверенного подключения.
Кеши включают business_id и не кешируют общедоступно приватные ответы.

## API v1
Бизнес-API: /api/v1. Auth в этапе 4 использует ограниченный набор /api/auth (см. STAGE4.md), вместо предварительных трёх маршрутов ниже. JSON, даты ISO 8601 UTC; суммы в целых копейках с currency.
Ошибки: {error:{code,message,fieldErrors?,requestId}}. Стектрейсы и секреты не возвращаются.
Все session-mutating запросы защищены от CSRF, включая проверку Origin. Cookie: HttpOnly, Secure, SameSite.
GET не изменяет данные. Сервер задаёт лимиты тела, пагинации и частоты запросов.

| Метод и путь | Вход / результат | Доступ |
|---|---|---|
| POST /auth/email/start | email; нейтральный 202 независимо от наличия аккаунта | Публичный, rate limit |
| POST /auth/email/verify | challengeId, code; сессия | Ограничение попыток, TTL, одноразовый код |
| POST /auth/logout | Отзыв текущей сессии | Сессия |
| GET /me | Профиль без служебных полей | Сессия |
| GET /businesses | Только активные членства | Сессия |
| POST /businesses | name, timezone; бизнес с owner | Сессия, Idempotency-Key |
| GET /businesses/:b | Данные бизнеса и разрешения | Член |
| GET /businesses/:b/solutions | Каталог плюс состояние экземпляров | Член |
| PUT /businesses/:b/solutions/leads/draft | configVersion, channels, fields, expectedRevision | owner/admin |
| GET /businesses/:b/solutions/leads/draft | Конфигурация и revision | Член |
| GET /businesses/:b/connections | ID, площадка, статус, displayName; без credentials | Член |
| POST /businesses/:b/connections/telegram | token; проверка на сервере | owner/admin, поздний этап |
| DELETE /businesses/:b/connections/:c | Отключение и отзыв локального секрета | owner/admin, поздний этап |
| GET /businesses/:b/leads | status?, cursor?, limit<=100 | Член |
| GET /businesses/:b/leads/:id | Заявка | Член |
| PATCH /businesses/:b/leads/:id | status, expectedRevision | Член |
| POST /businesses/:b/solutions/leads/activate | Проверка конфигурации, каналов и entitlement | owner/admin, поздний этап |

VK handshake и webhook URLs специфицируются на этапе соответствующего адаптера по актуальной документации.
Webhook не использует browser-сессию; требует проверки провайдера и выделенного секрета подключения.

Пример draft:
{"configVersion":1,"channels":["telegram"],"fields":["name","phone","service"],"expectedRevision":0}
Имя обязательно; неизвестные поля и площадки отклоняются. Первое сохранение revision=0, ответ revision=1.
Два редактора с одной revision: один успех, второй 409 REVISION_CONFLICT без потери изменений.
При удалении членства сохранение уже открытого мастера тоже запрещается.
Idempotency-Key scoped по actor, business и operation; сохраняются hash запроса и результат в одной транзакции.
Повтор того же ключа с другим телом — 409. Для создания бизнеса scope actor+operation.

## Состояния и запуск
SolutionInstance: draft → ready → active ↔ paused; archived терминальное.
ready означает валидную конфигурацию, а не оплаченный доступ.
ChannelConnection: pending → connected/error; connected → disconnected/error; ошибка допускает повторную проверку.
Entitlement: trial/active/grace/expired; правила trial/grace определяются при billing.
Запуск атомарно проверяет валидную конфигурацию, хотя бы один подтверждённый выбранный канал и действующее право.
При подключённых Telegram и VK сбой одного не выключает второй: показываем отдельные статусы.
После начала диалога используется snapshot конфигурации, чтобы изменения формы не ломали текущие ответы.
Lead: new → processing → closed; повторное открытие closed → processing допускается с аудитом.

## Надёжность и секреты
1. Проверенный webhook сохраняет InboundEvent до успешного ответа провайдеру; сбой БД допускает повтор провайдера.
2. Дубликат event ID подтверждается без повторного эффекта. Порядок внутри диалога сериализуется блокировкой Conversation.
3. Создание Lead, завершение Conversation и запись outbox находятся в одной транзакции.
4. Worker арендует job, выполняет действие и отмечает результат; после истечения lease возможен повтор.
5. Повторы ограничены, с backoff и jitter; после лимита — failed и операторское восстановление.
6. Внешняя отправка может повториться при сбое после отправки до подтверждения job. Не обещаем exactly-once для сообщений; используем idempotency провайдера, где доступна.

Шифрование credentials — authenticated encryption с уникальным nonce и key version; ключ отдельно от БД.
Ни credential, ни тело запроса подключения не попадают в logs, analytics, browser storage или audit.
Ротация ключей, отключение webhook, очистка секрета и повторная проверка подключения входят в этап адаптера.
Логи: requestId, businessId, action, result, duration; без содержимого ответов клиентов.
Метрики: ошибки запросов, возраст очереди, failed jobs, задержка получения заявки и состояние каналов.
Размещение БД, worker, backups, logs и ключей согласуется до production; восстановление проверяется отдельным упражнением.

## Переход с текущего прототипа
- Не менять src/types сразу: это view models. Добавить серверные DTO и явные mapper-функции.
- Этап 4: заменить user/business services; запретить fallback на mock-аккаунт в production.
- Черновик localStorage переносить только после входа и выбора подтверждённого бизнеса, с явным действием пользователя и серверной валидацией.
- Демо-ID бизнеса не связывать автоматически с новым реальным бизнесом. После успешного переноса удалить только перенесённый ключ.
- При logout очищать in-memory приватные данные; отменять старые запросы при смене бизнеса.
- Этап 5: заменить leads/solutions services, добавить серверное хранение черновиков.
- Этапы 6–7: адаптеры; до них UI честно остаётся предпросмотром.

## Acceptance criteria и проверки
Этап 3 принимается по согласованности модели, ролей, маршрутов и границ; это не runtime-проверка.
Обязательные проверки реализации:
- Этап 4: нет сессии → 401; пользователь A не получает бизнес/объекты B ни чтением, ни записью.
- Оператор не меняет каналы/форму; отозванное членство сразу лишает доступа.
- Создание бизнеса дважды с одним idempotency key даёт один бизнес и одного owner.
- Истёкший/повторный email-код отклоняется, logout отзывает сессию; CSRF отклоняется.
- Этап 5: составной FK отклоняет связь объектов разных бизнесов; конфликт revision не перезаписывает изменения.
- Повтор входящего события и конкурентная обработка дают одну заявку и один outbox job.
- Сбой worker после commit не теряет job; retries и failed доступны для диагностики.
- Этапы 6–7: неверный webhook не создаёт событий, секрет не виден в API/logs; обе площадки дают заявки одного бизнеса.
- До пилота: реальные E2E, восстановление backup, отсутствие mock fallback и проверка размещения данных.

Порядок работ этапа 4: выбрать зависимости → миграции Identity/Workspace → сессия и права → API → подключить UI → негативные интеграционные тесты → review.
