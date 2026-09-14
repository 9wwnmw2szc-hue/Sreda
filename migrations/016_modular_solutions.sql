CREATE TABLE business_solution (
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  solution_code text NOT NULL CHECK (solution_code IN ('leads', 'sales', 'autopost', 'booking', 'admin_messages', 'moderation')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'expired', 'disabled')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, solution_code)
);
CREATE INDEX business_solution_active_idx ON business_solution (business_id, status, expires_at);

CREATE TABLE solution_config (
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  solution_code text NOT NULL CHECK (solution_code IN ('leads', 'sales', 'autopost', 'booking', 'admin_messages', 'moderation')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, solution_code)
);

CREATE TABLE integration_key (
  business_id uuid PRIMARY KEY REFERENCES business(id) ON DELETE CASCADE,
  key_hash text NOT NULL,
  key_hint text NOT NULL CHECK (length(key_hint) BETWEEN 4 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  revoked_at timestamptz
);
