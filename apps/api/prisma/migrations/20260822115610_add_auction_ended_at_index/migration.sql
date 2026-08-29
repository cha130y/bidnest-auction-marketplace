-- CreateIndex
CREATE INDEX "auctions_status_ended_at_idx" ON "auctions"("status", "ended_at");
