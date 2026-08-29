CREATE TABLE IF NOT EXISTS campaign_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  eyebrow TEXT,
  description TEXT,
  image_url TEXT,
  cta_label TEXT DEFAULT 'Shop now',
  cta_url TEXT DEFAULT '/#shop',
  product_ids_json TEXT DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_campaign_pages_active ON campaign_pages(active, slug);
