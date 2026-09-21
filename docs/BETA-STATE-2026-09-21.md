# Closed Beta — pre-hardening state

## CURRENT_MAIN_SHA
`429e21d60090671b541f41d1eb72d3a8ac503e2a` (PR #53 merged)

## OPEN_PRS
Draft legacy only (#6–#13, Sep 12–13). Not merge candidates for Beta.

## UNMERGED_BRANCHES
`codex/login-*`, `codex/recovery-*`, `codex/telegram-token-form` — stale UI experiments.

## LATEST_MIGRATION
`052_product_variant_prices_enabled.sql`

## CURRENT_TEST_COUNT
~40 test files; ~298 passing unit/integration tests on last full run.

## CURRENT_SERVICES (Sreda-staging)
web, telegram-worker, vk-worker, Postgres, S3 bucket.

## CURRENT_SOLUTIONS
leads, orders, booking, admin_messages, autopost (+ moderation catalog-only).

## CURRENT_CHANNELS
telegram, vk, whatsapp/instagram (Meta code), max (typed only).

## PR #53 RESULT
MERGED. Includes ProductEditor, BookingSetupWizard, bot nav, request_contact, customer profile, money formatter, order modal contrast, migration 052.

## GATE
Continue Closed Beta hardening from this SHA without redoing #53 work.
