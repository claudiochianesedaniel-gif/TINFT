-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "appleSub" TEXT,
ADD COLUMN     "googleSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Account_appleSub_key" ON "Account"("appleSub");

-- CreateIndex
CREATE UNIQUE INDEX "Account_googleSub_key" ON "Account"("googleSub");
