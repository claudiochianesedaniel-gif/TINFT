-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "revoked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "refundedAt" INTEGER;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "payoutSettled" BOOLEAN NOT NULL DEFAULT false;
