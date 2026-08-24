-- CreateTable
CREATE TABLE "trusted_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "label" VARCHAR(200),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trusted_devices_token_hash_key" ON "trusted_devices"("token_hash");

-- CreateIndex
CREATE INDEX "trusted_devices_user_id_expires_at_idx" ON "trusted_devices"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "trusted_devices_expires_at_idx" ON "trusted_devices"("expires_at");

-- AddForeignKey
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
