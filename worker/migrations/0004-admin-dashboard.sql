-- Rinova BD custom admin dashboard foundation
ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE products ADD COLUMN short_description TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN cost_price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN min_order_qty INTEGER NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE products ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN specs_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN volume_tiers_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status, active);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity_delta INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('restock','return','damage','adjustment','sale','cancellation')),
  note TEXT,
  actor TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS store_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO store_settings(setting_key, setting_value) VALUES
  ('store_name', 'Rinova BD'),
  ('tagline', 'Beauty, thoughtfully chosen'),
  ('support_phone', '01522105710'),
  ('support_email', 'hello@rinovabd.com'),
  ('currency_code', 'BDT'),
  ('currency_symbol', '৳'),
  ('delivery_inside_dhaka', '90'),
  ('delivery_outside_dhaka', '150'),
  ('free_delivery_over', '1500'),
  ('order_whatsapp_number', '8801522105710'),
  ('bkash_number', ''),
  ('nagad_number', ''),
  ('rocket_number', ''),
  ('tax_percentage', '0'),
  ('site_description', 'Thoughtfully selected skincare, makeup and personal-care essentials for Bangladesh.'),
  ('site_logo_url', ''),
  ('favicon_url', '');

UPDATE products SET sku = COALESCE(sku, 'RNV-' || printf('%05d', id)), updated_at = CURRENT_TIMESTAMP WHERE sku IS NULL;
