-- Additive: optional low-stock alert threshold for tracked inventory products.
ALTER TABLE product
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer
  CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0);

COMMENT ON COLUMN product.low_stock_threshold IS
  'When set with track_inventory, crossing at-or-below this quantity may emit a deduped low-stock notification.';
