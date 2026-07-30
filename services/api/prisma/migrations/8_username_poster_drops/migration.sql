-- Username pubblico (@handle): etichetta con cui gli utenti si cercano, si
-- regalano biglietti e vengono verificati a mano al varco. Univoco.
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

-- Locandina evento inline (data URL, limite applicativo 2 MB) + Signature drops
-- a sorpresa (1° acquirente, metà capienza, ultimo biglietto).
ALTER TABLE "Event" ADD COLUMN     "signatureDrops" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN     "posterDataUrl" TEXT;
