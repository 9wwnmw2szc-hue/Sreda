-- Allow canonical `orders` solution code alongside legacy `sales`.
ALTER TABLE business_solution DROP CONSTRAINT IF EXISTS business_solution_solution_code_check;
ALTER TABLE business_solution ADD CONSTRAINT business_solution_solution_code_check
  CHECK (solution_code IN ('leads', 'sales', 'orders', 'autopost', 'booking', 'admin_messages', 'moderation'));

ALTER TABLE solution_config DROP CONSTRAINT IF EXISTS solution_config_solution_code_check;
ALTER TABLE solution_config ADD CONSTRAINT solution_config_solution_code_check
  CHECK (solution_code IN ('leads', 'sales', 'orders', 'autopost', 'booking', 'admin_messages', 'moderation'));

-- Audit actions for catalog and orders.
ALTER TABLE business_audit_log DROP CONSTRAINT IF EXISTS business_audit_log_action_check;
ALTER TABLE business_audit_log ADD CONSTRAINT business_audit_log_action_check CHECK (action IN (
  'invitation_created', 'invitation_accepted', 'invitation_revoked', 'member_revoked', 'member_role_changed',
  'connection_connected', 'connection_disconnected', 'lead_taken', 'lead_closed', 'conversation_taken', 'conversation_closed',
  'booking_created', 'booking_rescheduled', 'booking_cancelled', 'booking_completed', 'service_created', 'service_updated',
  'specialist_created', 'specialist_updated', 'post_created', 'post_scheduled', 'post_cancelled', 'post_published',
  'product_created', 'product_updated', 'order_created', 'order_status_changed', 'inventory_adjusted', 'settings_changed'
));
