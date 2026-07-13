# ▶️ RIPRENDI QUI (nota per la prossima sessione)

> Aggiornato: 2026-07-03. Branch di lavoro: **`claude/new-session-gbkhk3`** (tutto committato e pushato).
> Piano di lavoro dettagliato: **`TODO-CLAUDE-CODE.md`** (root) — fasi spuntate man mano.

## Stato attuale (fatto e verificato)
- **Contratti** Foundry: 92/92 (fuzz + invarianti). **DECISIONI COMMITTENTE implementate** (3 task, stesso ciclo di audit): **burn definitivo all'ingresso** (`markUsed`→`_burn` per i biglietti normali; Signature `isSpecial` esenti); fee di rivendita 1% TUTTA a TINFT sul biglietto ATTIVO (prima della "Fine evento" on-chain, `eventEndOf`/`setEventEnd`; anche `used` → mero NFT) e split 0,5/0,5 solo sul mero NFT; **tetto rivendita +5%** (era +10%). L'indirizzo su Base Sepolia è la versione PRECEDENTE: **rideployare dopo l'audit esterno** (entrambe le modifiche vanno auditate insieme). Vecchio deploy (`TICKET_ADDRESS=0x87044b22dD89798e2ba15a38454F72AaF3Ec1F37`, `CHAIN_ID=84532`).
- **Backend** (`services/api`): **194 test + 4 skip (DB)** — stato `BURNED` (validazione brucia il biglietto normale, `markUsed` on-chain in ViemChain), export solo del sopravvissuto post-evento (`POST /events/:id/conclude`); fee 1% condizionale (`resaleFeeSplitCents`, `isTicketActive`: evento CONCLUDED o biglietto USED/EXPORTED = mero NFT) e tetto +5% allineati ai contratti; UI e docs aggiornate, `tsc` pulito. In questa sessione:
  - **FASE 1** — `gateCode` campo reale su Event (migration 4): generato/unico, `POST /gate/access` per l'aggancio staff, rotate/revoke. Seed: `NOTTE-7K2` / `JAZZ-9R3` / `OPEN-5X1`.
  - **FASE 2** — validazione serializzata per biglietto (mai due VALID concorrenti); E2E su 5 esiti, finestra rotazione, token manomesso.
  - **FASE 3** — **Stripe Connect**: account connesso per organizzatore alla creazione club (riuso + lazy per dati vecchi, migration 5), blocco messa in vendita senza onboarding, checkout ordini con `application_fee` + `transfer_data.destination`, webhook `account.updated`, rotte onboarding-link/refresh.
  - **FASE 7** — **lock distribuito** (`Store.withLock`: advisory lock Postgres, verificato su PG 16 reale) per mint/validazione in scale-out; **`render.yaml`** (starter always-on + Postgres gestito + segreti sync:false).
  - **FASE 8** — email di **conferma ordine** (best-effort al pagamento, mai doppia) e **promemoria evento** (`POST /events/:id/remind`).
  - **FASE 5** — **login Apple/Google** (`POST /auth/oidc`): verifica id_token RS256 via JWKS lato server, collega/crea account (`appleSub`/`googleSub`, migration 6). Si accende con `APPLE_CLIENT_ID`/`GOOGLE_CLIENT_ID`.
  - **FASE 4** — **registro eventi on-chain**: `Event.onchainEventId` sequenziale univoco al primo mint (sotto lock) al posto dell'hash con collisioni in `viem.ts`.
  - **FASE 6 (parziale)** — `apps/web/app-live.html`: validatore agganciato per **codice varco** (`/gate/access`, niente picker) e scansione via **QR rotante + `/validate/scan`**; console org con gateCode (ruota/revoca) e promemoria. Verificato E2E in browser reale (Playwright).

## Fatto anche (ultimo giro)
- **Prototipo `.dc.html` nel repo**, **senza workaround**: 0 `|VC:..|` (usa il campo `gateCode` reale in `_buildEV`/`_orgEmitReal`) e 0 fallback HMAC (`_hmac`/`_localToken`/`_validateToken` rimossi, chiave demo eliminata). Validazione **solo-online**: QR = access-token del server, scan → `POST /validate/scan`.
- **`design_handoff_tinft/tinft-api.js`**: wrapper `window.TINFT_API` verso l'API reale (base URL configurabile: `window.TINFT_API_BASE` / `?api=` / default `localhost:3001`). **Verificato end-to-end** (16/16 check: login, eventi/gateCode, gate/access, ordine→pay, QR→scan VALID→BURNED→DUPLICATE, mercato, errori 401 gestiti).
- **`design_handoff_tinft/CHECKLIST-DESIGN.md`**: checklist operativa per design.
- **Verifica completa**: contratti 92/92 + fmt, backend 194+4 skip + tsc, Postgres IT 4/4 (7 migration).

## COMPITI per la prossima sessione (in ordine) — tutto "solo titolare" o esterno
1. **Chiavi/account (mai nel repo)**: Stripe live + Connect attivo, Apple/Google client id, aggregatore SPID, piano Render + Postgres gestito + rotazione `AUTH_SECRET`.
2. **On-chain**: **audit esterno indipendente** dei contratti (i 3 task insieme, punto di partenza `contracts/SELF-AUDIT.md`) → **rideploy** (l'indirizzo su Base Sepolia è la versione precedente) → mainnet.
3. **Asset prototipo**: reintegrare i poster `assets/ev-*.png` (non nel repo) per il wiring live 100% del Prototipo App.
4. **Legale/GDPR/IVA** (FASE 10).

## Regole/sicurezza (invarianti)
- Mai committare segreti (chiavi private, API key, RPC con key): solo dashboard Render/secret manager.
- Non rompere i test: `pnpm test` in `services/api`, `forge test` in `contracts`.
- Validazione **solo-app** e **solo-online** (mai un VALID locale); sito↔app speculari.
- Dettagli tecnici: `DEV-HANDOFF.md` · design: `DESIGN-HANDOFF.md` · prova locale: `PROVA.md`.
