-- Booking extensions: choose_specialist, schedule mode, manual slots, specialist photo/title.
ALTER TABLE booking_settings
  ADD COLUMN choose_specialist boolean NOT NULL DEFAULT true,
  ADD COLUMN schedule_mode text NOT NULL DEFAULT 'automatic'
    CHECK (schedule_mode IN ('automatic', 'manual'));

ALTER TABLE booking_specialist
  ADD COLUMN title text NOT NULL DEFAULT '' CHECK (length(title) <= 120),
  ADD COLUMN photo_attachment_id uuid;

CREATE TABLE booking_manual_slot (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  specialist_id uuid,
  service_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (starts_at < ends_at),
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, specialist_id) REFERENCES booking_specialist (business_id, id),
  FOREIGN KEY (business_id, service_id) REFERENCES booking_service (business_id, id)
);

CREATE INDEX booking_manual_slot_window ON booking_manual_slot (business_id, starts_at, ends_at)
  WHERE active = true;
