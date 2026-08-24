INSERT OR IGNORE INTO products (category_id, name, slug, description, price, compare_at_price, image_url, stock, rating, review_count, featured, active, barcode, weight_grams)
SELECT c.id, 'Radiant Glow Makeup Edit', 'radiant-glow-makeup-edit', 'A polished makeup edit for radiant everyday looks.', 1290, 1590, '/assets/rinova-makeup-flatlay-wide.png', 18, 4.8, 0, 1, 1, 'RNV-MK-001', 320
FROM categories c WHERE c.slug = 'makeup';

INSERT OR IGNORE INTO products (category_id, name, slug, description, price, compare_at_price, image_url, stock, rating, review_count, featured, active, barcode, weight_grams)
SELECT c.id, 'The Complete Makeup Collection', 'complete-makeup-collection', 'A curated collection of complexion, eye and lip essentials.', 1890, 2290, '/assets/rinova-makeup-collection.png', 14, 4.9, 0, 1, 1, 'RNV-MK-002', 540
FROM categories c WHERE c.slug = 'makeup';

INSERT OR IGNORE INTO products (category_id, name, slug, description, price, compare_at_price, image_url, stock, rating, review_count, featured, active, barcode, weight_grams)
SELECT c.id, 'Everyday Makeup Essentials', 'everyday-makeup-essentials', 'A versatile studio-inspired selection for your daily routine.', 1490, 1790, '/assets/rinova-makeup-studio.png', 20, 4.7, 0, 1, 1, 'RNV-MK-003', 480
FROM categories c WHERE c.slug = 'makeup';

INSERT OR IGNORE INTO products (category_id, name, slug, description, price, compare_at_price, image_url, stock, rating, review_count, featured, active, barcode, weight_grams)
SELECT c.id, 'Pink Glow Lip & Blush Edit', 'pink-glow-lip-blush-edit', 'A soft pink edit of lip colour, gloss and luminous blush.', 990, 1190, '/assets/rinova-pink-lip-edit.png', 25, 4.8, 0, 1, 1, 'RNV-MK-004', 260
FROM categories c WHERE c.slug = 'makeup';

INSERT OR IGNORE INTO products (category_id, name, slug, description, price, compare_at_price, image_url, stock, rating, review_count, featured, active, barcode, weight_grams)
SELECT c.id, 'Glow Bloom Skincare Duo', 'glow-bloom-skincare-duo', 'A radiant skincare pairing for a soft, hydrated-looking finish.', 1190, 1490, '/assets/rinova-glow-skincare.png', 16, 4.9, 0, 1, 1, 'RNV-SK-001', 390
FROM categories c WHERE c.slug = 'skin-care';

INSERT OR IGNORE INTO products (category_id, name, slug, description, price, compare_at_price, image_url, stock, rating, review_count, featured, active, barcode, weight_grams)
SELECT c.id, 'Blush & Bloom Gift Set', 'blush-and-bloom-gift-set', 'A thoughtful multi-piece self-care set for gifting or your own ritual.', 1690, 1990, '/assets/rinova-blush-bloom-set.png', 12, 4.8, 0, 1, 1, 'RNV-SK-002', 720
FROM categories c WHERE c.slug = 'skin-care';

INSERT OR IGNORE INTO products (category_id, name, slug, description, price, compare_at_price, image_url, stock, rating, review_count, featured, active, barcode, weight_grams)
SELECT c.id, 'Beet + Vitamin A Serum Shot', 'beet-vitamin-a-serum-shot', 'A targeted serum shot for a smoother, refreshed-looking complexion.', 790, 950, '/assets/rinova-vitamin-serum.png', 22, 4.7, 0, 0, 1, 'RNV-SK-003', 110
FROM categories c WHERE c.slug = 'skin-care';

INSERT OR IGNORE INTO products (category_id, name, slug, description, price, compare_at_price, image_url, stock, rating, review_count, featured, active, barcode, weight_grams)
SELECT c.id, 'Rose Water 70% Glow Serum', 'rose-water-70-glow-serum', 'A light, luminous serum for a dewy everyday skincare ritual.', 890, 1090, '/assets/rinova-rose-serum.png', 20, 4.8, 0, 0, 1, 'RNV-SK-004', 120
FROM categories c WHERE c.slug = 'skin-care';

INSERT OR IGNORE INTO products (category_id, name, slug, description, price, compare_at_price, image_url, stock, rating, review_count, featured, active, barcode, weight_grams)
SELECT c.id, 'Pink Petal Pressed Blush', 'pink-petal-pressed-blush', 'A soft pressed blush for a fresh, naturally flushed finish.', 590, 690, '/assets/rinova-blush-pink-editorial.png', 28, 4.8, 0, 1, 1, 'RNV-MK-005', 95
FROM categories c WHERE c.slug = 'makeup';

INSERT OR IGNORE INTO products (category_id, name, slug, description, price, compare_at_price, image_url, stock, rating, review_count, featured, active, barcode, weight_grams)
SELECT c.id, 'Rose Gold Blush Duo', 'rose-gold-blush-duo', 'A luminous blush duo with soft rosy tones for buildable colour.', 690, 790, '/assets/rinova-blush-duo.png', 24, 4.7, 0, 1, 1, 'RNV-MK-006', 120
FROM categories c WHERE c.slug = 'makeup';

INSERT OR IGNORE INTO products (category_id, name, slug, description, price, compare_at_price, image_url, stock, rating, review_count, featured, active, barcode, weight_grams)
SELECT c.id, 'Marble Rose Baked Blush', 'marble-rose-baked-blush', 'A marbled baked blush for a warm, polished everyday glow.', 620, 750, '/assets/rinova-marble-blush.png', 26, 4.6, 0, 0, 1, 'RNV-MK-007', 105
FROM categories c WHERE c.slug = 'makeup';
