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

## Mettere online il backend (per testare da telefono e in vista dell'NFC)
Il telefono non raggiunge `localhost`: serve il backend **online**. Il repo include un
`Dockerfile` portabile e un `render.yaml` (Blueprint) pronti.

### Opzione A — Render (Blueprint, la più semplice)
1. https://dashboard.render.com → **New → Blueprint** → collega il repo GitHub `tinft`.
2. Render legge `render.yaml` e crea il servizio `tinft-api`. Inserisci i **segreti**:
   - `CHAIN_RPC_URL` = il tuo Alchemy Base Sepolia
   - `CHAIN_PRIVATE_KEY` = chiave **owner** del contratto (deployer)
3. **Deploy**. Apri `https://<tuo-servizio>.onrender.com/test-app.html` (anche dal telefono).

### Opzione B — Docker (qualsiasi host / VPS)
```bash
docker build -t tinft-api .
docker run -p 3001:3001 \
  -e CHAIN_RPC_URL="https://base-sepolia.g.alchemy.com/v2/<API_KEY>" \
  -e CHAIN_PRIVATE_KEY="0x<chiave OWNER>" \
  -e TICKET_ADDRESS="0x87044b22dD89798e2ba15a38454F72AaF3Ec1F37" \
  -e CHAIN_ID=84532 -e SEED_DEMO=1 \
  tinft-api
# → http://<host>:3001/test-app.html
```

> Su Base Sepolia la `CHAIN_PRIVATE_KEY` è una chiave usa-e-getta: tienila solo nei
> **secret** dell'host, mai nel repo. Per la mainnet servirà un secret manager / multisig.

## Pagamenti con Stripe (modalità TEST)
Nella test-app spunta **“Paga con Stripe (test mode)”**: l'ordine usa `/orders/:id/checkout`
(apre Stripe Checkout), e al pagamento Stripe chiama il webhook `/webhooks/psp` che paga
l'ordine e **conia l'NFT**. Carta di test: `4242 4242 4242 4242`, scadenza futura, CVC qualsiasi.

Richiede il **backend online** (Stripe deve raggiungere il webhook) + queste env (chiavi **Test**):
1. Stripe → **Developers → API keys** (toggle **Test mode**): copia `STRIPE_SECRET_KEY` (`sk_test_…`).
2. Stripe → **Developers → Webhooks → Add endpoint**: URL `https://<host>/webhooks/psp`,
   eventi `checkout.session.completed` e `payment_intent.succeeded`; copia il **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
3. Imposta `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` come secret dell'host (su Render: sono già nel blueprint, `sync:false`).

I redirect post-pagamento puntano da soli alla test-app (su Render via `RENDER_EXTERNAL_URL`);
puoi forzarli con `CHECKOUT_SUCCESS_URL` / `CHECKOUT_CANCEL_URL`. Nessun denaro reale in test mode.

## NFC (mobile) — nota
La validazione provata qui è via **token rotante** (lo stesso dato che l'NFC/QR trasporta). L'NFC
"vero" è una feature dell'app mobile (`apps/mobile`): su **Android** è fattibile via HCE; su **iPhone**
l'emulazione tipo-carta (HCE) è limitata da Apple (CoreNFC legge NDEF; per i pass spesso si usa Apple
Wallet/PassKit). Richiede **dev build su dispositivo** + backend online. È un passo a sé (Fase mobile).
