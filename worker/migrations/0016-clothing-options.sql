-- The seed image is the storefront's own fallback photo. This line originally named a clothing
-- photo that was never shipped, so the category tile drew a broken image; migration 0024
-- repairs databases that already ran the old version.
INSERT OR IGNORE INTO categories(name, slug, image_url, sort_order, active) VALUES ('Clothing', 'clothing', '/assets/beauty-flatlay.jpg', 2, 1);
