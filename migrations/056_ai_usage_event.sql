-- Additive AI usage accounting for Closed Beta cost control.
CREATE TABLE IF NOT EXISTS ai_usage_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES business(id),
  feature text NOT NULL CHECK (char_length(feature) BETWEEN 1 AND 64),
  model text NOT NULL DEFAULT '' CHECK (char_length(model) <= 120),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  estimated_cost_minor integer CHECK (estimated_cost_minor IS NULL OR estimated_cost_minor >= 0),
  currency text NOT NULL DEFAULT 'RUB' CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_event_business_created_idx
  ON ai_usage_event (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_event_business_day_idx
  ON ai_usage_event (business_id, ((created_at AT TIME ZONE 'UTC')::date));
