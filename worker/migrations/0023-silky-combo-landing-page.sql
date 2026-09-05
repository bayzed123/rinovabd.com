-- The combo the ad landing page sells, and the free delivery it promises.
--
-- Both are real records rather than wording on a page: the order is priced from this row, and
-- the delivery is waived by a genuine offer, so the ৳850 the customer is shown is the ৳850 the
-- server charges. The owner can edit either from the dashboard afterwards.
INSERT OR IGNORE INTO products (
  category_id, name, slug, sku, description, short_description,
  price, compare_at_price, cost_price, image_url, media_json,
  stock, low_stock_threshold, min_order_qty, weight_grams, status, active, featured, updated_at
) VALUES (
  (SELECT id FROM categories WHERE slug = 'skin-care' LIMIT 1),
  'Beauty Spray + Episoft Serum + Laneige Lip Balm — 3 in 1 Combo',
  'silky-beauty-combo',
  'RNV-LP-COMBO-01',
  'Kingyes Silky Beauty Spray (150ml) দিয়ে ব্যথা ছাড়াই অবাঞ্ছিত লোম পরিষ্কার করুন, আর Episoft Hair Inhibitor Serum (30ml) নিয়মিত ব্যবহারে লোমের বৃদ্ধি কমিয়ে দীর্ঘস্থায়ী সমাধান দেয়। সঙ্গে ফ্রি Laneige Lip Sleeping Mask।',
  'স্প্রে + সিরাম + ফ্রি লিপ বাম — নারী ও পুরুষ সবার জন্য',
  850, 1250, 0,
  '/assets/lp-combo.jpg',
  '["\/assets\/lp-combo.jpg","\/assets\/lp-silky-spray.jpg","\/assets\/lp-before-after.webp"]',
  100, 5, 1, 400, 'active', 1, 0, CURRENT_TIMESTAMP
);

-- Free delivery, limited to this combo, applied automatically with no coupon to type. Scoping
-- it means the rest of the shop keeps charging delivery as normal.
INSERT OR IGNORE INTO offers (
  code, title, description, discount_type, discount_value, min_subtotal,
  active, usage_limit, auto_apply, product_ids_json, updated_by, updated_at
) VALUES (
  NULL,
  'ফ্রি ডেলিভারি — Silky Beauty Combo',
  'Landing page offer: delivery is waived on the 3-in-1 combo.',
  'free_delivery', 0, 0,
  1, 0, 1,
  (SELECT '[' || id || ']' FROM products WHERE sku = 'RNV-LP-COMBO-01' LIMIT 1),
  'system', CURRENT_TIMESTAMP
);
