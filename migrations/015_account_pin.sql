CREATE TABLE account_pin (
 user_id uuid PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
 pin_hash text NOT NULL,
 failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE account_security_event DROP CONSTRAINT account_security_event_action_check;
ALTER TABLE account_security_event ADD CONSTRAINT account_security_event_action_check
 CHECK (action IN ('recovery_codes_issued', 'password_recovered', 'password_changed', 'pin_enabled', 'pin_changed', 'pin_disabled'));
