-- 0017 renamed RNV-000001 to INV-000001, but the very first orders carry an even older
-- shape from 0005 — 'RNV-INV-<base36>' — which that pattern never matched. The dashboard,
-- the order search and the Google Sheet all display printf('INV-%06d', id), so those rows
-- showed one number to the owner while storing another. Normalise every remaining
-- non-canonical value to the same INV-###### form the rest of the system already prints.
-- The Worker performs this same repair on demand when an invoice is opened; this simply
-- does it once for the whole table instead of waiting for someone to open each order.
UPDATE orders
SET invoice_number = printf('INV-%06d', id),
    updated_at = CURRENT_TIMESTAMP
WHERE invoice_number IS NULL
   OR invoice_number <> printf('INV-%06d', id);
