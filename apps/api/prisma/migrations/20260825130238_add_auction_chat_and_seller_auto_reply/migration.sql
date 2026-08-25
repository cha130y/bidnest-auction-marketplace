-- DropForeignKey
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_product_id_fkey";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "auction_id" UUID,
ALTER COLUMN "product_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auto_reply_message" VARCHAR(500);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_auction_id_buyer_id_seller_id_key" ON "conversations"("auction_id", "buyer_id", "seller_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

