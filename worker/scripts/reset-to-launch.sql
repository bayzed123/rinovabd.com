-- Clears every product, order and test artifact so the shop can launch at zero, while keeping
-- exactly what the live ad depends on: the Silky Beauty Combo product and the free-delivery
-- offer that prices it.
--
-- Nothing here is guessed at — every table this touches was read from worker/migrations/ before
-- being listed. Run only through the gated "Reset store data" GitHub Action, never by hand
-- against production: that workflow exports a full backup first and requires a typed
-- confirmation, because this has no undo.
--
-- What this deliberately leaves alone: store settings, delivery zones, payment methods, admin
-- and staff logins, categories, blog/CMS content, marketing banners, newsletter signups, chat
-- history and supplier/purchase/expense records. None of that is "product or order" data, and
-- clearing it would either lock the owner out or throw away configuration they still need.

-- ---- Order-adjacent history, deleted before the orders they point at -------------------------
DELETE FROM product_reviews;
DELETE FROM returns;
DELETE FROM order_status_history;
DELETE FROM order_items;
DELETE FROM incomplete_checkouts;
DELETE FROM pos_sale_items;
DELETE FROM pos_sales;
DELETE FROM stock_movements;

-- ---- Orders ------------------------------------------------------------------------------------
DELETE FROM orders;

-- ---- Customer accounts (answered: clear) ------------------------------------------------------
DELETE FROM customer_sessions;
DELETE FROM customers;

-- ---- Campaign Studio pages (answered: clear) ---------------------------------------------------
DELETE FROM campaign_pages;

-- ---- Products, keeping the one the live ad depends on ------------------------------------------
DELETE FROM product_variants WHERE product_id NOT IN (SELECT id FROM products WHERE sku = 'RNV-LP-COMBO-01');
DELETE FROM products WHERE sku != 'RNV-LP-COMBO-01';

-- ---- Coupons and offers (answered: clear), except the one the kept product needs ---------------
-- The Silky Combo landing page promises free delivery, and that promise is a real offer, not
-- wording (see worker/migrations/0023). Deleting it out from under the surviving product would
-- start charging delivery on a page that still says it's free.
DELETE FROM offers
WHERE id NOT IN (
  SELECT o.id FROM offers o
  WHERE EXISTS (
    SELECT 1 FROM json_each(o.product_ids_json)
    WHERE value = (SELECT id FROM products WHERE sku = 'RNV-LP-COMBO-01')
  )
);

-- ---- Notifications about the test data just removed --------------------------------------------
DELETE FROM admin_notifications;

-- ---- Restart the counters that fed invoice numbers and other visible IDs -----------------------
-- Products and offers keep one row each, so their next id already continues correctly on its
-- own — resetting those sequences would collide with the row still in the table.
DELETE FROM sqlite_sequence WHERE name IN (
  'orders', 'order_items', 'order_status_history', 'returns', 'product_reviews',
  'incomplete_checkouts', 'pos_sales', 'pos_sale_items', 'stock_movements',
  'customers', 'customer_sessions', 'campaign_pages', 'admin_notifications'
);

-- ---- What the store looks like afterwards -------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM orders) AS orders,
  (SELECT COUNT(*) FROM products) AS products,
  (SELECT sku FROM products) AS surviving_product_sku,
  (SELECT COUNT(*) FROM customers) AS customers,
  (SELECT COUNT(*) FROM campaign_pages) AS campaigns,
  (SELECT COUNT(*) FROM offers) AS offers,
  (SELECT title FROM offers) AS surviving_offer_title,
  (SELECT COUNT(*) FROM product_reviews) AS reviews;
