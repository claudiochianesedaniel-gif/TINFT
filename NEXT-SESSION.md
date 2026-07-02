# ▶️ RIPRENDI QUI (nota per la prossima sessione)

> Aggiornato: 2026-07-02. Branch di lavoro: **`claude/new-session-gbkhk3`** (tutto committato e pushato).
> Piano di lavoro dettagliato: **`TODO-CLAUDE-CODE.md`** (root) — fasi spuntate man mano.

## Stato attuale (fatto e verificato)
- **Contratti** Foundry: 74/74 (fuzz + invarianti), **già su Base Sepolia** (`TICKET_ADDRESS=0x87044b22dD89798e2ba15a38454F72AaF3Ec1F37`, `CHAIN_ID=84532`).
- **Backend** (`services/api`): **190 test + 4 skip (DB)**, `tsc` pulito. In questa sessione:
  - **FASE 1** — `gateCode` campo reale su Event (migration 4): generato/unico, `POST /gate/access` per l'aggancio staff, rotate/revoke. Seed: `NOTTE-7K2` / `JAZZ-9R3` / `OPEN-5X1`.
  - **FASE 2** — validazione serializzata per biglietto (mai due VALID concorrenti); E2E su 5 esiti, finestra rotazione, token manomesso.
  - **FASE 3** — **Stripe Connect**: account connesso per organizzatore alla creazione club (riuso + lazy per dati vecchi, migration 5), blocco messa in vendita senza onboarding, checkout ordini con `application_fee` + `transfer_data.destination`, webhook `account.updated`, rotte onboarding-link/refresh.
  - **FASE 7** — **lock distribuito** (`Store.withLock`: advisory lock Postgres, verificato su PG 16 reale) per mint/validazione in scale-out; **`render.yaml`** (starter always-on + Postgres gestito + segreti sync:false).
  - **FASE 8** — email di **conferma ordine** (best-effort al pagamento, mai doppia) e **promemoria evento** (`POST /events/:id/remind`).
  - **FASE 5** — **login Apple/Google** (`POST /auth/oidc`): verifica id_token RS256 via JWKS lato server, collega/crea account (`appleSub`/`googleSub`, migration 6). Si accende con `APPLE_CLIENT_ID`/`GOOGLE_CLIENT_ID`.
  - **FASE 4** — **registro eventi on-chain**: `Event.onchainEventId` sequenziale univoco al primo mint (sotto lock) al posto dell'hash con collisioni in `viem.ts`.
  - **FASE 6 (parziale)** — `apps/web/app-live.html`: validatore agganciato per **codice varco** (`/gate/access`, niente picker) e scansione via **QR rotante + `/validate/scan`**; console org con gateCode (ruota/revoca) e promemoria. Verificato E2E in browser reale (Playwright).

## COMPITI per la prossima sessione (in ordine)
1. **Prototipi `.dc.html` aggiornati**: NON sono in questo repo (in `design_handoff_tinft/` c'è una versione vecchia). Quando l'utente li carica: rimuovere il workaround `|VC:..|` nel `venue` (FASE 1) e il fallback HMAC locale (FASE 2), agganciare `/gate/access`, `/auth/oidc`, onboarding Stripe. Mantenere **sito↔app speculari**.
2. **Verifica on-chain del registro eventi** su anvil/Base Sepolia (Foundry non era disponibile nel container): un acquisto pagato deve emettere `TicketMinted` con l'`onchainEventId` dell'evento; `cast call <ticket> 'ownerOf(uint256)(address)' <tokenId>` = wallet compratore.
3. **Restano fasi "solo titolare"** (chiavi/account, mai nel repo): Stripe live + Connect attivo, Apple/Google client id, aggregatore SPID, RPC mainnet + audit, piano Render + Postgres gestito + rotazione `AUTH_SECRET`.

## Regole/sicurezza (invarianti)
- Mai committare segreti (chiavi private, API key, RPC con key): solo dashboard Render/secret manager.
- Non rompere i test: `pnpm test` in `services/api`, `forge test` in `contracts`.
- Validazione **solo-app** e **solo-online** (mai un VALID locale); sito↔app speculari.
- Dettagli tecnici: `DEV-HANDOFF.md` · design: `DESIGN-HANDOFF.md` · prova locale: `PROVA.md`.
