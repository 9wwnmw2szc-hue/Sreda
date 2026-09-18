-- AI interview draft + confirmed summary (additive).
ALTER TABLE business
  ADD COLUMN IF NOT EXISTS ai_interview jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_summary_confirmed_at timestamptz;
