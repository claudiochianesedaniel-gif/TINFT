# TINFT — TODO list & Checklist di verifica

> Versione testuale del PDF consegnato. Prototipo biglietteria NFT.

## 1 · Stato della verifica
| Componente | Esito |
|---|---|
| Smart contract (Foundry) | ✓ 74/74 (7 fuzz + 2 invarianti) · fmt+build ok |
| Backend (vitest) | ✓ 147 pass + 3 skip (DB) · tsc pulito |
| Validazione firmata (backbone app) | ✓ token QR rotante ~30s + /validate/scan (5 esiti) |
| App nativa (Expo React Native) | ⚙ scaffold buildabile (apps/mobile) · test su device |
| Frontend (render harness) | ✓ 5/5 (sito, web app, console, registrazione, demo) |
| Live — store in-memory (default) | ✓ e2e 27/27 · launcher `/` e sito serviti |
| Live — store PostgreSQL | ✓ e2e 27/27 · dati persistiti |
| Pagamenti Stripe | ✓ integrato (FakeProvider + IT) · pronto con le chiavi |
| Mint on-chain (anvil + cast) | ✓ ownerOf=wallet compratore · TicketMinted · receipt ok |
| Schema Prisma + migrazioni | ✓ valido (0_init, 1_add_password_hash, 2_payments…) |
| CI GitHub Actions | ✓ verde (Contracts + Backend) |

## 2 · TODO list
### ✓ Fatto
- Smart contract M1–M5 (ERC-721 + 721C, fee di rivendita 1% (attivo→TINFT, post-evento 0,5/0,5), escrow, tetto +5%, max 3/evento via hash CF, export 25%/enforced) — 74 test, inclusi **fuzz** (royalty/fee/EIP-2981/tetto/anti-bagarino) e **invarianti stateful** (conservazione del valore nello split: 128k chiamate, 0 revert).
- Backend v2: identità (hash CF) + OTP email; club + dati societari + KYC; eventi + tier; ordini con **prevendita 10%**; mercato secondario; validazione; contenuti; console org + piattaforma.
- Auth & sessioni: JWT, scrypt, guardie ruolo/proprietà, rate-limit, security headers, body limit.
- Persistenza: in-memory (snapshot file, default) **e** PostgreSQL relazionale (Prisma) — pagamenti/ledger/registrazioni/webhook su tabelle.
- Pagamenti Stripe end-to-end (checkout ordine → webhook → mint, idempotente).
- Mint on-chain reale (ViemChain) — verificato su anvil.
- Frontend v2 (Quicksand/#4472c4): Sito, Web App, Console + launcher; fallback demo offline; un solo server serve API + pagine; seed demo.
- Backbone validazione: token QR firmato (rotante ~30s) + `/validate/scan` con i 5 esiti (103 test).
- App nativa **Expo React Native** (`apps/mobile`): Validatore (scan QR + NFC Android), Cliente (QR rotante), coda offline + sync — codice reale e buildabile.
- Hardening API: **validazione schema input** (JSON schema su tutte le route di scrittura → body/param malformati = `400 VALIDATION`, non 500), endpoint `/ready` (readiness non bloccante), logging strutturato (pino) — +13 test.
- **Affidabilità pagamento→mint**: `payOrder` **riprendibile, idempotente e serializzato** — un ordine *pagato* non va mai perso, evaso due volte, né corrotto da consegne concorrenti. Riprende dai biglietti mancanti se il mint fallisce a metà (`sold` non raddoppia); l'accredito (biglietti+ledger+goodwill+stato PAID) è **atomico** via `store.settleOrder` (transazione + lock di riga `FOR UPDATE` su Postgres); mutex per-ordine in-processo serializza le consegne concorrenti; webhook PSP marcato processato **solo dopo il successo** (la redelivery ritenta invece di scartare). +6 test (incl. concorrenza in-memory e `settleOrder` concorrente verificato su Postgres reale).
- **Rimborsi & payout venditore**: rimborso di un ordine pagato (storna commissione + goodwill e **revoca i biglietti** → non più validi al varco né rivendibili; via webhook PSP `payment_refunded` o route platform), annullamento dei checkout falliti (`payment_failed` → ordine CANCELLED), e tracciamento dell'**incasso dovuto al venditore** sul secondario (lista payout pendenti + liquidazione). +10 test, verificati anche su Postgres reale.
- **Robustezza di produzione**: validazione della configurazione al boot (fail-fast su env incoerenti — Stripe senza webhook secret, config on-chain parziale, indirizzi malformati), **arresto pulito** su SIGTERM/SIGINT (drena le richieste in corso e chiude la connessione DB), endpoint **`/metrics`** (Prometheus) e **request-id** propagato nei log e rimandato al client. +8 test.
- **E2E + documentazione API**: test black-box dell'intero percorso via HTTP (acquisto → checkout PSP → validazione QR → rivendita → payout → rimborso) come documentazione vivente; spec **OpenAPI 3.1** su `/openapi.json` e **Swagger UI** su `/docs`. +2 test.

### ☐ Da fare (per beta/pilota)
- SPID reale (OIDC) con aggregatore accreditato — esterno (settimane).
- **Build + test dell'app su dispositivo reale** (Expo dev build) + tap NFC via HCE Android (opzionale).
- Wallet custodial reale (ERC-4337) + paymaster + recovery SPID.
- Deploy contratti su Base Sepolia: tooling **chiavi in mano** pronto e provato su anvil (`scripts/deploy-base-sepolia.sh` + `docs/DEPLOY-BASE-SEPOLIA.md`) — manca solo lanciarlo con una **chiave testnet finanziata**. Audit prima del mainnet.
- Payout venditori: **politica** di liquidazione (timing/hold) + **KYC venditore** + bonifici reali. Le meccaniche (registro incasso dovuto, lista pendenti, liquidazione, rimborsi/chargeback con revoca biglietto) sono già fatte.
- Fidelity on-chain (oggi non sul percorso PG) + edge case.
- GDPR/legale/fiscale (custodia, anti-bagarinaggio, IVA), accessibilità AgID.
- Monitoring/alerting **esterno**: dashboard (Grafana su `/metrics`) + alerting, e **secret manager**. L'app è già pronta: logging strutturato, `/ready`, `/metrics`, request-id, validazione config al boot.
- Scale-out multi-istanza: per serializzare anche il *mint* tra processi diversi serve un lock distribuito (advisory lock Postgres / Redis) all'avvio di `payOrder`. Oggi (singola istanza) il mutex per-ordine serializza tutto; l'accredito è già esatto cross-processo grazie al lock di riga in `settleOrder`.

## 3 · Checklist di verifica (riproducibile)
**A · Avvio** — `pnpm install` (root); `cd services/api && pnpm dev` → http://localhost:3001 (store: in-memory).
- [ ] `/` mostra il launcher con le 3 superfici
- [ ] login demo (password `demo123`): `org@tinft.io` · `cli@tinft.io` · `cli2@tinft.io`
- [ ] Sito / Web App / Console si caricano (online o demo offline)

**B · Contratti** — `cd contracts && forge test` (74 passed, incl. fuzz+invarianti) · `forge fmt --check`.

**C · Backend** — `cd services/api && pnpm test` (147 passed, +3 skip senza DB) · `pnpm typecheck`.

**D · Postgres** — `docker compose up -d db`; `export DATABASE_URL=postgresql://tinft:tinft@localhost:5432/tinft`; `pnpm prisma:deploy`; `DATABASE_URL=$DATABASE_URL pnpm dev` (→ store: PostgreSQL); `DATABASE_URL=$DATABASE_URL pnpm test src/repo/prisma-store.it.test.ts`.
- [ ] i dati restano dopo il riavvio (tabelle Account/Event/Ticket/Order/Payment/Ledger)

**E · Stripe (con chiavi)** — `.env`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (+ `CHECKOUT_SUCCESS_URL`/`CHECKOUT_CANCEL_URL`).
- [ ] `POST /orders/:id/checkout` → checkoutUrl; webhook → `POST /webhooks/psp` → ordine PAID + biglietti coniati

**F · On-chain (anvil o Base Sepolia)** — `./scripts/deploy-base-sepolia.sh` (runbook: `docs/DEPLOY-BASE-SEPOLIA.md`); incolla nel backend il blocco stampato `CHAIN_RPC_URL`/`CHAIN_PRIVATE_KEY`(owner)/`TICKET_ADDRESS`.
- [ ] paga un ordine → ticket con `txHash`; `cast call <addr> 'ownerOf(uint256)(address)' <id>` = wallet compratore

**G · CI** — `git push` → GitHub Actions: `Contracts (Foundry)` + `Backend (API)` verdi.

**H · App nativa (su dispositivo)** — `cd apps/mobile && npm install`; serve un **dev build** (camera/NFC nativi, Expo Go non basta): `npx expo run:android` / `npx expo run:ios` (o `eas build --profile development`). Imposta `API_BASE` all'IP LAN del backend.
- [ ] login `cli@tinft.io` → apri un biglietto → il QR ruota (~30s)
- [ ] login `org@tinft.io` (Validatore, PIN 1234) → scansiona il QR → VALID; riscansiona → DUPLICATE
- [ ] screenshot di un QR vecchio → SCREENSHOT; biglietto in vendita → ESCROW
- [ ] (Android) "Leggi NFC" valida un tag; (iOS) mostra "usa il QR"

## 4 · Regole economiche
- **Prevendita 10%** sul PRIMO acquisto → solo TINFT (a carico del compratore).
- Rivendita: **fee 1%** sul prezzo originale — biglietto **attivo** → tutta a **TINFT**; **mero NFT** post-evento → 0,5% TINFT + 0,5% organizzatore. **Tetto +5%**. **Burn all'ingresso** (Signature 1/1 esenti).
- **Tetto +5%** sul prezzo pagato · **max 3 biglietti/evento** per identità (hash CF).
- Export libero: **fee d'uscita 25%** (oppure enforced: royalty per sempre).

Account demo (password `demo123`): `org@tinft.io` (organizzatore) · `cli@tinft.io` · `cli2@tinft.io`.
