-- Offers could only be created on their own page, applied to the whole basket, and never
-- showed anywhere on the storefront: a percentage was calculated at checkout and the customer
-- saw no price change on the card or the product page. These three columns close that.

-- A discount that belongs to the product itself, set in the product editor rather than on a
-- separate page. It is the advertised price: cards, the product page, the campaign page and
-- the order all charge base × (100 - percent) / 100.
ALTER TABLE products ADD COLUMN discount_percent INTEGER NOT NULL DEFAULT 0;
-- Optional wording for the badge ("Eid offer"). Empty falls back to "-20%".
ALTER TABLE products ADD COLUMN discount_label TEXT;
-- When set, the discount stops itself on this date without anyone remembering to turn it off.
ALTER TABLE products ADD COLUMN discount_ends_at TEXT;

-- A coupon or auto offer can now name the products it covers. An empty list means the whole
-- shop, which is what every existing offer meant, so the default keeps them working unchanged.
ALTER TABLE offers ADD COLUMN product_ids_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_products_discount ON products(discount_percent);
