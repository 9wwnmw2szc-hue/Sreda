-- Unified business calendar events (separate from Booking).
CREATE TABLE calendar_event (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 4000),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES "user"(id),
  assigned_to uuid REFERENCES "user"(id),
  specialist_id uuid,
  event_type text NOT NULL CHECK (event_type IN (
    'note', 'task', 'meeting', 'reminder', 'blocked_time', 'other'
  )),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  related_client_id uuid,
  related_lead_id uuid,
  related_order_id uuid,
  related_booking_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at),
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, specialist_id) REFERENCES booking_specialist (business_id, id),
  FOREIGN KEY (business_id, related_client_id) REFERENCES client (business_id, id),
  FOREIGN KEY (business_id, related_lead_id) REFERENCES lead (business_id, id),
  FOREIGN KEY (business_id, related_order_id) REFERENCES "order" (business_id, id),
  FOREIGN KEY (business_id, related_booking_id) REFERENCES booking (business_id, id)
);

CREATE INDEX calendar_event_window ON calendar_event (business_id, starts_at, ends_at)
  WHERE status <> 'cancelled';
CREATE INDEX calendar_event_assignee ON calendar_event (business_id, assigned_to, starts_at)
  WHERE status = 'open';
CREATE INDEX calendar_event_specialist ON calendar_event (business_id, specialist_id, starts_at)
  WHERE status <> 'cancelled' AND specialist_id IS NOT NULL;

-- Reminder instances for calendar events (and extensible entity kinds).
CREATE TABLE entity_reminder (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES business(id),
  entity_kind text NOT NULL CHECK (entity_kind IN (
    'calendar_event', 'booking', 'order', 'lead'
  )),
  entity_id uuid NOT NULL,
  offset_minutes integer NOT NULL CHECK (offset_minutes >= 0 AND offset_minutes <= 10080),
  fire_at timestamptz NOT NULL,
  audience text NOT NULL DEFAULT 'staff' CHECK (audience IN ('staff', 'client')),
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'telegram', 'vk')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'sent', 'cancelled', 'failed', 'uncertain')),
  recipient_user_id uuid REFERENCES "user"(id),
  message_template text NOT NULL DEFAULT '' CHECK (length(message_template) <= 2000),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, id)
);

CREATE UNIQUE INDEX entity_reminder_dedupe ON entity_reminder (
  business_id, entity_kind, entity_id, offset_minutes, audience, channel,
  COALESCE(recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX entity_reminder_due ON entity_reminder (status, fire_at)
  WHERE status IN ('pending', 'queued');

ALTER TABLE telegram_outbox ADD COLUMN entity_reminder_id uuid UNIQUE REFERENCES entity_reminder(id);
ALTER TABLE vk_outbox ADD COLUMN entity_reminder_id uuid UNIQUE REFERENCES entity_reminder(id);

-- Audit actions for calendar events.
ALTER TABLE business_audit_log DROP CONSTRAINT IF EXISTS business_audit_log_action_check;
ALTER TABLE business_audit_log ADD CONSTRAINT business_audit_log_action_check CHECK (action IN (
  'invitation_created', 'invitation_accepted', 'invitation_revoked', 'member_revoked', 'member_role_changed',
  'connection_connected', 'connection_disconnected', 'lead_taken', 'lead_closed', 'conversation_taken', 'conversation_closed',
  'booking_created', 'booking_rescheduled', 'booking_cancelled', 'booking_completed', 'service_created', 'service_updated',
  'specialist_created', 'specialist_updated', 'post_created', 'post_scheduled', 'post_cancelled', 'post_published',
  'product_created', 'product_updated', 'order_created', 'order_status_changed', 'inventory_adjusted', 'settings_changed',
  'calendar_event_created', 'calendar_event_updated', 'calendar_event_cancelled'
));
