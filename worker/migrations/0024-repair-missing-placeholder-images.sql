-- Repair rows pointing at an image file that was never shipped.
--
-- `/assets/clothing-products.jpg` was seeded with the Clothing category in
-- migration 0016 but no such file exists in web/assets, so the category tile
-- rendered as a broken image on the storefront. `/assets/beauty-flatlay.jpg`
-- is the storefront's own fallback image (web/app.js, web/product.js) and is
-- now shipped alongside it, so point the orphaned rows at that instead.
--
-- Only rows still holding the missing path are touched: an owner who has since
-- uploaded their own photo keeps it.
--
-- assets-scan: allow-missing clothing-products.jpg
-- (the repair has to name the broken path; tests/suites/assets.mjs reads that directive so it
--  does not report this file as a live reference to a picture that is not there)

UPDATE categories
   SET image_url = '/assets/beauty-flatlay.jpg'
 WHERE image_url = '/assets/clothing-products.jpg';

UPDATE products
   SET image_url = '/assets/beauty-flatlay.jpg'
 WHERE image_url = '/assets/clothing-products.jpg';
