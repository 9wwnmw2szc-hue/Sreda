CREATE TABLE business_invitation (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  invitee_user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'operator')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT invitation_pending_unique UNIQUE (business_id, invitee_user_id, status)
);
CREATE INDEX invitation_invitee_idx ON business_invitation (invitee_user_id, status, expires_at);
