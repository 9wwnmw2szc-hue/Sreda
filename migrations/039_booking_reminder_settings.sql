-- Booking client reminder settings + configurable staff offsets (additive).
ALTER TABLE booking_settings
  ADD COLUMN client_reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN client_reminder_offsets jsonb NOT NULL DEFAULT '[1440,120]',
  ADD COLUMN client_reminder_template text NOT NULL DEFAULT ''
    CHECK (length(client_reminder_template) <= 2000),
  ADD COLUMN staff_reminder_offsets jsonb NOT NULL DEFAULT '[1440,30]';
