CREATE TABLE communication_conversation (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('telegram', 'vk')),
  external_user_id text NOT NULL,
  external_username text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'closed', 'blocked')),
  assigned_member_user_id text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (business_id, platform, external_user_id)
);
CREATE INDEX communication_conversation_business_idx
  ON communication_conversation (business_id, status, last_message_at DESC);

CREATE TABLE communication_message (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES communication_conversation(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  text text NOT NULL CHECK (length(text) <= 10000),
  external_message_id text,
  actor_user_id text,
  moderation_status text NOT NULL DEFAULT 'allowed' CHECK (moderation_status IN ('allowed', 'pending', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, external_message_id)
);
CREATE INDEX communication_message_conversation_idx
  ON communication_message (conversation_id, created_at DESC);
CREATE INDEX communication_message_business_idx
  ON communication_message (business_id, created_at DESC);

CREATE TABLE communication_quota (
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  inbound_limit integer NOT NULL DEFAULT 300 CHECK (inbound_limit >= 0),
  inbound_count integer NOT NULL DEFAULT 0 CHECK (inbound_count >= 0),
  warned_at_percent integer NOT NULL DEFAULT 0 CHECK (warned_at_percent IN (0, 80, 100)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, period_start)
);

CREATE TABLE communication_block (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('telegram', 'vk')),
  external_user_id text NOT NULL,
  reason text NOT NULL CHECK (length(reason) <= 500),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, platform, external_user_id)
);
CREATE INDEX communication_block_active_idx
  ON communication_block (business_id, platform, external_user_id, expires_at);
