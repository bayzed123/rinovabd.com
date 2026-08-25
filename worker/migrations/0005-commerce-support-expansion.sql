-- Rinova BD commerce, CMS, customer account, POS, return and chatbot expansion
ALTER TABLE orders ADD COLUMN invoice_number TEXT;
ALTER TABLE orders ADD COLUMN return_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE orders ADD COLUMN return_reason TEXT;
ALTER TABLE orders ADD COLUMN refund_status TEXT NOT NULL DEFAULT 'not_applicable';
ALTER TABLE orders ADD COLUMN refund_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN password_hash TEXT;
ALTER TABLE customers ADD COLUMN account_status TEXT NOT NULL DEFAULT 'guest';
ALTER TABLE customers ADD COLUMN last_login_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_invoice_number ON orders(invoice_number) WHERE invoice_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_return_status ON orders(return_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_account_status ON customers(account_status, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expiry ON customer_sessions(expires_at);

CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  return_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','picked_up','received','refunded','rejected','cancelled')),
  reason TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pos_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','bkash','nagad','rocket','card')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided','refunded')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pos_sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  barcode TEXT,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_date ON pos_sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_barcode ON pos_sale_items(barcode);

CREATE TABLE IF NOT EXISTS site_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  seo_title TEXT,
  seo_description TEXT,
  updated_by TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TEXT,
  author TEXT NOT NULL DEFAULT 'Rinova BD',
  updated_by TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_blog_status_date ON blog_posts(status, published_at DESC);
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed','percentage','free_delivery')),
  discount_value INTEGER NOT NULL DEFAULT 0,
  min_subtotal INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cms_content (
  content_key TEXT PRIMARY KEY,
  content_type TEXT NOT NULL DEFAULT 'text',
  title TEXT NOT NULL DEFAULT '',
  body_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  updated_by TEXT NOT NULL DEFAULT 'admin',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('customer_ai','staff_ai')),
  customer_id INTEGER REFERENCES customers(id),
  staff_scope TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user','assistant','system')),
  content TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'cloudflare-ai',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_visitor ON chat_conversations(visitor_key, channel, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at ASC);

INSERT OR IGNORE INTO categories(name, slug, image_url, sort_order, active) VALUES ('Clothing', 'clothing', '/assets/beauty-flatlay.jpg', 99, 0);
INSERT OR IGNORE INTO site_pages(slug, title, body, status, updated_by) VALUES
  ('delivery-returns', 'Delivery & Returns', 'Dhaka delivery is ৳90 and outside-Dhaka delivery is ৳150. Contact support before requesting a return.', 'published', 'migration'),
  ('about-rinova', 'About Rinova BD', 'Thoughtful beauty and personal-care essentials for real life in Bangladesh.', 'published', 'migration');
INSERT OR IGNORE INTO cms_content(content_key, content_type, title, body_json, status, updated_by) VALUES
  ('site_identity', 'settings', 'Rinova BD', '{"tagline":"Beauty, thoughtfully chosen"}', 'published', 'migration'),
  ('homepage_sections', 'settings', 'Homepage sections', '{"hero":true,"categories":true,"products":true,"story":true,"journal":true}', 'published', 'migration'),
  ('topbar_notice', 'banner', 'Free delivery over ৳1,500', '{"text":"Free delivery over ৳1,500 · Authentic beauty essentials"}', 'published', 'migration');
UPDATE orders SET invoice_number = 'RNV-INV-' || printf('%06d', id) WHERE invoice_number IS NULL;
