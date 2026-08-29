ALTER TABLE orders ADD COLUMN customer_note TEXT;

-- The storefront checkout now collects one optional customer-facing note per order.
-- Existing rows remain unchanged and continue to use the nullable column.

