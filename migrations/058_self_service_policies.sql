-- Customer self-service policies for booking and orders (additive).

ALTER TABLE booking_settings
  ADD COLUMN IF NOT EXISTS allow_customer_cancel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cancel_before_minutes integer NOT NULL DEFAULT 0
    CHECK (cancel_before_minutes >= 0),
  ADD COLUMN IF NOT EXISTS allow_reschedule boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reschedule_before_minutes integer NOT NULL DEFAULT 0
    CHECK (reschedule_before_minutes >= 0);

CREATE TABLE IF NOT EXISTS order_settings (
  business_id uuid PRIMARY KEY REFERENCES business(id),
  customer_cancel_statuses text[] NOT NULL DEFAULT ARRAY['new','accepted']::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN booking_settings.allow_customer_cancel IS
  'When false, customers cannot cancel via bot/self-service.';
COMMENT ON COLUMN booking_settings.cancel_before_minutes IS
  'Minimum minutes before starts_at required for customer cancel (0 = until start).';
COMMENT ON COLUMN order_settings.customer_cancel_statuses IS
  'Order statuses from which a customer may cancel (staff transitions unchanged).';
