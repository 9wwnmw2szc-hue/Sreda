-- Business type + AI profile fields (additive).
ALTER TABLE business
  ADD COLUMN business_type text NOT NULL DEFAULT 'hybrid'
    CHECK (business_type IN ('store', 'service', 'hybrid'));

ALTER TABLE business
  ADD COLUMN ai_about text NOT NULL DEFAULT '' CHECK (length(ai_about) <= 8000),
  ADD COLUMN ai_tone text NOT NULL DEFAULT '' CHECK (length(ai_tone) <= 1000),
  ADD COLUMN ai_important_facts text NOT NULL DEFAULT '' CHECK (length(ai_important_facts) <= 4000),
  ADD COLUMN ai_restrictions text NOT NULL DEFAULT '' CHECK (length(ai_restrictions) <= 4000),
  ADD COLUMN ai_delivery_info text NOT NULL DEFAULT '' CHECK (length(ai_delivery_info) <= 2000),
  ADD COLUMN ai_geography text NOT NULL DEFAULT '' CHECK (length(ai_geography) <= 2000),
  ADD COLUMN ai_returns_info text NOT NULL DEFAULT '' CHECK (length(ai_returns_info) <= 2000),
  ADD COLUMN ai_extra_instructions text NOT NULL DEFAULT '' CHECK (length(ai_extra_instructions) <= 4000);
