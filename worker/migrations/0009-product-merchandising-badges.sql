-- Explicit storefront merchandising badges selected by the owner.
-- Values are stored as JSON: ["hot","instock","new"]
ALTER TABLE products ADD COLUMN badges_json TEXT NOT NULL DEFAULT '[]';
