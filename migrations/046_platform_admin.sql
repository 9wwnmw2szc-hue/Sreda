-- Platform staff RBAC (separate from tenant business_member roles).
CREATE TABLE platform_admin (
  user_id uuid PRIMARY KEY REFERENCES "user"(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('SUPER_ADMIN', 'SUPPORT', 'MODERATOR', 'FINANCE')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES "user"(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX platform_admin_role_status_idx ON platform_admin (role, status);

-- Append-only admin audit trail. Application never UPDATEs or DELETEs rows.
CREATE TABLE platform_admin_audit_log (
  id uuid PRIMARY KEY,
  admin_user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  admin_role text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  business_id uuid REFERENCES business(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX platform_admin_audit_created_idx ON platform_admin_audit_log (created_at DESC);
CREATE INDEX platform_admin_audit_admin_idx ON platform_admin_audit_log (admin_user_id, created_at DESC);
CREATE INDEX platform_admin_audit_action_idx ON platform_admin_audit_log (action, created_at DESC);
CREATE INDEX platform_admin_audit_business_idx ON platform_admin_audit_log (business_id, created_at DESC)
  WHERE business_id IS NOT NULL;
CREATE INDEX platform_admin_audit_target_idx ON platform_admin_audit_log (target_type, target_id, created_at DESC);

-- Soft suspend for users/businesses (no hard delete from admin UI).
CREATE TABLE platform_suspension (
  entity_type text NOT NULL CHECK (entity_type IN ('user', 'business')),
  entity_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
  created_by uuid NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz,
  lifted_by uuid REFERENCES "user"(id) ON DELETE SET NULL,
  PRIMARY KEY (entity_type, entity_id)
);

CREATE INDEX platform_suspension_active_idx ON platform_suspension (entity_type, created_at DESC)
  WHERE lifted_at IS NULL;

-- One-time super-admin bootstrap marker (CLI only; no public endpoint).
CREATE TABLE platform_admin_bootstrap (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  used_at timestamptz,
  used_by uuid REFERENCES "user"(id) ON DELETE SET NULL
);

INSERT INTO platform_admin_bootstrap (id) VALUES (true);
