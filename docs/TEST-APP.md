# TINFT — Test App (struttura end-to-end)

Pagina di test **autosufficiente** che prova, contro l'API reale, l'intera struttura:

**registrazione → evento → ordine (prezzo + prevendita 10%) → pagamento → MINT NFT on-chain → biglietto → token d'accesso (QR/NFC) → validazione (VALID poi DUPLICATE).**

File: `apps/web/test-app.html` (servito dal backend su `/test-app.html`).

## Cosa dimostra
- **Pagamenti**: ordine → `/orders/:id/pay` (provider di test integrato; per Stripe vero in modalità test vedi sotto).
- **Mint NFT reale**: il pagamento conia su `TinftTicket` (Base Sepolia) → `tokenId` + `txHash`, con link a Basescan.
- **Validazione**: token d'accesso **rotante** (il trasporto NFC/QR porta proprio questo token) → primo scan `VALID`, ri-scan `DUPLICATE` (anti-screenshot/anti-duplicato).

> Provato end-to-end su Base Sepolia: pagamento → `PAID` → mint → `ownerOf(tokenId)` = wallet del compratore.

## Avvio in locale
```bash
# dalla root del repo
pnpm install

cd services/api
export CHAIN_RPC_URL="https://base-sepolia.g.alchemy.com/v2/<API_KEY>"  # Alchemy Base Sepolia
export CHAIN_PRIVATE_KEY="0x<chiave OWNER del contratto>"               # = deployer (mint è onlyOwner)
export TICKET_ADDRESS="0x87044b22dD89798e2ba15a38454F72AaF3Ec1F37"      # TinftTicket su Base Sepolia
export CHAIN_ID=84532                                                    # Base Sepolia
export SEED_DEMO=0
pnpm dev    # → http://localhost:3001
```
Apri **http://localhost:3001/test-app.html** e premi **“Esegui tutto il flusso”**.
Per vedere l'NFT nella tua MetaMask, incolla il tuo indirizzo nel campo *Wallet destinatario*.

> La `CHAIN_PRIVATE_KEY` è la chiave **owner** dei contratti (il deployer). Su Base Sepolia è una
> chiave usa-e-getta: tienila fuori dal repo. Senza di essa il backend usa il mint *fake*.

## Per testare da telefono (e in vista dell'NFC)
Il telefono non raggiunge `localhost`: serve il backend **online**. Passi:
1. Pubblica `services/api` su un host Node (Render/Railway/Fly/…); imposta le stesse env (`CHAIN_*`, `TICKET_ADDRESS`, `CHAIN_ID`) come **secret**.
2. Apri `https://<tuo-host>/test-app.html` dal telefono (oppure apri la pagina e imposta *API base* sull'URL dell'host).

## Pagamenti con Stripe (modalità test, opzionale)
Per usare Stripe vero in **test mode** al posto del provider integrato:
```bash
export STRIPE_SECRET_KEY=sk_test_...
export STRIPE_WEBHOOK_SECRET=whsec_...
```
(usare carte di test Stripe; nessun denaro reale). Il flusso ordine→checkout→webhook→mint resta lo stesso.

## NFC (mobile) — nota
La validazione provata qui è via **token rotante** (lo stesso dato che l'NFC/QR trasporta). L'NFC
"vero" è una feature dell'app mobile (`apps/mobile`): su **Android** è fattibile via HCE; su **iPhone**
l'emulazione tipo-carta (HCE) è limitata da Apple (CoreNFC legge NDEF; per i pass spesso si usa Apple
Wallet/PassKit). Richiede **dev build su dispositivo** + backend online. È un passo a sé (Fase mobile).
