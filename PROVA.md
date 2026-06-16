# PROVA — come testare Sito e App PRIMA di renderli reali

Questo kit ti fa provare **tutto in locale, in modalità prova**. **Niente diventa reale:**
- **pagamenti**: provider finto (nessun addebito); Stripe si attiva solo con le tue chiavi.
- **blockchain**: mint finto (nessuna transazione su Base); l'on-chain si attiva solo con RPC+chiave.
- **identità/OTP**: il codice email è mostrato a schermo/log (nessuna email/SMS reale).
- **dati**: mondo demo in memoria o su file locale (`.tinft-data.json`).

**Account demo** (password `demo123`): `org@tinft.io` (organizzatore) · `cli@tinft.io` · `cli2@tinft.io`.
**Validatore in app**: PIN `1234`.

---

## A) Sito in DEMO offline — zero installazione (per vedere UI/UX)
Apri nel browser il file **`apps/web/index.html`** (doppio clic) e scegli **Sito / Web App / Console**.
Se il backend non è in esecuzione, le pagine usano **dati finti** e restano cliccabili.
> Ideale per dare un'occhiata veloce all'interfaccia senza installare nulla.

## B) Tutto reale‑ma‑locale — consigliato (per provare i FLUSSI veri)
Prerequisiti: **Node 20+** e **pnpm** (`npm i -g pnpm`).
```bash
cd services/api
pnpm install
pnpm dev          # → http://localhost:3001
```
Apri **http://localhost:3001** (Launcher con le 3 superfici). Cosa provare:
- **Web App** (`/app-live.html`): login `cli@tinft.io` → compra un biglietto (ordine → "paga", simulato) → apri il biglietto e guarda il **QR che ruota** (~30s) → mettilo in **vendita** sul mercato.
- **Console** (`/console.html`): login `org@tinft.io` → vedi evento, incassi, validazioni.
- **API/Docs**: **http://localhost:3001/docs** (Swagger UI) per provare le chiamate; `/health`, `/ready`, `/metrics`.
- I dati restano dopo il riavvio (file `.tinft-data.json`). Nessun database richiesto.

Vuoi anche la **persistenza su PostgreSQL** (opzionale)? `docker compose up -d db`, poi
`DATABASE_URL=postgresql://tinft:tinft@localhost:5432/tinft pnpm prisma:deploy && DATABASE_URL=… pnpm dev`.

## C) App mobile (Expo React Native)
Prerequisiti: **Node 20+**, **Expo** (`npm i -g expo`), l'app **Expo Go** sul telefono.
```bash
cd apps/mobile
npm install
npx expo start        # inquadra il QR con Expo Go (stesso Wi‑Fi del PC)
```
- Con **Expo Go** provi **login** e il **QR rotante** del biglietto (lato cliente).
- Per **scansione QR** e **NFC** servono i moduli nativi → **dev build**:
  `npx expo run:android` (o `npx expo run:ios`).
- In `apps/mobile/src/config.ts` imposta **`API_BASE`** all'**IP LAN** del PC che fa girare il punto **B**
  (es. `http://192.168.1.50:3001`), così l'app parla col tuo backend locale.

Flusso da provare (con B in esecuzione):
1. Cliente: login `cli@tinft.io` → apri un biglietto → il QR ruota (~30s).
2. Validatore (PIN `1234`): **scansiona** il QR → **VALID**; riscansiona → **DUPLICATE**.
3. Screenshot di un QR vecchio → **SCREENSHOT**; biglietto in vendita → **ESCROW**.

---

## Cosa serve per "farle diventare reali" (NON incluso qui)
- **Stripe**: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` → pagamenti veri.
- **Base (L2)**: deploy contratti con una chiave testnet finanziata (`./scripts/deploy-base-sepolia.sh`,
  guida in `docs/DEPLOY-BASE-SEPOLIA.md`) + `CHAIN_RPC_URL`/`CHAIN_PRIVATE_KEY`/`TICKET_ADDRESS` → mint on‑chain reale.
- **SPID** reale e invio email/SMS.

Finché non imposti queste chiavi, **resta tutto in prova**: puoi cliccare, comprare, validare e rivendere senza alcuna conseguenza reale.
```bash
# verifica rapida che gira (con B avviato):
curl localhost:3001/health      # {"status":"ok"}
```
