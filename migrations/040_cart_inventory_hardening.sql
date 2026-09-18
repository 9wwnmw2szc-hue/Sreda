-- Hardening: cart NULL-variant uniqueness and order inventory restore flag.
-- Additive only. Does not modify migrations 001-039.

-- PostgreSQL treats NULL as distinct in UNIQUE, so allow only one non-variant line per cart/product.
ALTER TABLE cart_item DROP CONSTRAINT IF EXISTS cart_item_cart_id_product_id_variant_id_key;

CREATE UNIQUE INDEX cart_item_unique_with_variant
  ON cart_item (cart_id, product_id, variant_id)
  WHERE variant_id IS NOT NULL;

CREATE UNIQUE INDEX cart_item_unique_without_variant
  ON cart_item (cart_id, product_id)
  WHERE variant_id IS NULL;

-- Exactly-once inventory restore on cancel.
ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS inventory_restored_at timestamptz;
