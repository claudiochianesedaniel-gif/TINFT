-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'BURNED';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "isSpecial" BOOLEAN NOT NULL DEFAULT false;
