-- Rinova marketing banners and newsletter lead capture
CREATE TABLE IF NOT EXISTS newsletter_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'footer',
  status TEXT NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed','unsubscribed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_newsletter_leads_status ON newsletter_leads(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS marketing_banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  eyebrow TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  link_url TEXT,
  placement TEXT NOT NULL DEFAULT 'marquee' CHECK (placement IN ('marquee','popup')),
  category_slug TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  marquee_speed INTEGER NOT NULL DEFAULT 22,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_marketing_banners_live ON marketing_banners(placement, active, sort_order, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_banners_category ON marketing_banners(category_slug, active);
