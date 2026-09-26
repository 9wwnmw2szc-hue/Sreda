# FINAL PRODUCTION COMPATIBILITY + TUNNEL + TELEGRAM AUDIT

**Date:** 2026-09-26  
**Branch:** `cursor/telegram-compat-fix-258e`  
**Scope:** код + публичные HTTP/DNS. SSH к RU/NL VPS **нет** — deploy/WG на хосте не применялись.

---

## FIXED (в коде)

| # | Проблема | Причина | Исправление |
|---|---|---|---|
| 1 | UI «Telegram временно недоступен» при `health.telegram=ok` | `ConnectionService.connect` → `getMe` падает по сети; Node мог брать **AAAA** и обходить IPv4-only WG AllowedIPs | `preferIpv4Dns()` (`dns.setDefaultResultOrder("ipv4first")`) в `src/server/net/ipv4-first.ts`, вызывается из `instrumentation.ts`, `runtime.ts`, `telegram-worker`, `vk-worker` |
| 2 | Тихие `false` у каналов | `new SolutionService(tx)` / omitted flags → default `false`, игнор `TELEGRAM_WEBHOOKS_ENABLED` | `SolutionService` и `createSolutionHandler` читают env, если флаг не передан; явный `false` сохраняется |
| 3 | Неразличимый timeout vs сеть | Abort/Timeout → та же фраза | Отдельный текст при `AbortError`/`TimeoutError` |

**Проверки локально:** `typecheck` OK · `lint` 0 errors · `telegram-compat-flags` 6/6 · `build` (ниже).  
**Предусловие prod:** `TELEGRAM_WEBHOOKS_ENABLED=true` в `/opt/biznesoty/app.env` (health уже `telegram=ok`).

---

## STILL OPEN (ops / SSH)

| # | Статус | Действие владельца |
|---|---|---|
| A | **Meta Graph DNS drift** | `graph.facebook.com` → `31.13.66.4` ∉ Known AllowedIPs `31.13.72.*`. Точечно добавить /32 **после явного ОК**. Не full-tunnel. |
| B | **Redeploy image** | Собрать/залить image с этим коммитом, `deploy/release.sh` на RU. Агент SSH не имеет. |
| C | **www TLS** | Caddy aliases в репо; redeploy Caddy на VPS (из прошлого аудита). |
| D | **Post-deploy smoke** | Connect bot token → getMe; webhook set; worker heartbeat; исходящее сообщение. |
| E | Lead unit tests на main | `dashboard lead service…` / `lead page client…` падают и **без** этого diff — вне scope Telegram. |

---

## PRODUCTION STATUS (публично)

| Check | Result |
|---|---|
| `https://biznesoty.ru/` | 200 |
| `/api/health` | `ok`; `database=ok`; **`telegram=ok`**; `vk=disabled` |
| DNS `api.telegram.org` | A `149.154.166.110` + **AAAA** (риск dual-stack → фикс #1) |
| DNS `api.openai.com` | A в Known AllowedIPs (из прошлого аудита) |
| DNS `graph.facebook.com` | `31.13.66.4` — **mismatch AllowedIPs** |
| DNS `api.vk.com` | РФ, не через WG |
| WireGuard / secrets / DB data | **не менялись** |

**Вердикт:** код готов к redeploy для Telegram egress (IPv4-first + flag fallback). Production Telegram end-to-end **не подтверждён** до SSH redeploy + smoke. Meta — отдельный ops-шаг.

---

## Redeploy (на RU VPS, владелец)

```bash
# 1) build & push image с коммитом этой ветки / после merge в main
# 2) на RU:
cd /opt/biznesoty && ./deploy/release.sh
# 3) smoke: UI connect Telegram; docker compose logs telegram-worker --tail=100
# 4) Meta AllowedIPs — только после явного ОК
```

---

## Что не делалось (критические правила)

- Не с нуля, не ломали архитектуру, не full-tunnel WG  
- Секреты не читались / не печатались  
- UI не маскировал ошибку без backend-фикса  
- Данные пользователей / Postgres не трогались  
