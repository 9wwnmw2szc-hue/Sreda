CREATE TABLE business_connection (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('telegram', 'vk')),
  external_account_id text,
  display_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disconnected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_business_platform_unique UNIQUE (business_id, platform)
);
CREATE TABLE connection_secret (
  connection_id uuid PRIMARY KEY REFERENCES business_connection(id) ON DELETE CASCADE,
  encrypted_token text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX connection_business_idx ON business_connection (business_id, platform);
