-- Offers were stored and displayed but never applied to an order: the orders table had no
-- discount column and checkout had no coupon field, so a percentage offer could be created
-- and would change nothing. These columns let a discount actually be computed, recorded and
-- limited.
ALTER TABLE offers ADD COLUMN usage_limit INTEGER NOT NULL DEFAULT 0;   -- 0 = unlimited
ALTER TABLE offers ADD COLUMN used_count INTEGER NOT NULL DEFAULT 0;
-- An auto offer needs no code: it applies itself once the subtotal qualifies.
ALTER TABLE offers ADD COLUMN auto_apply INTEGER NOT NULL DEFAULT 0;

ALTER TABLE orders ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN offer_code TEXT;

-- Priced variants. Sizes and weights (50g, 100g) and clothing sizes/colours existed only as
-- labels inside specs_json, so a product could offer "50ml or 150ml" with a single price and
-- no way to charge differently for each. Pricing lives here, server-side, so the browser can
-- never choose what a variant costs.
CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'size' CHECK (kind IN ('size','color')),
  label TEXT NOT NULL,
  price INTEGER,                                  -- NULL on a colour, or to inherit the base price
  compare_at_price INTEGER,
  stock INTEGER NOT NULL DEFAULT 0,
  sku TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, kind, label)
);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id, kind, sort_order);

-- What the customer actually chose, so an order line can be read back correctly months later.
ALTER TABLE order_items ADD COLUMN variant_label TEXT;

-- The product FAQ was hard-coded in product.js, identical on every product.
ALTER TABLE products ADD COLUMN faq_json TEXT NOT NULL DEFAULT '[]';
