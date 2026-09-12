ALTER TABLE account_security_event DROP CONSTRAINT account_security_event_action_check;
ALTER TABLE account_security_event ADD CONSTRAINT account_security_event_action_check CHECK (action IN ('recovery_codes_issued', 'password_recovered', 'password_changed'));
