CREATE TABLE business_audit_log (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('invitation_created', 'invitation_accepted', 'invitation_revoked', 'member_revoked')),
  target_user_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_business_created_idx ON business_audit_log (business_id, created_at DESC);
