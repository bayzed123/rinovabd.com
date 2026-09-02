-- Invoice numbers move from RNV-000001 to INV-000001 so the shop owner can tell an
-- invoice number apart from an order code. Order codes (RNV-<base36>) are unchanged.
UPDATE orders
SET invoice_number = 'INV-' || substr(invoice_number, 5)
WHERE invoice_number LIKE 'RNV-______'
  AND substr(invoice_number, 5) GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]';

-- Campaign landing pages gain their own SEO/social copy so Meta's ad crawler reads
-- real Open Graph tags instead of the storefront defaults.
ALTER TABLE campaign_pages ADD COLUMN meta_title TEXT;
ALTER TABLE campaign_pages ADD COLUMN meta_description TEXT;
