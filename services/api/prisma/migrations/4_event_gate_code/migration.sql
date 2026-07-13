-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "gateCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_gateCode_key" ON "Event"("gateCode");
