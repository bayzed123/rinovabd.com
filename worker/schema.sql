PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  brand TEXT,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  compare_at_price INTEGER,
  image_url TEXT,
  gallery_json TEXT NOT NULL DEFAULT '[]',
  stock INTEGER NOT NULL DEFAULT 0,
  skin_type TEXT,
  concern TEXT,
  rating REAL NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  district TEXT,
  upazila TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  subtotal INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL,
  delivery_zone TEXT NOT NULL CHECK (delivery_zone IN ('dhaka', 'outside-dhaka', 'emergency')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod', 'bkash', 'nagad', 'rocket')),
  trx_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','processing','shipped','delivered','customer_cancelled','refused','delivery_failed','returned','admin_cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','verified','failed','refunded')),
  courier_status TEXT NOT NULL DEFAULT 'not_booked',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone TEXT NOT NULL UNIQUE CHECK (zone IN ('dhaka', 'outside-dhaka', 'emergency')),
  label TEXT NOT NULL,
  fee INTEGER NOT NULL CHECK (fee >= 0),
  customer_selectable INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS location_directory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district TEXT NOT NULL,
  upazila TEXT NOT NULL,
  zone TEXT NOT NULL CHECK (zone IN ('dhaka', 'outside-dhaka')),
  UNIQUE(district, upazila)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_id INTEGER REFERENCES customers(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  photo_url TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured, active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id, active);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_search ON location_directory(district, upazila);

INSERT OR IGNORE INTO delivery_rules(zone, label, fee, customer_selectable) VALUES
  ('dhaka', 'Dhaka-এর ভিতরে', 90, 0),
  ('outside-dhaka', 'Dhaka-এর বাইরে', 150, 0),
  ('emergency', 'Emergency delivery', 250, 0);

INSERT OR IGNORE INTO categories(name, slug, image_url, sort_order) VALUES
  ('Skin Care', 'skin-care', '/assets/skincare-products.jpg', 1),
  ('Face Care', 'face-care', '/assets/beauty-flatlay.jpg', 2),
  ('Face Makeup', 'face-makeup', '/assets/beauty-flatlay.jpg', 3),
  ('Eyes Makeup', 'eyes-makeup', '/assets/skincare-model.jpg', 4),
  ('Makeup', 'makeup', '/assets/beauty-flatlay.jpg', 5),
  ('Hair Care', 'hair-care', '/assets/skincare-products.jpg', 6),
  ('Perfume', 'perfume', '/assets/beauty-flatlay.jpg', 7),
  ('Kids', 'kids', '/assets/skincare-products.jpg', 8);

INSERT OR IGNORE INTO location_directory(district, upazila, zone) VALUES
  ('Dhaka', 'Dhanmondi', 'dhaka'),
  ('Dhaka', 'Gulshan', 'dhaka'),
  ('Dhaka', 'Mirpur', 'dhaka'),
  ('Dhaka', 'Uttara', 'dhaka'),
  ('Dhaka', 'Mohammadpur', 'dhaka'),
  ('Rajshahi', 'Boalia', 'outside-dhaka'),
  ('Rajshahi', 'Paba', 'outside-dhaka'),
  ('Tangail', 'Tangail Sadar', 'outside-dhaka'),
  ('Chattogram', 'Kotwali', 'outside-dhaka'),
  ('Sylhet', 'Sylhet Sadar', 'outside-dhaka');

INSERT OR IGNORE INTO products(name, slug, description, price, compare_at_price, image_url, stock, skin_type, concern, rating, review_count, featured, active) VALUES
  ('Dew Ritual Hydrating Serum', 'dew-ritual-hydrating-serum', 'A lightweight daily serum for soft, hydrated-looking skin.', 890, 1090, '/assets/skincare-products.jpg', 24, 'All skin types', 'Dehydration', 4.8, 36, 1, 1),
  ('Cloud Cleanse Gentle Face Wash', 'cloud-cleanse-gentle-face-wash', 'A gentle cleanser for a fresh, comfortable finish.', 590, 690, '/assets/beauty-flatlay.jpg', 32, 'Sensitive skin', 'Daily cleansing', 4.7, 28, 1, 1),
  ('Soft Glow SPF 50 Sunscreen', 'soft-glow-spf-50-sunscreen', 'A smooth daily sunscreen with a comfortable, non-heavy finish.', 780, 950, '/assets/skincare-model.jpg', 18, 'All skin types', 'Sun protection', 4.9, 51, 1, 1),
  ('Rose Petal Lip Tint', 'rose-petal-lip-tint', 'A buildable rosy tint for an effortless everyday look.', 450, 520, '/assets/beauty-flatlay.jpg', 40, 'All skin types', 'Lip colour', 4.6, 19, 0, 1);
