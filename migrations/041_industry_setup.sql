-- Industry presets, setup mode, capabilities, setup progress (additive).
ALTER TABLE business
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS industry_subtype text,
  ADD COLUMN IF NOT EXISTS business_model text,
  ADD COLUMN IF NOT EXISTS setup_mode text NOT NULL DEFAULT 'guided',
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS setup_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

ALTER TABLE business
  DROP CONSTRAINT IF EXISTS business_setup_mode_check;
ALTER TABLE business
  ADD CONSTRAINT business_setup_mode_check
  CHECK (setup_mode IN ('guided', 'advanced'));

ALTER TABLE business
  DROP CONSTRAINT IF EXISTS business_business_model_check;
ALTER TABLE business
  ADD CONSTRAINT business_business_model_check
  CHECK (
    business_model IS NULL
    OR business_model IN ('services', 'commerce', 'hybrid')
  );

ALTER TABLE business
  DROP CONSTRAINT IF EXISTS business_industry_check;
ALTER TABLE business
  ADD CONSTRAINT business_industry_check
  CHECK (
    industry IS NULL
    OR industry IN (
      'beauty',
      'automotive',
      'retail',
      'food',
      'construction',
      'education',
      'sport_health',
      'professional_services',
      'rental',
      'other'
    )
  );
