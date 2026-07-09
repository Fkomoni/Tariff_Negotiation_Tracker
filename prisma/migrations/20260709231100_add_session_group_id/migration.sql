-- AlterTable
ALTER TABLE "NegotiationCase" ADD COLUMN     "sessionGroupId" TEXT;

-- CreateIndex
CREATE INDEX "NegotiationCase_sessionGroupId_idx" ON "NegotiationCase"("sessionGroupId");
