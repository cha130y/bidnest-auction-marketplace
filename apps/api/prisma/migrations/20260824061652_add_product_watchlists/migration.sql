-- CreateTable
CREATE TABLE "product_watchlists" (
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_watchlists_pkey" PRIMARY KEY ("user_id","product_id")
);

-- CreateIndex
CREATE INDEX "product_watchlists_product_id_created_at_idx" ON "product_watchlists"("product_id", "created_at");

-- AddForeignKey
ALTER TABLE "product_watchlists" ADD CONSTRAINT "product_watchlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_watchlists" ADD CONSTRAINT "product_watchlists_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
