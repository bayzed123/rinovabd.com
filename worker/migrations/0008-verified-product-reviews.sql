-- Rinova BD: verified buyer product ratings and reviews
CREATE TABLE IF NOT EXISTS product_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_id INTEGER REFERENCES customers(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  verified_purchase INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, order_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_status ON product_reviews(product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_reviews_status ON product_reviews(status, created_at DESC);

-- Rebuild product aggregates from approved reviews whenever moderation changes a review.
