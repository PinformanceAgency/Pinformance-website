-- Add an explicit destination URL per product so the content pipeline
-- can use the correct URL instead of deriving it from the product title.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_url text;
