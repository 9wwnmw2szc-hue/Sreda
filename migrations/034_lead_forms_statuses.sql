-- Lead custom form fields, expanded CRM statuses, status history.
ALTER TABLE lead DROP CONSTRAINT IF EXISTS lead_status_check;
ALTER TABLE lead ADD CONSTRAINT lead_status_check
  CHECK (status IN ('new', 'processing', 'waiting_customer', 'completed', 'rejected', 'closed'));
ALTER TABLE lead ADD CONSTRAINT lead_business_unique UNIQUE (business_id, id);

-- Map legacy closed → completed semantics kept for compatibility; new writes use completed/rejected.

CREATE TABLE lead_form_field (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id),
  field_key text NOT NULL CHECK (length(trim(field_key)) BETWEEN 1 AND 64),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  field_type text NOT NULL CHECK (field_type IN (
    'text', 'textarea', 'phone', 'email', 'number', 'select', 'multiselect',
    'date', 'checkbox', 'attachment', 'name', 'message', 'address', 'budget', 'service'
  )),
  required boolean NOT NULL DEFAULT false,
  placeholder text NOT NULL DEFAULT '' CHECK (length(placeholder) <= 200),
  options jsonb NOT NULL DEFAULT '[]',
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id),
  UNIQUE (business_id, field_key)
);

CREATE TABLE lead_status_history (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid REFERENCES "user"(id),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (business_id, lead_id) REFERENCES lead (business_id, id)
);

CREATE INDEX lead_status_history_lead ON lead_status_history (business_id, lead_id, created_at);
