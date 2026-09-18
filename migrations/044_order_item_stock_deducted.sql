-- Hardening: remember which order lines actually decremented inventory.
-- Additive only. Does not modify migrations 001-043.

ALTER TABLE order_item
  ADD COLUMN IF NOT EXISTS stock_deducted boolean NOT NULL DEFAULT false;
