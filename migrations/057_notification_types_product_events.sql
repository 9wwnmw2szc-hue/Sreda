-- Expand staff notification preference types (additive CHECK replace) + beta product events.

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
    'inventory.low_stock'
  ));

CREATE TABLE IF NOT EXISTS product_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES business(id),
  user_id uuid,
  event text NOT NULL CHECK (char_length(event) BETWEEN 1 AND 64),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_event_created_idx
  ON product_event (created_at DESC);

CREATE INDEX IF NOT EXISTS product_event_business_event_idx
  ON product_event (business_id, event, created_at DESC)
  WHERE business_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reply_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES business(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS reply_template_business_idx
  ON reply_template (business_id, created_at DESC)
  WHERE archived_at IS NULL;
