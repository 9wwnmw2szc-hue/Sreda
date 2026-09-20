-- Additive: WhatsApp + Instagram as first-class ChannelPlatform values.
-- Soft-widens CHECKs; adds Meta runtime/outbox/dedupe tables shared by both providers.
-- Does NOT drop or truncate existing Telegram/VK data.

-- business_connection.platform
ALTER TABLE business_connection DROP CONSTRAINT IF EXISTS business_connection_platform_check;
ALTER TABLE business_connection
  ADD CONSTRAINT business_connection_platform_check
  CHECK (platform IN ('telegram', 'vk', 'whatsapp', 'instagram'));

-- communication_conversation.platform
ALTER TABLE communication_conversation DROP CONSTRAINT IF EXISTS communication_conversation_platform_check;
ALTER TABLE communication_conversation
  ADD CONSTRAINT communication_conversation_platform_check
  CHECK (platform IN ('telegram', 'vk', 'whatsapp', 'instagram'));

-- communication_block.platform (017)
ALTER TABLE communication_block DROP CONSTRAINT IF EXISTS communication_block_platform_check;
ALTER TABLE communication_block
  ADD CONSTRAINT communication_block_platform_check
  CHECK (platform IN ('telegram', 'vk', 'whatsapp', 'instagram'));

-- client_identity.kind
ALTER TABLE client_identity DROP CONSTRAINT IF EXISTS client_identity_kind_check;
ALTER TABLE client_identity
  ADD CONSTRAINT client_identity_kind_check
  CHECK (kind IN ('telegram', 'vk', 'whatsapp', 'instagram', 'phone', 'email'));

-- notification_binding.platform (045)
ALTER TABLE notification_binding DROP CONSTRAINT IF EXISTS notification_binding_platform_check;
ALTER TABLE notification_binding
  ADD CONSTRAINT notification_binding_platform_check
  CHECK (platform IN ('telegram', 'vk', 'whatsapp', 'instagram'));

-- post_target.platform (autopost stays TG/VK only for now — leave CHECK if present)
-- Channel-admin stays Telegram/VK only (no change).

-- Track last customer inbound for WhatsApp 24h messaging window.
ALTER TABLE communication_conversation
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz;

UPDATE communication_conversation
  SET last_inbound_at = last_message_at
  WHERE last_inbound_at IS NULL;

-- Meta connection runtime (one row per whatsapp/instagram business_connection).
CREATE TABLE meta_runtime (
  connection_id uuid PRIMARY KEY REFERENCES business_connection(id) ON DELETE CASCADE,
  generation uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'error')),
  -- Provider routing identifiers (never put tokens here).
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  page_id text,
  ig_user_id text,
  ig_username text,
  webhook_subscribed boolean NOT NULL DEFAULT false,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX meta_runtime_phone_number_uidx
  ON meta_runtime (phone_number_id)
  WHERE phone_number_id IS NOT NULL;

CREATE UNIQUE INDEX meta_runtime_ig_user_uidx
  ON meta_runtime (ig_user_id)
  WHERE ig_user_id IS NOT NULL;

CREATE UNIQUE INDEX meta_runtime_page_uidx
  ON meta_runtime (page_id)
  WHERE page_id IS NOT NULL;

-- Webhook event dedupe (Meta may redeliver).
CREATE TABLE meta_update (
  connection_id uuid NOT NULL REFERENCES meta_runtime(connection_id) ON DELETE CASCADE,
  event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, event_id)
);

-- Outbound queue for WhatsApp + Instagram (mirrors telegram/vk outbox semantics).
CREATE TABLE meta_outbox (
  id bigserial PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES meta_runtime(connection_id) ON DELETE CASCADE,
  recipient_id text NOT NULL,
  message text NOT NULL DEFAULT '',
  buttons jsonb NOT NULL DEFAULT '[]',
  attachment_ids jsonb NOT NULL DEFAULT '[]',
  api_payload jsonb NOT NULL DEFAULT '{}',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivery_state text NOT NULL DEFAULT 'pending'
    CHECK (delivery_state IN ('pending', 'sending', 'sent', 'failed', 'uncertain')),
  claimed_at timestamptz,
  external_message_id text,
  communication_message_id uuid REFERENCES communication_message(id),
  notification_id uuid REFERENCES notification(id),
  notification_user_id uuid REFERENCES "user"(id),
  template_name text,
  template_language text
);

CREATE INDEX meta_outbox_pending
  ON meta_outbox (connection_id, id)
  WHERE delivered_at IS NULL;

-- Pending OAuth / Embedded Signup sessions (short-lived, no access tokens in plaintext after consume).
CREATE TABLE meta_oauth_state (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('whatsapp', 'instagram')),
  state_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'consumed', 'expired', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meta_oauth_state_business_idx
  ON meta_oauth_state (business_id, platform, created_at DESC)
  WHERE status = 'pending';
