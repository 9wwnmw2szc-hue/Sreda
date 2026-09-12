CREATE TABLE business (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TABLE business_member (
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'operator')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id)
);
CREATE UNIQUE INDEX business_one_owner ON business_member(business_id)
  WHERE role = 'owner' AND status = 'active';
CREATE INDEX business_member_user ON business_member(user_id, status);
CREATE TABLE business_creation (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  key text NOT NULL,
  request_hash text NOT NULL,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE TABLE request_limit (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX request_limit_expiry ON request_limit(expires_at);
