-- Additive: optional per-variant price overrides flag (base price remains authoritative when false).
ALTER TABLE product
  ADD COLUMN IF NOT EXISTS variant_prices_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN product.variant_prices_enabled IS
  'When false, all variants inherit product.price. When true, product_variant.price may override.';
