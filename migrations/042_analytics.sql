-- Analytics domain: uploaded business tables, saved AI analyses, audit actions.
-- Numbered 042 to leave 040–041 for the parallel Configuration UX branch.

CREATE TABLE business_data_file (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id),
  uploaded_by uuid REFERENCES "user"(id),
  original_filename text NOT NULL,
  storage_key text NOT NULL,
  parsed_storage_key text,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  file_type text NOT NULL CHECK (file_type IN ('xlsx', 'csv')),
  status text NOT NULL CHECK (status IN ('uploaded', 'validating', 'parsing', 'ready', 'failed')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  row_count integer,
  sheet_count integer,
  error_code text,
  error_message text,
  column_mapping jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX business_data_file_business_idx ON business_data_file (business_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE business_data_sheet (
  id uuid PRIMARY KEY,
  file_id uuid NOT NULL REFERENCES business_data_file(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES business(id),
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  row_count integer NOT NULL DEFAULT 0,
  column_count integer NOT NULL DEFAULT 0,
  columns_json jsonb NOT NULL DEFAULT '[]',
  quality_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_data_sheet_file_idx ON business_data_sheet (file_id, position);

CREATE TABLE analytics_saved_analysis (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id),
  file_id uuid REFERENCES business_data_file(id) ON DELETE SET NULL,
  file_version integer,
  created_by uuid REFERENCES "user"(id),
  source_kind text NOT NULL CHECK (source_kind IN ('sreda', 'file')),
  title text NOT NULL,
  question text NOT NULL DEFAULT '',
  analysis_type text NOT NULL CHECK (analysis_type IN ('full', 'question', 'period', 'export')),
  result_json jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_saved_analysis_business_idx ON analytics_saved_analysis (business_id, created_at DESC);

ALTER TABLE business_audit_log DROP CONSTRAINT IF EXISTS business_audit_log_action_check;
ALTER TABLE business_audit_log ADD CONSTRAINT business_audit_log_action_check CHECK (action IN (
  'invitation_created', 'invitation_accepted', 'invitation_revoked', 'member_revoked', 'member_role_changed',
  'connection_connected', 'connection_disconnected', 'lead_taken', 'lead_closed', 'conversation_taken', 'conversation_closed',
  'booking_created', 'booking_rescheduled', 'booking_cancelled', 'booking_completed', 'service_created', 'service_updated',
  'specialist_created', 'specialist_updated', 'post_created', 'post_scheduled', 'post_cancelled', 'post_published',
  'product_created', 'product_updated', 'order_created', 'order_status_changed', 'inventory_adjusted', 'settings_changed',
  'calendar_event_created', 'calendar_event_updated', 'calendar_event_cancelled',
  'analytics_file_uploaded', 'analytics_file_deleted', 'analytics_export_created', 'analytics_ai_created',
  'analytics_import_confirmed'
));
