-- Account deletion: soft-delete + anonymization (user row retained for FK integrity).
-- USER ≠ BUSINESS. Sole-owned businesses must be transferred or archived first.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_status text NOT NULL DEFAULT 'active'
    CHECK (deletion_status IN ('active', 'pending', 'deleted'));

CREATE INDEX IF NOT EXISTS user_deletion_status_idx
  ON "user" (deletion_status)
  WHERE deletion_status <> 'active';

ALTER TABLE account_security_event
  DROP CONSTRAINT IF EXISTS account_security_event_action_check;

ALTER TABLE account_security_event
  ADD CONSTRAINT account_security_event_action_check
  CHECK (action IN (
    'recovery_codes_issued',
    'password_recovered',
    'password_changed',
    'pin_enabled',
    'pin_changed',
    'pin_disabled',
    'account_deletion_requested',
    'account_deletion_completed'
  ));

CREATE TABLE account_deletion_request (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  impact_snapshot jsonb NOT NULL DEFAULT '{}',
  business_decisions jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_deletion_request_token_unique UNIQUE (token_hash)
);

CREATE INDEX account_deletion_request_user_idx
  ON account_deletion_request (user_id, created_at DESC)
  WHERE consumed_at IS NULL;
