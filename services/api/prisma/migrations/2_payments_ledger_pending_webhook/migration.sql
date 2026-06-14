-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PRIMARY', 'SECONDARY', 'EXIT_FEE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- DropTable
DROP TABLE "EmailVerification";

-- CreateTable
CREATE TABLE "PendingRegistration" (
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "cf" TEXT NOT NULL,
    "dateOfBirth" TEXT,
    "placeOfBirth" TEXT,
    "gender" TEXT,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "province" TEXT,
    "phone" TEXT,
    "username" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventId" TEXT,
    "ticketId" TEXT,
    "providerRef" TEXT NOT NULL,
    "ticketMintedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformLedger" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "presaleCommissionCents" INTEGER NOT NULL DEFAULT 0,
    "royaltyTinftCents" INTEGER NOT NULL DEFAULT 0,
    "royaltyOrganizerCents" INTEGER NOT NULL DEFAULT 0,
    "exitFeeCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlatformLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- CreateIndex
CREATE INDEX "Payment_accountId_idx" ON "Payment"("accountId");

