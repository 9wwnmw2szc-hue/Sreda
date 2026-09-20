-- Business deletion: soft-archive with owner confirmation token.
-- Does NOT hard-delete rows (FK / audit retention). Active access is revoked.

CREATE TABLE business_deletion_request (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  impact_snapshot jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_deletion_request_token_unique UNIQUE (token_hash)
);

CREATE INDEX business_deletion_request_biz_idx
  ON business_deletion_request (business_id, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX business_deletion_request_user_idx
  ON business_deletion_request (user_id, created_at DESC)
  WHERE consumed_at IS NULL;
