-- Let an order line be a won auction as well as a product.
--
-- An auction lot is a row in `auctions`, never in `products`, so with
-- `product_id` NOT NULL a winner could not be billed at all — the only way
-- through was a shadow product row, which would then show up in the catalogue.
--
-- Two nullable FKs rather than one polymorphic column, the same shape
-- `conversations` already uses for "a product or an auction, never both".

-- Existing rows all have a product, so relaxing this takes nothing away.
ALTER TABLE "order_items" ALTER COLUMN "product_id" DROP NOT NULL;

ALTER TABLE "order_items" ADD COLUMN "auction_id" UUID;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_auction_id_fkey"
  FOREIGN KEY ("auction_id") REFERENCES "auctions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- One paid line per lot. Postgres treats NULLs as distinct in a unique index,
-- so this constrains auction lines only and every product line stays free of
-- it. This is what stops a winner paying twice by opening checkout again.
CREATE UNIQUE INDEX "order_items_auction_id_key" ON "order_items"("auction_id");