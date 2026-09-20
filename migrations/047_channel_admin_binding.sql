-- Channel admin: Telegram/VK management interfaces bound to BusinessMember.
-- Separate from customer bot dialogs and from platform_admin (Soty staff).

CREATE TABLE provider_identity (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  platform text NOT NULL CHECK (platform IN ('telegram', 'vk')),
  external_user_id text NOT NULL,
  display_name text,
  username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT provider_identity_external_unique UNIQUE (platform, external_user_id)
);

CREATE UNIQUE INDEX provider_identity_user_platform_active_idx
  ON provider_identity (user_id, platform)
  WHERE revoked_at IS NULL;

CREATE INDEX provider_identity_user_idx ON provider_identity (user_id)
  WHERE revoked_at IS NULL;

-- Admin access for a member on a business via a confirmed provider identity.
CREATE TABLE business_channel_admin (
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  platform text NOT NULL CHECK (platform IN ('telegram', 'vk')),
  provider_identity_id uuid NOT NULL REFERENCES provider_identity(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  bound_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_active_at timestamptz,
  PRIMARY KEY (business_id, user_id, platform),
  CONSTRAINT business_channel_admin_member_fk
    FOREIGN KEY (business_id, user_id) REFERENCES business_member (business_id, user_id),
  CONSTRAINT business_channel_admin_connection_fk
    FOREIGN KEY (business_id, connection_id) REFERENCES business_connection (business_id, id)
);

CREATE INDEX business_channel_admin_external_idx
  ON business_channel_admin (connection_id, status);

CREATE INDEX business_channel_admin_provider_idx
  ON business_channel_admin (provider_identity_id, status);

-- One-time binding challenges (web-initiated preferred).
CREATE TABLE channel_admin_challenge (
  id uuid PRIMARY KEY,
  purpose text NOT NULL CHECK (purpose IN ('bind_from_web', 'bind_from_channel')),
  token_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('telegram', 'vk')),
  connection_id uuid,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_admin_challenge_token_unique UNIQUE (token_hash)
);

CREATE INDEX channel_admin_challenge_lookup_idx
  ON channel_admin_challenge (token_hash, expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX channel_admin_challenge_user_idx
  ON channel_admin_challenge (user_id, business_id, platform, created_at DESC);

-- Wizard/session state only — never the source of truth for business data.
CREATE TABLE channel_admin_session (
  connection_id uuid NOT NULL,
  external_user_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('telegram', 'vk')),
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'home',
  step text NOT NULL DEFAULT '',
  draft jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, external_user_id, platform)
);

CREATE INDEX channel_admin_session_user_idx
  ON channel_admin_session (user_id, business_id);
