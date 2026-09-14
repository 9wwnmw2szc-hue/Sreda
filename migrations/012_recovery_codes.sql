CREATE TABLE recovery_code (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  PRIMARY KEY (user_id, code_hash)
);
CREATE TABLE account_security_event (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('recovery_codes_issued', 'password_recovered')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_security_event_user_idx ON account_security_event (user_id, created_at DESC);
