# TINFT — Handoff DEV (stato + cosa manca per il go-live)

Per chi continua lo sviluppo. Riepilogo di ciò che è **fatto e verificato** e di ciò che
**manca**, con dove intervenire nel codice.

## Mappa del repo
- `contracts/` — Solidity 0.8.28 (Foundry). `TinftTicket` (ERC-721 + 721C, EIP-2981, anti-bagarino, export), `TinftEscrow` (secondario, tetto +10%), `TinftRoyaltySplit` (0,5/0,5), `TinftTransferValidator`. Test in `test/` (unit + **fuzz** + **invarianti**). `script/Deploy.s.sol` + `../scripts/deploy-base-sepolia.sh`.
- `services/api/` — Fastify + TypeScript. Dominio in `src/domain`, regole `src/domain/rules.ts`, servizi `src/services`, store `src/repo` (MemoryStore default + PrismaStore PostgreSQL), pagamenti `src/payments` (Fake/Stripe), on-chain `src/chain` (Fake/Viem), HTTP `src/http/server.ts`, OpenAPI `src/http/openapi.ts`, config `src/config.ts`. Prisma in `prisma/`.
- `apps/web/` — frontend (HTML autosufficienti, demo offline). `apps/mobile/` — app Expo React Native (scaffold).
- `docs/` — CHECKLIST, DEPLOY-BASE-SEPOLIA, PERSISTENCE, SECURITY, SPEC-VERIFICATA. `PROVA.md` — come testare.

## Come girare / verificare
- Contratti: `cd contracts && forge test` (**74/74**, incl. fuzz+invarianti) · `forge fmt --check`.
- Backend: `cd services/api && pnpm install && pnpm test` (**190** + 4 skip) · `pnpm typecheck` · `pnpm dev` → http://localhost:3001.
- Postgres (IT): `DATABASE_URL=… pnpm prisma:deploy && DATABASE_URL=… pnpm test src/repo/prisma-store.it.test.ts` (**3/3**).
- App: `cd apps/mobile && npm install && npx expo start`.

## ✓ Fatto e verificato
- Contratti M1–M5 + **fuzz** (royalty/fee/EIP-2981/tetto/anti-bagarino) + **invarianti** stateful (conservazione valore).
- Backend v2 completo: identità (hash CF) + OTP; club + dati societari + KYC; eventi + tier; ordini con **prevendita 10%**; mercato secondario (royalty 1%, tetto +10%, max 3/evento); validazione (token QR rotante + `/validate/scan`, 5 esiti); console org + piattaforma; contenuti.
- Auth (JWT-like, scrypt, ruoli/proprietà, rate-limit, security headers, body limit) + **validazione schema input**.
- Persistenza **PostgreSQL** (Prisma) oltre all'in-memory; pagamenti/ledger/registrazioni/webhook su tabelle.
- **Affidabilità pagamento→mint**: `payOrder` riprendibile/idempotente, `settleOrder` atomico (transazione + lock di riga), mutex per-ordine, webhook ritentabile.
- **Rimborsi/chargeback** (revoca biglietto) + **payout venditore** (lista/liquidazione).
- Stripe integrato (Fake + reale con chiavi); mint on-chain reale (Viem) verificato su anvil; **deploy Base Sepolia "chiavi in mano"** (script + runbook, dry-run su anvil).
- Robustezza prod: validazione config al boot, **shutdown pulito**, `/metrics`, request-id, `/ready`.
- **OpenAPI** (`/openapi.json` + `/docs`) + **E2E** black-box.

## ☐ COSA MANCA (per andare live) — con dove intervenire
1. **Identità SPID reale** (OIDC, aggregatore accreditato). Oggi `FakeSpid` in `src/identity` — sostituire con provider OIDC; impostare l'hash CF on-chain via `TinftTicket.setIdentity`. ✓ FATTO invece il **login veloce Apple/Google** (`POST /auth/oidc`, `src/identity/oidc.ts`): si attiva con `APPLE_CLIENT_ID`/`GOOGLE_CLIENT_ID`.
2. **Wallet custodial reale** (ERC-4337) + paymaster + recovery via SPID. Oggi `walletAddress` opzionale e mint dall'owner; integrare Turnkey/Pimlico (env già previste in `.env.example`).
3. ✓ FATTO — **P.IVA/fatturazione obbligatoria** alla creazione **club** dell'organizzatore: `createClub` richiede ragione sociale + **P.IVA** (11 cifre, anche con prefisso `IT`) + IBAN (errore `INVALID_BILLING` altrimenti), e lo schema `/clubs` li marca `required`. Estensione possibile: bloccare anche la pubblicazione eventi se l'organizzatore non ha un club con fatturazione.
4. **Wiring superfici web/app all'API reale**: oggi `apps/web/*` e `tinft-demo.html` funzionano in **mock offline**. Collegare a `services/api` (login, ordini, mercato, biglietti, console) mantenendo **sito↔app speculari** (la validazione resta solo-app).
5. **Pagamenti reali**: chiavi Stripe live + 3DS + **fatturazione IVA**/ricevute; **payout venditore** reale (KYC venditore, timing/hold, bonifici); rimborsi/chargeback con **riconciliazione** contabile.
6. **Notifiche reali**: ✓ FATTO OTP via **Resend** + email di **conferma ordine** (automatica al pagamento, best-effort) e **promemoria evento** (`POST /events/:id/remind`). Resta l'eventuale **SMS** e il promemoria schedulato (richiede data evento tipizzata).
7. **On-chain**: deploy su **Base Sepolia** ✓ FATTO → **audit** → mainnet. ✓ FATTO il **registro eventi** (`Event.onchainEventId` univoco al primo mint, sotto lock) al posto di `referenceToOnchainId`; da riverificare su anvil/Sepolia al prossimo deploy.
8. **Fidelity on-chain** + edge case (oggi non sul percorso PG).
9. **Infra/Ops**: hosting + DB gestito (blueprint `render.yaml` in root ✓); **secret manager**; **monitoring/alerting** (Grafana su `/metrics`); backup/restore DB; CI/CD di deploy. ✓ FATTO il **lock distribuito** (`Store.withLock`, advisory lock Postgres): mint e validazione serializzati anche tra istanze.
10. **Mobile**: **dev build** su device, **NFC HCE** (Android), pubblicazione **store** (Apple/Google), `API_BASE` di produzione.
11. **Legale/fiscale/GDPR**: privacy & custodia dati, anti-bagarinaggio normativo, **IVA**, T&C, **accessibilità AgID/WCAG**.
12. **QA/sicurezza**: **audit** contratti, pen-test backend, load test, test su device.

## Note di stato/limiti noti
- Default in-memory per il prototipo; PostgreSQL pronto per il deploy reale.
- Esattezza accrediti garantita a singola istanza (mutex + lock di riga); multi-istanza → lock distribuito (punto 9).
- Le superfici web sono demo (mock) finché non si esegue il punto 4.
