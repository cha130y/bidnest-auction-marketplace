-- USR-001/CART-004 — split the profile's shipping address into the same six
-- fields checkout uses, so one can prefill the other without a parser between.
--
-- Written by hand rather than generated. `prisma migrate dev` renders this as
-- DROP COLUMN + ADD COLUMN, which would throw away every address the team has
-- already saved. The UPDATE below has to run while both sets of columns exist.

-- 1. The new columns. Names and widths are copied from `order_addresses`
--    exactly, so an address saved here can always be sent to checkout.
ALTER TABLE "user_profiles"
  ADD COLUMN "recipient_name" VARCHAR(150),
  ADD COLUMN "line1"          VARCHAR(200),
  ADD COLUMN "line2"          VARCHAR(200),
  ADD COLUMN "city"           VARCHAR(100),
  ADD COLUMN "postal_code"    VARCHAR(20);

-- 2. Carry the old values across.
--
--    `default_shipping_address` was one free-text blob, so it becomes line1
--    whole. Splitting it into line1/city/postal_code would mean guessing at a
--    format nobody was ever asked to follow — better a first line the owner
--    can correct than three fields confidently filled in wrong.
--
--    LEFT() is not decoration: both source columns are TEXT and both targets
--    are narrower VARCHAR. Without it a single over-long row fails the whole
--    migration.
UPDATE "user_profiles"
SET "line1" = LEFT("default_shipping_address", 200),
    "city"  = LEFT("location", 100);

-- 3. Only now is it safe to drop the originals.
ALTER TABLE "user_profiles"
  DROP COLUMN "location",
  DROP COLUMN "default_shipping_address";