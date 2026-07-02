# TINFT — TODO per Claude Code (go-live)

> Da incollare/lasciare nella root del repo `claudiochianesedaniel-gif/TINFT`.
> Obiettivo: portare TINFT da prototipo funzionante a prodotto vendibile.
> Vincolo di prodotto invariante: **ogni processo (acquisto, validazione, trasferimento, controllo accessi) avviene SOLO da smartphone con l'app TINFT. Nessun hardware esterno** (lettori, tornelli, scanner dedicati).

---

## Prompt iniziale da dare a Claude Code

> Sei nel monorepo TINFT. Leggi `DEV-HANDOFF.md`, `NEXT-SESSION.md`, `docs/` e questo file.
> Lavora una FASE alla volta, in ordine. Per ogni task: apri i file indicati, fai la modifica, aggiungi/aggiorna i test, esegui la suite, e fermati a riportarmi cosa hai cambiato prima di passare alla fase successiva.
> Regole ferree: **non committare mai segreti** (chiavi private, API key, RPC con key) — vanno solo in env/Render dashboard. Non rompere i test esistenti (`pnpm test` in `services/api`, `forge test` in `contracts`). Mantieni **sito↔app speculari** e la validazione **solo-app**.

---

## Come lavorare (comandi)

- Backend: `cd services/api && pnpm install && pnpm test` (atteso ~156 test) · `pnpm typecheck` · `pnpm dev` → http://localhost:3001
- Contratti: `cd contracts && forge test` (atteso 74/74, incl. fuzz + invarianti) · `forge fmt --check`
- Postgres (integrazione): `DATABASE_URL=… pnpm prisma:deploy && DATABASE_URL=… pnpm test src/repo/prisma-store.it.test.ts`
- OpenAPI live: `/openapi.json` + `/docs`. Health: `/ready`. Metriche: `/metrics`.

---

## ✅ GIÀ FATTO — NON rifare (verifica soltanto)

- Contratti Solidity (Foundry): `TinftTicket` (ERC-721 + 721C, EIP-2981, anti-bagarino, export), `TinftEscrow` (tetto +10%), `TinftRoyaltySplit` (0,5/0,5), `TinftTransferValidator`. **74/74 test** (fuzz + invarianti). **Già deployati su Base Sepolia** (`TICKET_ADDRESS=0x87044b22dD89798e2ba15a38454F72AaF3Ec1F37`, `CHAIN_ID=84532`).
- Backend Fastify+TS: auth (JWT, scrypt, ruoli, rate-limit, security headers), eventi+tier, ordini con **prevendita 10%**, mercato (royalty 1%, tetto +10%, max 3/evento).
- **Access-token rotante** (`src/access/access-token.ts`) + **`/validate/scan`** con 5 esiti (VALID/DUPLICATE/SCREENSHOT/ESCROW/FAKE) — la validazione sicura server-side **esiste già**.
- **Pagamento→mint** idempotente/riprendibile, `settleOrder` atomico, webhook ritentabile. Rimborsi/chargeback + payout venditore (lista/liquidazione).
- Stripe integrato (Fake + reale con chiavi), mint on-chain reale (Viem) verificato su anvil.
- OTP registrazione via **Resend** (`src/notifications/email.ts`). **P.IVA + fatturazione OBBLIGATORIE** alla creazione club.
- Persistenza **PostgreSQL** (Prisma) + in-memory. `/metrics`, `/ready`, shutdown pulito, OpenAPI + E2E.

---

## FASE 0 — Decisioni di allineamento (bloccante, veloce)

- [ ] **Scegliere il frontend canonico.** Oggi esistono due superfici: (a) i prototipi Design Component `TINFT - Prototipo App.dc.html` / `TINFT - Sito Web.dc.html` (già collegati all'API live, usati per la demo in `deploy/`), e (b) `apps/web/*` nel repo (mock offline). **Decidere quale diventa il prodotto** e deprecare l'altro. Consiglio: partire da (a) perché è già wired all'API reale.
- [ ] **Confermare l'ambiente di destinazione** (dominio, hosting API, DB gestito) — vedi FASE 7.

---

## FASE 1 — `gateCode` come campo reale (rimuove il workaround)

**Problema:** nel prototipo il codice varco è incastonato nel campo `venue` come `|VC:CODICE|` perché il backend scarta i campi custom su `POST /events`. Va reso un campo di prima classe.

- [x] **Prisma:** `gateCode String? @unique` sul modello `Event`. Migration `4_event_gate_code` in `services/api/prisma/migrations/`.
- [x] **Dominio:** `src/domain/models.ts` (campo `gateCode`) + `src/domain/rules.ts` (`generateGateCode` dal titolo, `normalizeGateCode`); generato se non fornito; unicità garantita dal servizio (`uniqueGateCode`) + vincolo unique in persistenza.
- [x] **HTTP:** `POST /events` accetta `gateCode` (opzionale, normalizzato, 409 `GATE_CODE_TAKEN` se già in uso); `GET /events` e `GET /events/:id` lo restituiscono; `POST /events/:id/gate-code/rotate` e `/revoke` (solo organizzatore proprietario). OpenAPI aggiornata.
- [x] **Validatore:** `POST /gate/access` {code} (autenticato + rate-limit anti brute-force) risolve il codice nell'evento: lo staff resta agganciato al SOLO evento del codice, revoca → 404. Seed demo: `NOTTE-7K2`, `JAZZ-9R3`, `OPEN-5X1`.
- [ ] **Frontend:** rimuovere l'encoding `|VC:..|` nel `venue` (in `TINFT - Prototipo App.dc.html`: `_orgEmitReal` e il parsing in `_buildEV`); usare il campo `gateCode` reale dall'API. ⚠️ I prototipi wired all'API non sono in questo repo (quelli in `design_handoff_tinft/` sono una versione precedente senza workaround): aggiungere al repo la versione corrente dei `.dc.html` per completare questo punto.
- [x] Test: `src/http/gate-code.http.test.ts` — creazione con/senza gateCode, unicità, normalizzazione, rotate/revoke, aggancio staff, guardie 401/403.

---

## FASE 2 — Validazione: rimuovere il fallback locale (solo-online, server-side)

**Stato:** `/validate/scan` e `/tickets/:id/access-token` esistono e funzionano. Il prototipo li usa, ma tiene ancora un **fallback HMAC locale** (`_localToken`/`_validateToken`, chiave `TINFT-DEMO-KEY-2026`) per i token demo/offline.

- [ ] **Frontend:** in `TINFT - Prototipo App.dc.html`, rendere il varco **solo-online**: il QR è sempre l'access-token del server; lo scan chiama sempre `/validate/scan`. Rimuovere `_localToken`, la verifica HMAC locale e l'anti-doppio in `localStorage`. In assenza di rete → stato "offline, validazione sospesa" (mai un VALID locale). ⚠️ Prototipi wired non in repo (vedi FASE 1): aggiungerli per completare.
- [x] **Backend:** `DUPLICATE` robusto sotto scansioni CONCORRENTI: `validate()` serializzata per biglietto con mutex per-chiave (stesso meccanismo di `payOrder`) — mai due VALID sullo stesso token. Multi-istanza → lock distribuito (FASE 7).
- [x] Test E2E: `src/http/scan.http.test.ts` — 5 esiti coperti + scansioni concorrenti (un solo VALID), bordo finestra di rotazione (exp==now → SCREENSHOT, entro TTL → VALID), token manomesso (payload alterato, firma originale) → FAKE senza consumare l'ingresso.

---

## FASE 3 — Pagamenti reali con Stripe Connect (marketplace)

**Stato:** integrazione Stripe presente (`src/payments/service.ts`, `src/payments/provider.ts`), oggi con **un unico account** e checkout verso un sandbox finto.

**Modello scelto — Stripe Connect (NON un account per evento).** Ogni **organizzatore** collega il proprio account Stripe **una sola volta** (all'onboarding del club, non a ogni evento); poi ogni evento incassa in automatico sul suo conto e TINFT trattiene una **application fee**. TINFT non è merchant of record di ogni transazione.

- [x] **Stripe Connect onboarding** per organizzatore: account connesso (Express) creato alla creazione club (riusato tra i club dello stesso organizzatore; lazy per i club pre-Connect), `stripeAccountId` + `stripeOnboarded` sul club (Prisma, migration `5_club_stripe_connect`). Messa in vendita (create ON_SALE / publish) BLOCCATA se il club non è onboarded (`STRIPE_ONBOARDING_REQUIRED`). Rotte: `POST /clubs/:id/stripe/onboarding-link` e `/refresh`; webhook `account.updated` → aggiorna `stripeOnboarded`.
- [x] **Pagamenti con split**: il checkout ordini passa `application_fee_amount` (= prevendita 10%, resta a TINFT) + `transfer_data.destination` (account del club) in `payment_intent_data`. File: `src/payments/service.ts`, `provider.ts` (ConnectPort + FakeConnect), `stripe.ts`.
- [ ] **Chiavi live** (solo in Render dashboard / secret manager, mai nel repo): `STRIPE_SECRET_KEY=sk_live_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`. Webhook `POST /webhooks/psp` (già pronto). ⚠️ SOLO TITOLARE. Env aggiuntive: `CONNECT_RETURN_URL`, `CONNECT_REFRESH_URL`.
- [ ] **3DS / SCA**: con Stripe Checkout è gestito da Stripe automaticamente quando richiesto; verificare in test-mode con carte 3DS prima del live.
- [ ] **Fatturazione IVA + ricevute**; **rimborsi/chargeback con riconciliazione** (tabelle ledger già presenti). Con Connect gran parte di payout/timing la gestisce Stripe verso l'organizzatore.
- [ ] `CHECKOUT_SUCCESS_URL` / `CHECKOUT_CANCEL_URL` di produzione.
- [x] Test: `src/payments/connect.test.ts` — onboarding (riuso account, lazy), blocco/sblocco pubblicazione via webhook `account.updated` (idempotente), intent di checkout con fee+destinazione, no-split senza club, link/refresh.

> Nota: le chiavi Stripe da procurare sono quelle della **piattaforma TINFT** (una volta). Gli organizzatori NON danno chiavi: fanno l'onboarding Connect guidato dall'app.

---

## FASE 4 — On-chain: mainnet dopo audit

**Stato:** contratti già su Base Sepolia; mint reale via Viem (`src/chain/viem.ts`).

- [ ] **Audit di sicurezza** dei contratti prima della mainnet.
- [ ] **Deploy su Base mainnet** (`CHAIN_ID=8453`): impostare `TINFT_PAYEE` e `ORGANIZER_PAYEE` (diversi tra loro), deploy con `scripts/deploy-base-sepolia.sh` adattato / `contracts/script/Deploy.s.sol`, aggiornare `TICKET_ADDRESS`, `CHAIN_RPC_URL`, `CHAIN_PRIVATE_KEY` (owner) in env.
- [x] Sostituito `referenceToOnchainId` (hash con possibili COLLISIONI tra eventi → limite 3/evento on-chain sbagliato) con un **registro eventi**: `Event.onchainEventId` (colonna già in schema) assegnato UNA volta al primo mint — sequenziale, univoco, immutabile, sotto lock distribuito — e passato a `TinftTicket.mint` da entrambi i percorsi (ordini e webhook PSP). Test `src/chain/onchain-registry.test.ts`. Da riverificare su anvil/Base Sepolia al prossimo deploy (Foundry non disponibile in questo ambiente).
- [ ] Verifica: `cast call <ticket> 'ownerOf(uint256)(address)' <tokenId>` = wallet compratore.

---

## FASE 5 — Login Apple/Google + identità/età con SPID

**Decisione:** doppio livello. **Login veloce** con **Sign in with Apple** e **Google Sign-In** (ce l'hanno tutti); **verifica identità ed età (18+)** con **SPID** (che Apple/Google NON danno). Entrambi presenti nel prototipo.

- [x] **Sign in with Apple + Google** (OIDC diretto, zero dipendenze nuove): `POST /auth/oidc` {provider, idToken} → verifica lato server firma RS256 via JWKS (cache 1h + refetch su rotazione chiavi), issuer/audience/scadenza (`src/identity/oidc.ts`); trova per sub → collega per email → crea account CLIENTE; sessione JWT esistente. Campi `appleSub`/`googleSub` su Account (migration `6_account_oidc`). Si accende con `APPLE_CLIENT_ID`/`GOOGLE_CLIENT_ID` (⚠️ titolare: Apple Developer + Google Cloud OAuth); senza → 501. Il login veloce NON verifica identità/età: quella resta a SPID.
- [ ] **SPID reale (OIDC)** al posto di `FakeSpid` in `src/identity/verifier.ts`: aggregatore accreditato AgID; usato per **verifica identità + età 18+** e per rendere il biglietto nominativo. Impostare l'hash CF on-chain via `TinftTicket.setIdentity`. Env: `SPID_OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET`.
- [ ] **Quando richiedere SPID:** al primo acquisto o all'attivazione wallet (non necessariamente al solo login). Decidere con il legale (FASE 10) i casi in cui è obbligatorio. In futuro anche **CIE** come alternativa.
- [ ] **Wallet custodial ERC-4337** + paymaster + recovery (Turnkey/Pimlico; env `TURNKEY_*`, `PIMLICO_API_KEY` già previste). Oggi `walletAddress` opzionale e mint dall'owner.

---

## FASE 6 — Frontend wiring completo & parità

- [ ] Collegare la superficie scelta (FASE 0) all'API reale su **tutti** i flussi: login, ordini, mercato, biglietti, console org, accessi. (Molti già collegati nei prototipi `.dc.html`.)
- [ ] **Fasce prezzo (tier):** assicurarsi che creazione e visualizzazione usino `/events/:id/tiers` per **tutte** le fasce (già fatto nei prototipi: `_loadTiers` + push tier in `_orgEmitReal`; replicare in `apps/web` se diventa quello canonico).
- [ ] Mantenere **sito↔app speculari**; la validazione resta **solo-app**.

---

## FASE 7 — Infra / Ops (produzione)

- [x] **Blueprint `render.yaml`** in root: servizio web `plan: starter` (always-on), Postgres gestito collegato via `DATABASE_URL`, migration allo start (`prisma migrate deploy`), health check su `/ready`, segreti dichiarati con `sync: false` (valori SOLO in dashboard). ⚠️ L'attivazione (piano a pagamento + inserimento segreti) resta al titolare.
- [x] **Lock distribuito (scale-out multi-istanza):** `Store.withLock` — mutex in-processo sul MemoryStore, **advisory lock transazionale Postgres** (`pg_advisory_xact_lock`) sul PrismaStore; mint ordini (`ord:<id>`) e validazione varco (`val:<ticketId>`) serializzati anche TRA istanze. Verificato su Postgres 16 reale (migration + IT test 4/4).
- [ ] **Secret manager** per tutte le chiavi; ruotare `AUTH_SECRET` (⚠️ titolare, in dashboard Render).
- [ ] **Monitoring/alerting** (Grafana su `/metrics`), **backup/restore** DB, **CI/CD** di deploy.

---

## FASE 8 — Notifiche

- [x] Email di **evento** in `src/notifications/email.ts`: `EmailSender.send` generico (Resend reale / Dev no-op), **conferma d'ordine** automatica al pagamento (best-effort: mai blocca il pagamento, mai doppia sui ritenti webhook) e **promemoria evento** via `POST /events/:id/remind` (organizzatore → possessori validi, dedup per indirizzo). Test in `email-events.test.ts`.
- [ ] SMS opzionale. Promemoria SCHEDULATO automatico: richiede una data evento strutturata (oggi `date` è testo libero, es. "21 GIU") — da fare quando si tipizza la data.

---

## FASE 9 — Mobile

- [ ] `apps/mobile` (Expo): **dev build** su device, **NFC HCE** (Android), `API_BASE` di produzione, pubblicazione **store** Apple/Google.

---

## FASE 10 — Legale / fiscale / GDPR / QA

- [ ] Privacy & custodia dati, T&C, anti-bagarinaggio normativo, **IVA**, accessibilità **AgID/WCAG**.
- [ ] **Audit** contratti, **pen-test** backend, **load test**, test su device reali.

---

## Strategia costi & NFT — decisione: NIENTE coin propria

Domanda ricorrente: "il conio NFT costa? conviene una nostra coin per ridurre i costi?". **No.**

- Siamo su **Base** (L2 Ethereum): coniare costa **frazioni di centesimo** (in rari picchi qualche centesimo). Non è lì il costo.
- Una **coin propria NON riduce il gas**: su Base il gas si paga in **ETH** comunque; un ERC-20 nostro è solo un altro token sulla stessa catena. Pagare il gas con la nostra coin richiederebbe un paymaster che paga lo stesso in ETH sotto → nessun risparmio, più complessità, anticipiamo noi l'ETH.
- Una coin aggiunge **rischio regolatorio** (in UE: MiCA, possibile e-money/strumento finanziario), volatilità, contabilità, legale. **Alza** i costi, non li abbassa.
- **Leva reale se il volume cresce:** `TinftTicket` a **conio in blocco** (ERC-1155 o batch ERC-721) per spalmare il gas su tanti biglietti; eventuale **gas sponsorship** via paymaster (il gas resta trascurabile). Ottimizzare i **costi Stripe** e l'infra, non la catena.

**Azione per Claude Code:** NON introdurre una coin. Se serve efficienza on-chain a scala, valutare batch-mint in `contracts/` (nuova variante di `TinftTicket`), con test fuzz/invarianti come gli altri.

---

## Account e chiavi da procurare (SOLO il titolare — Claude Code non può)

Inserirle **solo** nella dashboard Render / secret manager, mai nel repo.

- [ ] **Stripe** (piattaforma TINFT): `sk_live_…`, `whsec_…`, e **Stripe Connect** attivo per onboardare gli organizzatori.
- [ ] **Apple Developer** (Sign in with Apple) + **Google Cloud OAuth** (client id/secret) per il login. In alternativa un provider auth (Auth0/Clerk/Supabase).
- [ ] **SPID**: convenzione con un **aggregatore accreditato AgID** (per verifica identità ed età).
- [ ] **RPC Base** (Alchemy/Infura) per mainnet: `CHAIN_RPC_URL` + `CHAIN_ID=8453`; **chiave owner** del contratto (`CHAIN_PRIVATE_KEY`).
- [ ] **Postgres gestito** (`DATABASE_URL`) + eventuale **Redis** (`REDIS_URL`).
- [ ] **Resend** (email) già previsto: `RESEND_API_KEY`, `EMAIL_FROM` su dominio verificato.
- [ ] **Audit** dei contratti (fornitore esterno) prima della mainnet.
- [ ] Decisioni legali: privacy/T&C, IVA, se/quando serve **KYC/età**.

---

## Priorità consigliata

**Per una prima vendita reale controllata (pilot):** FASE 0 → 1 → 2 → 3 → 7.
**Per il lancio pieno:** aggiungere 4 → 5 → 6 → 8 → 9 → 10.

> Legenda: la validazione sicura (access-token + scan) e i contratti esistono già. Il grosso del lavoro rimanente è **hardening di produzione** (pagamenti live, mainnet dopo audit, identità reale, infra always-on, legale), non nuove funzionalità da inventare.
