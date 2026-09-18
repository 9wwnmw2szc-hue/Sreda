-- Staff notification bindings: multi-platform (Telegram + VK)
-- Human-readable order numbers per business
-- Additive only. No procedural bodies (PGlite migrator splits on semicolon)

ALTER TABLE notification_binding
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'telegram';

ALTER TABLE notification_binding DROP CONSTRAINT IF EXISTS notification_binding_platform_check;

ALTER TABLE notification_binding
  ADD CONSTRAINT notification_binding_platform_check
  CHECK (platform IN ('telegram', 'vk'));

ALTER TABLE notification_binding DROP CONSTRAINT IF EXISTS notification_binding_pkey;

ALTER TABLE notification_binding
  ADD PRIMARY KEY (business_id, user_id, platform);

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS order_number integer;

CREATE UNIQUE INDEX IF NOT EXISTS order_business_number_unique
  ON "order" (business_id, order_number)
  WHERE order_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS business_order_seq (
  business_id uuid PRIMARY KEY REFERENCES business(id),
  next_number integer NOT NULL DEFAULT 1001
    CHECK (next_number >= 1001)
);

ALTER TABLE notification_recipient
  ADD COLUMN IF NOT EXISTS vk_queued boolean NOT NULL DEFAULT false;

ALTER TABLE vk_outbox
  ADD COLUMN IF NOT EXISTS notification_id uuid REFERENCES notification(id);

ALTER TABLE vk_outbox
  ADD COLUMN IF NOT EXISTS notification_user_id uuid REFERENCES "user"(id);

ALTER TABLE vk_outbox DROP CONSTRAINT IF EXISTS vk_notification_delivery_unique;

ALTER TABLE vk_outbox
  ADD CONSTRAINT vk_notification_delivery_unique
  UNIQUE (notification_id, notification_user_id);
