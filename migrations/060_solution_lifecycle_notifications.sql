-- Additive: solution pause status, notification resolve, user inbox, setup drafts.

-- 1) Allow paused solutions (owner soft-pause without data loss).
ALTER TABLE business_solution DROP CONSTRAINT IF EXISTS business_solution_status_check;
ALTER TABLE business_solution
  ADD CONSTRAINT business_solution_status_check
  CHECK (status IN ('active', 'trial', 'expired', 'disabled', 'paused'));

-- 2) Resolve/archive lifecycle for staff notifications.
ALTER TABLE notification_recipient
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS notification_recipient_actionable_idx
  ON notification_recipient (business_id, user_id)
  WHERE read_at IS NULL AND resolved_at IS NULL;

-- 3) Preference types for invitation + unfinished setup.
ALTER TABLE notification_preference
  DROP CONSTRAINT IF EXISTS notification_preference_type_check;

ALTER TABLE notification_preference
  ADD CONSTRAINT notification_preference_type_check
  CHECK (type IN (
    'lead.created',
    'message.received',
    'booking.created',
    'booking.cancelled',
    'booking.rescheduled',
    'booking.upcoming',
    'order.created',
    'post.failed',
    'calendar.reminder',
    'inventory.low_stock',
    'invitation.received',
    'setup.abandoned'
  ));

-- 4) Account-level inbox (invitees are not yet business members).
CREATE TABLE IF NOT EXISTS user_notification (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  target_path text NOT NULL,
  event_key text NOT NULL,
  business_id uuid REFERENCES business(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);

CREATE INDEX IF NOT EXISTS user_notification_actionable_idx
  ON user_notification (user_id, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS user_notification_business_idx
  ON user_notification (business_id, type)
  WHERE business_id IS NOT NULL;

-- 5) Unified unfinished solution setup drafts (leads/orders/booking/inbox/autopost).
CREATE TABLE IF NOT EXISTS solution_setup_draft (
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  solution_code text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'reminded', 'completed', 'cancelled')),
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_solution_status text,
  previous_config jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  reminder_sent_at timestamptz,
  cancel_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, solution_code)
);

CREATE INDEX IF NOT EXISTS solution_setup_draft_reminder_idx
  ON solution_setup_draft (status, last_activity_at)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS solution_setup_draft_cancel_idx
  ON solution_setup_draft (status, cancel_after)
  WHERE status = 'reminded' AND cancel_after IS NOT NULL;

-- Invitation decline status (invitee action).
ALTER TABLE business_invitation DROP CONSTRAINT IF EXISTS business_invitation_status_check;
ALTER TABLE business_invitation
  ADD CONSTRAINT business_invitation_status_check
  CHECK (status IN ('pending', 'accepted', 'revoked', 'expired', 'declined'));

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
  'conversation_internal_note', 'data_import_committed'
));
