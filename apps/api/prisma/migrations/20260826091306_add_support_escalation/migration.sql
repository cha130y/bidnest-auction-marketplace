-- CreateEnum
CREATE TYPE "SupportSessionStatus" AS ENUM ('AI_ONLY', 'ESCALATED', 'RESOLVED');

-- AlterEnum
ALTER TYPE "ChatRole" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "support_chat_sessions" ADD COLUMN     "assigned_admin_id" UUID,
ADD COLUMN     "status" "SupportSessionStatus" NOT NULL DEFAULT 'AI_ONLY';

-- CreateIndex
CREATE INDEX "support_chat_sessions_status_created_at_idx" ON "support_chat_sessions"("status", "created_at");

-- AddForeignKey
ALTER TABLE "support_chat_sessions" ADD CONSTRAINT "support_chat_sessions_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
