-- Rinova BD: multiple product images and direct product media
-- Apply once to the live D1 database before deploying code that selects media_json.
ALTER TABLE products ADD COLUMN media_json TEXT NOT NULL DEFAULT '[]';

-- Keep every existing primary image available in the new gallery without relying on JSON SQL functions.
UPDATE products
SET media_json = CASE
  WHEN image_url IS NOT NULL AND TRIM(image_url) <> ''
    THEN '[{"type":"image","url":"' || REPLACE(REPLACE(REPLACE(image_url, '\\', '\\\\'), '"', '\\"'), CHAR(10), '') || '"}]'
  ELSE '[]'
END
WHERE media_json = '[]' AND image_url IS NOT NULL AND TRIM(image_url) <> '';

-- Migration marker is intentionally omitted because this repository uses explicit deployment tracking.
