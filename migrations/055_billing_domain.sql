-- Provider-agnostic billing domain for Closed Beta.
-- Entitlement source of truth remains business_solution (status/starts_at/expires_at).
-- These tables hold future payment-provider subscription state only — they do NOT
-- duplicate entitlement. Confirmed provider events will later upsert business_solution.

CREATE TABLE IF NOT EXISTS billing_plan (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'RUB' CHECK (currency ~ '^[A-Z]{3}$'),
  unit_price_minor integer NOT NULL CHECK (unit_price_minor >= 0),
  interval text NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year', 'one_time')),
  solution_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE billing_plan IS
  'Catalog of billable plans for documentation and future checkout. Prices mirror productSolutions.';

CREATE TABLE IF NOT EXISTS business_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  provider text NOT NULL DEFAULT 'none'
    CHECK (provider IN ('none', 'noop', 'mock', 'yookassa', 'stripe')),
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id)
);

CREATE INDEX IF NOT EXISTS business_subscription_status_idx
  ON business_subscription (status, current_period_end);

COMMENT ON TABLE business_subscription IS
  'Payment-provider subscription ledger per business. Entitlement is business_solution.';

CREATE TABLE IF NOT EXISTS business_subscription_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES business_subscription(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  solution_code text NOT NULL,
  plan_code text REFERENCES billing_plan(code),
  unit_price_minor integer NOT NULL CHECK (unit_price_minor >= 0),
  currency text NOT NULL DEFAULT 'RUB' CHECK (currency ~ '^[A-Z]{3}$'),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, solution_code)
);

CREATE INDEX IF NOT EXISTS business_subscription_item_business_idx
  ON business_subscription_item (business_id, solution_code);

COMMENT ON TABLE business_subscription_item IS
  'Line items for a provider subscription. Activating access still writes business_solution.';

-- Optional documentation seed aligned with src/lib/productSolutions.ts (idempotent).
INSERT INTO billing_plan (code, name, description, currency, unit_price_minor, interval, solution_code)
VALUES
  ('plan_leads', 'Приём заявок', 'Форма заявки в мессенджерах', 'RUB', 25000, 'month', 'leads'),
  ('plan_orders', 'Приём заказов', 'Каталог и заказы из бота', 'RUB', 25000, 'month', 'orders'),
  ('plan_booking', 'Онлайн-запись', 'Услуги и расписание', 'RUB', 25000, 'month', 'booking'),
  ('plan_admin_messages', 'Связь с администратором', 'Единый inbox', 'RUB', 0, 'month', 'admin_messages'),
  ('plan_autopost', 'Автопостинг', 'Публикации в Telegram и VK', 'RUB', 25000, 'month', 'autopost')
ON CONFLICT (code) DO NOTHING;
