ALTER TABLE products ADD COLUMN barcode TEXT;
ALTER TABLE products ADD COLUMN weight_grams INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN order_source TEXT NOT NULL DEFAULT 'website';
ALTER TABLE orders ADD COLUMN package_weight_grams INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN courier_provider TEXT;
ALTER TABLE orders ADD COLUMN courier_consignment_id TEXT;
ALTER TABLE orders ADD COLUMN courier_tracking_code TEXT;
ALTER TABLE orders ADD COLUMN courier_last_status TEXT;
ALTER TABLE orders ADD COLUMN courier_last_updated TEXT;
ALTER TABLE orders ADD COLUMN verified_at TEXT;
ALTER TABLE orders ADD COLUMN advance_delivery_fee INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER REFERENCES suppliers(id),
  invoice_number TEXT,
  purchase_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  subtotal INTEGER NOT NULL DEFAULT 0,
  document_url TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost INTEGER NOT NULL,
  weight_grams INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  expense_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  document_url TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS incomplete_checkouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT,
  name TEXT,
  address TEXT,
  district TEXT,
  upazila TEXT,
  cart_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'website',
  recovered_order_id INTEGER REFERENCES orders(id),
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS integration_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  order_id INTEGER REFERENCES orders(id),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  response_json TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(order_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_courier ON orders(courier_tracking_code, courier_consignment_id);
CREATE INDEX IF NOT EXISTS idx_incomplete_phone ON incomplete_checkouts(phone, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);

UPDATE products SET barcode = 'RNV-' || printf('%06d', id) WHERE barcode IS NULL;
UPDATE products SET weight_grams = 100 WHERE weight_grams = 0;
