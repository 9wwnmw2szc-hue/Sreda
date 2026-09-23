-- Additive: solution lifecycle audit actions + optional timestamps on business_solution.

ALTER TABLE business_solution
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS settings_reset_at timestamptz;

ALTER TABLE business_audit_log DROP CONSTRAINT IF EXISTS business_audit_log_action_check;
ALTER TABLE business_audit_log ADD CONSTRAINT business_audit_log_action_check CHECK (action IN (
  'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_declined',
  'member_revoked', 'member_role_changed',
  'connection_connected', 'connection_disconnected', 'lead_taken', 'lead_closed',
  'conversation_taken', 'conversation_closed',
  'booking_created', 'booking_rescheduled', 'booking_cancelled', 'booking_completed',
  'service_created', 'service_updated', 'specialist_created', 'specialist_updated',
  'post_created', 'post_scheduled', 'post_cancelled', 'post_published',
  'product_created', 'product_updated', 'order_created', 'order_status_changed',
  'inventory_adjusted', 'settings_changed',
  'calendar_event_created', 'calendar_event_updated', 'calendar_event_cancelled',
  'analytics_file_uploaded', 'analytics_file_deleted', 'analytics_export_created',
  'analytics_ai_created', 'analytics_import_confirmed', 'client_merged',
  'conversation_internal_note', 'data_import_committed',
  'solution.setup_cancelled', 'solution.paused', 'solution.resumed',
  'solution.disabled', 'solution.reenabled', 'solution.settings_reset'
));
